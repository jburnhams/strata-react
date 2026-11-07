import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

// strata-react/visual as an app uses it: a throwaway app folder with the package and its peers
// linked into node_modules, a TypeScript config loaded through Vite, the strata-visual command
// run from the built bin, and real Chromium. The app is a page with no stories that fetches its
// data, so this is route mode with MSW states, the case strata-listory needs.

const root = fileURLToPath(new URL("../..", import.meta.url));
const bin = join(root, "bin/strata-visual.js");
let app: string;

function run(args: string[], env: Record<string, string> = {}) {
  const r = spawnSync(process.execPath, [bin, ...args], { cwd: app, encoding: "utf8", env: { ...process.env, CI: "", ...env }, timeout: 120_000 });
  return { code: r.status, out: `${r.stdout}${r.stderr}` };
}

function config(states: string, handlers = `[greeting("Kiln 2 is cooling")]`) {
  writeFileSync(
    join(app, "strata-visual.config.ts"),
    `import { defineVisualConfig } from "strata-react/visual";
import { delay, http, HttpResponse } from "msw";
const greeting = (text: string) => http.get("/api/greeting", () => HttpResponse.json({ text }));
export default defineVisualConfig({
  themes: ["light", "dark"],
  app: {
    dir: "dist",
    base: "/app/",
    handlers: ${handlers},
    routes: [{ name: "home", path: "/", states: ${states} }],
  },
});
`,
  );
}

beforeAll(() => {
  app = mkdtempSync(join(tmpdir(), "strata-visual-app-"));
  mkdirSync(join(app, "node_modules"));
  symlinkSync(root, join(app, "node_modules/strata-react"), "dir");
  for (const dep of ["msw", "vite", "playwright"]) symlinkSync(join(root, "node_modules", dep), join(app, "node_modules", dep), "dir");
  writeFileSync(join(app, "package.json"), JSON.stringify({ name: "app", type: "module", devDependencies: { playwright: "1.63.0" } }));
  // The app: shows that it is loading, fetches its greeting and renders it or an error, light or
  // dark from the .dark class.
  mkdirSync(join(app, "dist"));
  writeFileSync(
    join(app, "dist/index.html"),
    `<!doctype html><html><head><style>
  body { margin: 0; font: 20px/1.4 sans-serif; background: #fafaf8; color: #222; }
  .dark body { background: #1c1b19; color: #eee; }
  h1 { margin: 16px; font-size: 24px; }
</style></head><body><div id="root"></div><script type="module">
  const root = document.getElementById("root");
  root.innerHTML = "<p aria-busy='true'>Loading the kiln room</p>";
  const r = await fetch("/api/greeting");
  root.innerHTML = r.ok ? "<h1></h1>" : "<p role='alert'>The server could not answer.</p>";
  if (r.ok) root.firstChild.textContent = (await r.json()).text;
</script></body></html>`,
  );
}, 60_000);

afterAll(() => rmSync(app, { recursive: true, force: true }));

describe("strata-visual on an app's routes", () => {
  it("prints its usage", () => {
    const r = run(["--help"]);
    expect(r.code).toBe(0);
    expect(r.out).toContain("Usage: strata-visual");
  });

  it("writes a baseline per state and theme, then matches them", () => {
    config(`{ ready: [], error: [http.get("/api/greeting", () => new HttpResponse(null, { status: 503 }))] }`);
    const first = run(["--update"]);
    expect(first.out).toContain("Wrote 4 baselines.");
    expect(first.code).toBe(0);
    const baselines = join(app, "tests/visual/baselines");
    expect(readdirSync(baselines).sort()).toEqual([
      ".strata-visual.json",
      "home--error--wide--dark.png",
      "home--error--wide--light.png",
      "home--ready--wide--dark.png",
      "home--ready--wide--light.png",
    ]);
    expect(JSON.parse(readFileSync(join(baselines, ".strata-visual.json"), "utf8"))).toMatchObject({ chromium: expect.any(String) });
    // Light and dark differ, and so do the two states.
    const png = (n: string) => readFileSync(join(baselines, `${n}.png`));
    expect(png("home--ready--wide--light").equals(png("home--ready--wide--dark"))).toBe(false);
    expect(png("home--ready--wide--light").equals(png("home--error--wide--light"))).toBe(false);

    const second = run([]);
    expect(second.out).toContain("4 of 4 screenshots match their baselines.");
    expect(second.code).toBe(0);
  }, 120_000);

  it("fails on a changed screen and writes actual, expected and diff images", () => {
    config(`{ ready: [http.get("/api/greeting", () => HttpResponse.json({ text: "Kiln 2 is safe to open" }))], error: [http.get("/api/greeting", () => new HttpResponse(null, { status: 503 }))] }`);
    const r = run([]);
    expect(r.code).toBe(1);
    expect(r.out).toMatch(/changed {2}home--ready--wide--light\.png: (size|\d+ pixels)/);
    expect(r.out).toContain("2 of 4 screenshots match");
    const output = join(app, "tests/visual/output");
    for (const suffix of ["actual", "expected"]) expect(existsSync(join(output, `home--ready--wide--light.${suffix}.png`))).toBe(true);
  }, 120_000);

  it("fails a shot whose page makes a request no handler answers", () => {
    config(`{ ready: [] }`, "[]");
    const r = run(["--filter", "home--ready--wide--light"]);
    expect(r.code).toBe(1);
    expect(r.out).toContain("error    home--ready--wide--light.png: no handler for GET /api/greeting");
  }, 120_000);

  it("exits with an error, and does not hang, on a bad route name or concurrency", () => {
    writeFileSync(
      join(app, "strata-visual.config.ts"),
      `export default { app: { dir: "dist", routes: [{ name: "Home page", path: "/" }] } };\n`,
    );
    const name = run([]);
    expect(name.code).toBe(1);
    expect(name.out).toContain('route name "Home page" must be lower-case');
    config(`{ ready: [] }`);
    const workers = run(["--concurrency", "four"]);
    expect(workers.code).toBe(1);
    expect(workers.out).toContain("concurrency must be a whole number");
  }, 60_000);

  it("reports obsolete baselines, removes them on update, and in CI fails a shot with no baseline", () => {
    config(`{ ready: [], loading: [http.get("/api/greeting", async () => { await delay("infinite"); return HttpResponse.json({}); })] }`);
    const ci = run([], { CI: "true" });
    expect(ci.code).toBe(1);
    expect(ci.out).toContain("new      home--loading--wide--light.png");
    expect(ci.out).toContain("obsolete home--error--wide--light.png (run with --update to remove)");
    const update = run(["--update"]);
    expect(update.code).toBe(0);
    expect(update.out).toContain("removed 2 obsolete");
    expect(readdirSync(join(app, "tests/visual/baselines")).filter((f) => f.includes("error"))).toEqual([]);
  }, 120_000);
});

describe("strata-react/visual from the built package", () => {
  it("exports the runner, the shot builders and the comparison", async () => {
    const mod = await import(pathToFileURL(join(root, "dist/visual.js")).href);
    for (const name of ["runVisual", "defineVisualConfig", "storybookShots", "routeShots", "compare", "serveStatic", "viewports"]) {
      expect(mod[name], name).toBeDefined();
    }
  });

  it("serves a build with history fallback for pages only, under its base", async () => {
    const { serveStatic } = await import(pathToFileURL(join(root, "dist/visual.js")).href);
    const server = await serveStatic(join(app, "dist"), { spa: true, base: "/app/" });
    try {
      const page = await fetch(new URL("review/42", server.url), { headers: { accept: "text/html" } });
      expect(page.status).toBe(200);
      expect(await page.text()).toContain('<div id="root">');
      expect((await fetch(new URL("api/missing", server.url), { headers: { accept: "application/json" } })).status).toBe(404);
      expect((await fetch(new URL("/elsewhere", server.url), { headers: { accept: "text/html" } })).status).toBe(404);
      expect((await fetch(`${server.url}..%2f..%2fpackage.json`)).status).toBe(404);
    } finally {
      await server.close();
    }
  });
});
