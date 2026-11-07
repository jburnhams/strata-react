import { describe, expect, it } from "vitest";
import { existsSync, mkdtempSync, mkdirSync, readFileSync, readdirSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { compile } from "@tailwindcss/node";
import { Scanner } from "@tailwindcss/oxide";

// The built package, as an app sees it: its exports resolve, and its stylesheet compiles with
// Tailwind into the component classes on the app's theme, with the stock namespaces gone.

const root = fileURLToPath(new URL("../..", import.meta.url));
const pkg = JSON.parse(readFileSync(join(root, "package.json"), "utf8"));

describe("package exports", () => {
  it("points every export at a file that exists", () => {
    for (const [key, target] of Object.entries<Record<string, string> | string>(pkg.exports)) {
      const files = typeof target === "string" ? [target] : Object.values(target);
      for (const f of files) expect(existsSync(join(root, f)), `${key} → ${f}`).toBe(true);
    }
  });

  it("exports the components and helpers from the ESM build", async () => {
    const mod = await import(pathToFileURL(join(root, "dist/index.js")).href);
    for (const name of ["Button", "IconButton", "AsyncButton", "DataView", "DataTable", "VirtualList", "LineChart", "AppShell", "Tabs", "Done", "ThemeProvider", "useColorScheme", "ColorSchemeChoice", "colorSchemeScript", "useLoad", "toLoad", "fetchJson", "cn", "format"]) {
      expect(mod[name], name).toBeDefined();
    }
    const testing = await import(pathToFileURL(join(root, "dist/testing.js")).href);
    expect(testing.renderWithStrata).toBeTypeOf("function");
  });

  it("keeps React, the router and TanStack Query out of the bundle", () => {
    const js = readdirSync(join(root, "dist"))
      .filter((f) => f.endsWith(".js"))
      .map((f) => readFileSync(join(root, "dist", f), "utf8"))
      .join("\n");
    for (const dep of ["react", "react-router", "@tanstack/react-query", "@tanstack/react-table", "@tanstack/react-virtual"]) {
      expect(js).toMatch(new RegExp(`from "${dep.replace("/", "\\/")}"`));
    }
    expect(js).not.toContain("__SECRET_INTERNALS");
  });
});

describe("strata.css in an app", () => {
  async function compileApp() {
    const app = mkdtempSync(join(tmpdir(), "strata-app-"));
    mkdirSync(join(app, "node_modules"));
    symlinkSync(root, join(app, "node_modules/strata-react"), "dir");
    for (const dep of ["tailwindcss"]) symlinkSync(join(root, "node_modules", dep), join(app, "node_modules", dep), "dir");
    writeFileSync(join(app, "theme.css"), readFileSync(join(root, ".storybook/theme.generated.css"), "utf8"));
    writeFileSync(join(app, "page.tsx"), `<div className="bg-indigo-500 text-sm rounded-xl shadow-lg grid gap-4 bg-primary" />`);
    const input = `@import "tailwindcss";\n@import "strata-react/strata.css";\n@import "./theme.css";\n@source "./page.tsx";\n`;
    try {
      const compiler = await compile(input, { base: app, onDependency: () => undefined });
      const scanner = new Scanner({ sources: compiler.sources });
      return compiler.build(scanner.scan());
    } finally {
      rmSync(app, { recursive: true, force: true });
    }
  }

  it("generates the classes the built components use", async () => {
    const css = await compileApp();
    for (const cls of [".type-label", ".rounded-control", ".bg-primary", ".border-input", ".bg-danger-subtle", ".transition-state", ".press", ".h-\\(--control-h\\)"]) {
      expect(css, cls).toContain(cls);
    }
  });

  it("removes Tailwind's stock palette, sizes, radii and shadows", async () => {
    const css = await compileApp();
    for (const cls of [".bg-indigo-500", ".text-sm", ".rounded-xl", ".shadow-lg"]) expect(css, cls).not.toContain(cls);
    expect(css).toContain(".gap-4");
  });
});
