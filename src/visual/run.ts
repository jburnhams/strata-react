// Running a suite: serve each target, take its shots a few at a time in one Chromium, compare
// each with its committed baseline, and report. The rules are the library's own, so an app's
// suite fails for the same reasons Strata's does: a changed screenshot, a page or console
// error, an unanswered request, and in CI a shot with no baseline (it was added without one).
//
// Baselines are only comparable when written by the same Chromium on the same platform, which
// is why Playwright is pinned to an exact version. A run records both next to the baselines
// (`.strata-visual.json`) when it writes them, and says so when a later run differs.
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import type { Browser } from "playwright";
import { capture } from "./capture";
import { compare, decode } from "./compare";
import { serveStatic, type StaticServer } from "./serve";
import { defaultThemes, routeShots, storybookShots } from "./targets";
import type { Shot, VisualConfig, VisualReport } from "./types";

/** Returns the config unchanged; it exists so a config file is type-checked. */
export function defineVisualConfig(config: VisualConfig): VisualConfig {
  return config;
}

/** Options for one run, usually from the command line. */
export interface RunOptions {
  /** Folder the config's paths are relative to. Default `process.cwd()`. */
  cwd?: string;
  /** Write the screenshots as the baselines and remove obsolete ones, instead of comparing. */
  update?: boolean;
  /** Only shots whose name contains this text (obsolete baselines are then not reported). */
  filter?: string;
  /** Fail when a shot has no baseline. Default: when the `CI` environment variable is set. */
  ci?: boolean;
  /** Progress lines; default none. */
  log?: (line: string) => void;
}

const metaFile = ".strata-visual.json";
interface Meta {
  chromium: string;
  platform: string;
}

interface Batch {
  shots: Shot[];
  server?: StaticServer;
  baseUrl: string;
  blockServiceWorkers: boolean;
  onUnhandledRequest?: "error" | "bypass";
}

/** Screenshots every shot the config describes, compares with the baselines, and reports. */
export async function runVisual(config: VisualConfig, options: RunOptions = {}): Promise<VisualReport> {
  const cwd = resolve(options.cwd ?? process.cwd());
  const baselineDir = resolve(cwd, config.baselines ?? "tests/visual/baselines");
  const outputDir = resolve(cwd, config.output ?? "tests/visual/output");
  const themes = config.themes ?? defaultThemes;
  const update = options.update ?? false;
  const ci = options.ci ?? Boolean(process.env.CI);
  const log = options.log ?? (() => undefined);
  const concurrency = config.concurrency ?? 4;
  // A worker count that is not a positive integer would start no workers and report an empty,
  // passing run, so it is refused up front.
  if (!Number.isInteger(concurrency) || concurrency < 1) throw new Error(`concurrency must be a whole number of pages, 1 or more (got ${String(config.concurrency)})`);
  const report: VisualReport = { total: 0, same: 0, changed: [], added: [], obsolete: [], errors: [], warnings: pinWarnings(cwd), updated: update, failed: false };

  const batches: Batch[] = [];
  try {
    if (config.storybook !== undefined) {
      const target = typeof config.storybook === "string" ? { dir: config.storybook } : config.storybook;
      const dir = resolve(cwd, target.dir ?? "storybook-static");
      if (!existsSync(join(dir, "index.json"))) throw new Error(`${join(dir, "index.json")} not found: build Storybook first (storybook build)`);
      // Shots first: if building them throws, no server is left running to hold the process open.
      const shots = storybookShots({ ...target, dir }, themes);
      const batch: Batch = { shots, baseUrl: "", blockServiceWorkers: false };
      batches.push(batch);
      batch.server = await serveStatic(dir);
      batch.baseUrl = batch.server.url;
    }
    if (config.app !== undefined) {
      const app = config.app;
      if (!app.dir === !app.url) throw new Error("app needs exactly one of dir (a build to serve) or url (a running server)");
      const shots = routeShots(app, themes);
      const batch: Batch = { shots, baseUrl: "", blockServiceWorkers: true, onUnhandledRequest: app.onUnhandledRequest ?? "error" };
      batches.push(batch);
      if (app.dir) {
        const dir = resolve(cwd, app.dir);
        if (!existsSync(join(dir, "index.html"))) throw new Error(`${join(dir, "index.html")} not found: build the app first`);
        batch.server = await serveStatic(dir, { spa: true, base: app.base });
        batch.baseUrl = batch.server.url;
      } else {
        batch.baseUrl = new URL(`${(app.base ?? "/").replace(/^\/*/, "/").replace(/\/*$/, "/")}`, app.url).href;
      }
    }
    if (!batches.length) throw new Error("nothing to screenshot: the config needs storybook or app");

    const all = batches.flatMap((b) => b.shots);
    const names = new Set<string>();
    for (const s of all) {
      if (names.has(s.name)) throw new Error(`two shots are named ${s.name}: give routes and states distinct names`);
      names.add(s.name);
    }
    for (const b of batches) b.shots = b.shots.filter((s) => !options.filter || s.name.includes(options.filter));
    report.total = batches.reduce((n, b) => n + b.shots.length, 0);

    mkdirSync(baselineDir, { recursive: true });
    rmSync(outputDir, { recursive: true, force: true });
    mkdirSync(outputDir, { recursive: true });

    const { chromium } = await import("playwright").catch(() => {
      throw new Error("strata-visual needs Playwright: npm install -D -E playwright, then npx playwright install chromium");
    });
    // Font hinting and LCD anti-aliasing off and an sRGB profile: the same pixels on every machine.
    const browser = await chromium.launch({ args: ["--font-render-hinting=none", "--disable-lcd-text", "--force-color-profile=srgb"] });
    const meta: Meta = { chromium: browser.version(), platform: `${process.platform}-${process.arch}` };
    try {
      for (const batch of batches) await runBatch(browser, batch, { config, baselineDir, outputDir, update, report, log });
    } finally {
      await browser.close();
    }

    const pngs = readdirSync(baselineDir).filter((f) => f.endsWith(".png"));
    report.obsolete = options.filter ? [] : pngs.filter((f) => !names.has(f.slice(0, -4)));
    if (update) {
      for (const f of report.obsolete) rmSync(join(baselineDir, f));
      if (!options.filter) writeFileSync(join(baselineDir, metaFile), `${JSON.stringify(meta, null, 2)}\n`);
    } else if (report.changed.length) {
      const written = readMeta(baselineDir);
      if (written && (written.chromium !== meta.chromium || written.platform !== meta.platform)) {
        report.warnings.push(
          `the baselines were written by Chromium ${written.chromium} on ${written.platform}; this run used Chromium ${meta.chromium} on ${meta.platform}, so some differences may be the browser, not the app`,
        );
      }
    }
  } finally {
    for (const b of batches) await b.server?.close();
  }
  report.failed = Boolean(report.errors.length || report.changed.length || (ci && !update && report.added.length));
  return report;
}

async function runBatch(
  browser: Browser,
  batch: Batch,
  ctx: { config: VisualConfig; baselineDir: string; outputDir: string; update: boolean; report: VisualReport; log: (l: string) => void },
) {
  const { baselineDir, outputDir, update, report } = ctx;
  const shoot = async (shot: Shot) => {
    const file = `${shot.name}.png`;
    try {
      const { png, problems } = await capture(browser, shot, {
        baseUrl: batch.baseUrl,
        time: ctx.config.time,
        timezone: ctx.config.timezone,
        locale: ctx.config.locale,
        blockServiceWorkers: batch.blockServiceWorkers,
        onUnhandledRequest: batch.onUnhandledRequest,
      });
      if (problems.length) report.errors.push(`${file}: ${problems.join(" | ")}`);
      const baselinePath = join(baselineDir, file);
      if (update || !existsSync(baselinePath)) {
        if (!update) report.added.push(file);
        writeFileSync(baselinePath, png);
        if (!update) writeFileSync(join(outputDir, file), png);
        return;
      }
      const expected = readFileSync(baselinePath);
      const result = compare(decode(expected), decode(png));
      if (result.same) {
        report.same++;
        return;
      }
      report.changed.push(`${file}: ${result.reason}`);
      writeFileSync(join(outputDir, `${shot.name}.actual.png`), png);
      writeFileSync(join(outputDir, `${shot.name}.expected.png`), expected);
      if (result.diff) writeFileSync(join(outputDir, `${shot.name}.diff.png`), result.diff);
    } catch (e) {
      report.errors.push(`${file}: ${(e instanceof Error ? e.message : String(e)).split("\n")[0]}`);
    } finally {
      ctx.log(file);
    }
  };
  // A few pages at once: each shot has its own context, so they cannot affect each other.
  const queue = [...batch.shots];
  await Promise.all(
    Array.from({ length: ctx.config.concurrency ?? 4 }, async () => {
      for (let shot = queue.shift(); shot; shot = queue.shift()) await shoot(shot);
    }),
  );
}

function readMeta(dir: string): Meta | undefined {
  try {
    return JSON.parse(readFileSync(join(dir, metaFile), "utf8")) as Meta;
  } catch {
    return undefined;
  }
}

/** A warning when the app's package.json lets Playwright float, since each version brings its own Chromium. */
export function pinWarnings(cwd: string): string[] {
  let pkg: { dependencies?: Record<string, string>; devDependencies?: Record<string, string> };
  try {
    pkg = JSON.parse(readFileSync(join(cwd, "package.json"), "utf8"));
  } catch {
    return [];
  }
  const deps = { ...pkg.dependencies, ...pkg.devDependencies };
  return ["playwright", "@playwright/test"]
    .filter((name) => deps[name] !== undefined && !/^\d+\.\d+\.\d+$/.test(deps[name]))
    .map(
      (name) =>
        `${name} is "${deps[name]}" in package.json: pin an exact version (npm install -D -E ${name}) so CI and the machine that wrote the baselines render with the same Chromium`,
    );
}

/** The report as the lines the command prints. */
export function formatReport(report: VisualReport): string {
  const lines = [
    report.updated
      ? `Wrote ${report.total} baselines${report.obsolete.length ? `, removed ${report.obsolete.length} obsolete` : ""}.`
      : `${report.same} of ${report.total} screenshots match their baselines.`,
    ...report.changed.map((l) => `changed  ${l}`),
    ...report.added.map((l) => `new      ${l} (baseline written; commit it)`),
    ...report.obsolete.map((l) => `obsolete ${l}${report.updated ? " (removed)" : " (run with --update to remove)"}`),
    ...report.errors.map((l) => `error    ${l}`),
    ...report.warnings.map((l) => `warning  ${l}`),
  ];
  if (report.failed) {
    lines.push("", "Diffs are in the output folder (tests/visual/output by default). Look at them; if the change is intended, run with --update and commit the baselines.");
  }
  return lines.join("\n");
}
