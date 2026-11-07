// The strata-visual command. With no arguments it reads strata-visual.config.(ts|mts|js|mjs)
// from the current folder; `--storybook <dir>` screenshots a built Storybook with no config at
// all (that is how strata-react runs its own suite). A TypeScript config is loaded through Vite's
// module runner when Vite is installed, so it can import the app's MSW handlers and fixtures
// with the same extensionless imports and aliases the app's code uses.
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { parseArgs } from "node:util";
import { formatReport, runVisual } from "./run";
import type { VisualConfig } from "./types";

const usage = `Usage: strata-visual [options]

Screenshots a built Storybook and/or an app's routes in light and dark, and compares each
with its committed baseline (Playwright Chromium + pixelmatch).

  --config <file>       config file (default: strata-visual.config.{ts,mts,js,mjs} here)
  --storybook <dir>     screenshot this Storybook build (overrides the config's storybook)
  --update              write the screenshots as the baselines and remove obsolete ones
  --filter <text>       only shots whose name contains the text
  --baselines <dir>     where baselines live (default tests/visual/baselines)
  --output <dir>        where diffs go (default tests/visual/output)
  --concurrency <n>     pages at once (default 4)
  --help                show this
`;

const configNames = ["strata-visual.config.ts", "strata-visual.config.mts", "strata-visual.config.js", "strata-visual.config.mjs"];

/** Loads a config file's default export. */
export async function loadConfig(file: string): Promise<VisualConfig> {
  if (/\.[cm]?ts$/.test(file)) {
    const vite = await import("vite").catch(() => undefined);
    if (vite?.runnerImport) {
      const { module } = await vite.runnerImport<{ default: VisualConfig }>(file);
      return module.default;
    }
  }
  const mod = (await import(pathToFileURL(file).href)) as { default: VisualConfig };
  return mod.default;
}

/** Runs the command with the given arguments and returns the exit code. */
export async function main(argv: readonly string[], cwd = process.cwd()): Promise<number> {
  let values;
  try {
    ({ values } = parseArgs({
      args: [...argv],
      options: {
        config: { type: "string" },
        storybook: { type: "string" },
        update: { type: "boolean" },
        filter: { type: "string" },
        baselines: { type: "string" },
        output: { type: "string" },
        concurrency: { type: "string" },
        help: { type: "boolean" },
      },
    }));
  } catch (e) {
    console.error(`${(e as Error).message}\n\n${usage}`);
    return 2;
  }
  if (values.help) {
    console.log(usage);
    return 0;
  }

  let config: VisualConfig = {};
  let base = cwd;
  const file = values.config ? resolve(cwd, values.config) : configNames.map((n) => resolve(cwd, n)).find((f) => existsSync(f));
  if (values.config && !existsSync(file!)) {
    console.error(`strata-visual: ${values.config} not found`);
    return 2;
  }
  if (file) {
    config = await loadConfig(file);
    base = resolve(file, "..");
  }
  if (values.storybook) config = { ...config, storybook: { ...(typeof config.storybook === "object" ? config.storybook : {}), dir: resolve(cwd, values.storybook) } };
  if (values.baselines) config = { ...config, baselines: resolve(cwd, values.baselines) };
  if (values.output) config = { ...config, output: resolve(cwd, values.output) };
  if (values.concurrency) config = { ...config, concurrency: Number(values.concurrency) };
  if (config.storybook === undefined && config.app === undefined) {
    if (existsSync(resolve(cwd, "storybook-static/index.json"))) config = { ...config, storybook: "storybook-static" };
    else {
      console.error(`strata-visual: no config file and no Storybook build here.\n\n${usage}`);
      return 2;
    }
  }

  try {
    const report = await runVisual(config, { cwd: base, update: values.update, filter: values.filter });
    console.log(formatReport(report));
    return report.failed ? 1 : 0;
  } catch (e) {
    console.error(`strata-visual: ${(e as Error).message}`);
    return 1;
  }
}
