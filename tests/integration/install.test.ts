import { afterAll, beforeAll, describe, expect, it } from "vite-plus/test";
import { execFileSync } from "node:child_process";
import {
  cpSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { compile } from "@tailwindcss/node";
import { Scanner } from "@tailwindcss/oxide";

// The package as npm lays it out in an app: the files package.json publishes, copied as real files
// into the app's node_modules (not a symlink, which resolves back into this repo and hides the
// case), in a git repository that ignores node_modules. Tailwind's automatic detection skips
// node_modules, so the components' classes are generated only because dist/strata.css names its
// own files with @source; the app adds nothing (issue #24 found an app adding the line by hand).

const root = fileURLToPath(new URL("../..", import.meta.url));
const pkg = JSON.parse(readFileSync(join(root, "package.json"), "utf8"));
let app: string;

beforeAll(() => {
  app = mkdtempSync(join(tmpdir(), "strata-installed-"));
  // Copied, not packed: `npm pack` runs `prepare` even with --ignore-scripts, which would clean
  // dist/ under the other integration tests while they run.
  const target = join(app, "node_modules/strata-react");
  mkdirSync(target, { recursive: true });
  for (const f of [...pkg.files, "package.json"])
    cpSync(join(root, f), join(target, f), { recursive: true });
  symlinkSync(join(root, "node_modules/tailwindcss"), join(app, "node_modules/tailwindcss"), "dir");
  // strata.css loads this plugin with @plugin; npm installs a dependency of strata-react beside it.
  symlinkSync(
    join(root, "node_modules/tailwindcss-react-aria-components"),
    join(app, "node_modules/tailwindcss-react-aria-components"),
    "dir",
  );
  // The default faces are dependencies too: their @font-face rules are inlined by Tailwind from beside strata-react.
  mkdirSync(join(app, "node_modules/@fontsource-variable"), { recursive: true });
  for (const face of ["instrument-sans", "jetbrains-mono"]) {
    symlinkSync(
      join(root, "node_modules/@fontsource-variable", face),
      join(app, "node_modules/@fontsource-variable", face),
      "dir",
    );
  }
  execFileSync("git", ["init", "-q"], { cwd: app });
  writeFileSync(join(app, ".gitignore"), "node_modules\n");
  mkdirSync(join(app, "src"));
  writeFileSync(
    join(app, "src/page.tsx"),
    `export const Page = () => <main className="grid gap-4" />;`,
  );
}, 60_000);

afterAll(() => rmSync(app, { recursive: true, force: true }));

/** Compiles the app's stylesheet the way @tailwindcss/vite and the CLI do: the stylesheet's own
 * sources plus automatic detection from the app's root, which honours .gitignore. */
async function compileApp() {
  const input = `@import "tailwindcss";\n@import "strata-react/strata.css";\n`;
  const compiler = await compile(input, { base: app, onDependency: () => undefined });
  const scanner = new Scanner({
    sources: [{ base: app, pattern: "**/*", negated: false }, ...compiler.sources],
  });
  return compiler.build(scanner.scan());
}

describe("strata-react installed from its tarball", () => {
  it("publishes the built package and not the source", () => {
    expect(pkg.files).toEqual(expect.arrayContaining(["dist", "bin"]));
    expect(pkg.files).not.toContain("src");
  });

  it("generates the components' classes with no @source in the app", async () => {
    const css = await compileApp();
    expect(css).toContain(".grid");
    // Used only inside the built components, never by the app's page.
    for (const cls of [
      ".rounded-control",
      ".press",
      ".transition-state",
      ".type-label",
      ".h-\\(--control-h\\)",
    ]) {
      expect(css, cls).toContain(cls);
    }
  });

  it("has the hooks a second look reads, all inert by default (#383): a heading face, a figure ink, a surface image", async () => {
    const css = await compileApp();
    expect(css).toContain("var(--type-heading-font, inherit)");
    expect(css).toMatch(/\.type-figure\s*{[^}]*color:\s*var\(--figure-ink, inherit\)/);
    expect(css).toMatch(
      /\[data-part="pane"\][^{]*{[^}]*background-image:\s*var\(--surface-image, none\)/,
    );
  });

  it("brings its default faces with it: Instrument Sans and JetBrains Mono @font-face rules and the role names, with no app install step and no theme file", async () => {
    const css = await compileApp();
    expect(css).toMatch(/@font-face\s*{[^}]*font-family:\s*["']?Instrument Sans Variable["']?/);
    expect(css).toMatch(/@font-face\s*{[^}]*font-family:\s*["']?JetBrains Mono Variable["']?/);
    expect(css).toMatch(/url\(["']?\.\/files\/instrument-sans-latin-wdth-normal\.woff2/);
    expect(css).toMatch(/--font-sans:\s*"Instrument Sans Variable",\s*ui-sans-serif/);
    expect(css).toContain(".bg-primary");
    expect(css).not.toContain("Geist Variable");
  });

  it("moves both control heights with density, and a coarse pointer still wins (issue #117)", async () => {
    const css = await compileApp();
    expect(css).toMatch(/\[data-density="default"\]\s*\{[^}]*--control-h:\s*2\.5rem/);
    expect(css).toMatch(
      /\[data-density="compact"\]\s*\{[^}]*--control-h:\s*2rem[^}]*--control-h-sm:\s*1\.75rem/,
    );
    // The small icon button and the small control height are generated for components only.
    expect(css).toContain(".size-\\(--control-h-sm\\)");
    // After the density rules: a coarse pointer gives every density 44px targets.
    expect(css.lastIndexOf("pointer: coarse")).toBeGreaterThan(
      css.indexOf('[data-density="compact"]'),
    );
  });

  it("would miss them without the library's own @source line", async () => {
    const sheet = join(app, "node_modules/strata-react/dist/strata.css");
    const original = readFileSync(sheet, "utf8");
    writeFileSync(sheet, original.replace(/@source "\.\/\*\.js";/, ""));
    try {
      const css = await compileApp();
      expect(css).not.toContain(".rounded-control");
    } finally {
      writeFileSync(sheet, original);
    }
  });
});
