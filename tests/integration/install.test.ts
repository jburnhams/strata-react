import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { execFileSync } from "node:child_process";
import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
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
  for (const f of [...pkg.files, "package.json"]) cpSync(join(root, f), join(target, f), { recursive: true });
  symlinkSync(join(root, "node_modules/tailwindcss"), join(app, "node_modules/tailwindcss"), "dir");
  // strata.css loads this plugin with @plugin; npm installs a dependency of strata-react beside it.
  symlinkSync(join(root, "node_modules/tailwindcss-react-aria-components"), join(app, "node_modules/tailwindcss-react-aria-components"), "dir");
  execFileSync("git", ["init", "-q"], { cwd: app });
  writeFileSync(join(app, ".gitignore"), "node_modules\n");
  writeFileSync(join(app, "theme.css"), readFileSync(join(root, ".storybook/theme.generated.css"), "utf8"));
  mkdirSync(join(app, "src"));
  writeFileSync(join(app, "src/page.tsx"), `export const Page = () => <main className="grid gap-4" />;`);
}, 60_000);

afterAll(() => rmSync(app, { recursive: true, force: true }));

/** Compiles the app's stylesheet the way @tailwindcss/vite and the CLI do: the stylesheet's own
 * sources plus automatic detection from the app's root, which honours .gitignore. */
async function compileApp() {
  const input = `@import "tailwindcss";\n@import "strata-react/strata.css";\n@import "./theme.css";\n`;
  const compiler = await compile(input, { base: app, onDependency: () => undefined });
  const scanner = new Scanner({ sources: [{ base: app, pattern: "**/*", negated: false }, ...compiler.sources] });
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
    for (const cls of [".rounded-control", ".press", ".transition-state", ".type-label", ".h-\\(--control-h\\)"]) {
      expect(css, cls).toContain(cls);
    }
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
