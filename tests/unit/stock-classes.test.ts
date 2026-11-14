import { describe, expect, it } from "vitest";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { findStockClasses } from "../../src/migrate/stock-classes";
import { main } from "../../src/migrate/cli";

// The stock-class finder (issue #225): what strata.css would stop compiling, found in an app's source as text.

const names = (source: string, file?: string) => findStockClasses(source, file).map((f) => f.className);

describe("findStockClasses", () => {
  it("finds stock colours, type sizes, radii, shadows and serif in class strings, whatever the quotes", () => {
    const tsx = `<div className="bg-stone-100 text-sm rounded-xl shadow-lg font-serif" />
      <p className={cn('text-emerald-600', \`border-red-200\`)} />`;
    expect(names(tsx)).toEqual(["bg-stone-100", "text-sm", "rounded-xl", "shadow-lg", "font-serif", "text-emerald-600", "border-red-200"]);
  });

  it("reads through variants, important marks and opacity, and says which line", () => {
    const found = findStockClasses(`<a\n className="dark:hover:bg-zinc-900/50 !text-white md:text-2xl" />`);
    expect(found.map((f) => [f.line, f.className, f.kind])).toEqual([
      [2, "dark:hover:bg-zinc-900/50", "colour"],
      [2, "text-white", "colour"],
      [2, "md:text-2xl", "text size"],
    ]);
  });

  it("leaves Strata's own roles, layout classes and the classes Tailwind never themed alone", () => {
    const fine = `<div className="bg-primary text-muted-foreground border-border bg-danger-subtle type-body-sm rounded-control rounded-pill shadow-overlay grid gap-4 p-2 font-sans text-left text-balance bg-transparent rounded-full rounded-none shadow-none" />`;
    expect(names(fine)).toEqual([]);
  });

  it("reads only @apply lines of a stylesheet", () => {
    const css = `.card { @apply bg-stone-100 rounded-lg; }\n/* the old bg-stone-900 */\n.x { color: var(--foreground); }`;
    expect(names(css, "app.css")).toEqual(["bg-stone-100", "rounded-lg"]);
    expect(names(css, "app.tsx")).toContain("bg-stone-900");
  });

  it("follows an @apply written over several lines to its semicolon, with each line's number", () => {
    const css = `.card {\n  @apply\n    bg-stone-100\n    text-sm;\n  color: red;\n}\n.b { @apply rounded-xl\n    shadow-lg; }\n.c { margin: 0 bg-stone-900; }`;
    expect(findStockClasses(css, "app.css").map((f) => [f.line, f.className])).toEqual([
      [3, "bg-stone-100"],
      [4, "text-sm"],
      [7, "rounded-xl"],
      [8, "shadow-lg"],
    ]);
  });

  it("says what to use instead", () => {
    expect(findStockClasses("text-sm")[0].instead).toContain("type-");
    expect(findStockClasses("bg-red-500")[0].instead).toContain("bg-danger-subtle");
  });
});

describe("strata-stock-classes", () => {
  function app(files: Record<string, string>) {
    const dir = mkdtempSync(join(tmpdir(), "stock-"));
    for (const [name, text] of Object.entries(files)) {
      mkdirSync(join(dir, name, ".."), { recursive: true });
      writeFileSync(join(dir, name), text);
    }
    return dir;
  }
  const run = async (args: string[]) => {
    const lines: string[] = [];
    const code = await main(args, (t) => void lines.push(t));
    return { code, text: lines.join("\n") };
  };

  it("lists each use, counts them, and exits 0 unless --fail", async () => {
    const dir = app({ "src/a.tsx": `<p className="text-sm bg-stone-100" />`, "src/b.css": `.x { @apply shadow-lg; }`, "node_modules/p/i.tsx": `text-xs` });
    try {
      const listed = await run([join(dir, "src")]);
      expect(listed.code).toBe(0);
      expect(listed.text).toContain("a.tsx:1  text-sm  (text size)");
      expect(listed.text).toContain("b.css:1  shadow-lg  (shadow)");
      expect(listed.text).toContain("3 stock classes in 2 files: 1 text size, 1 colour, 1 shadow.");
      expect(listed.text).not.toContain("text-xs");
      expect((await run(["--fail", join(dir, "src")])).code).toBe(1);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("says it is time to switch when nothing is left, and fails on a folder that does not exist", async () => {
    const dir = app({ "src/a.tsx": `<p className="bg-primary type-body" />` });
    try {
      const clean = await run(["--fail", join(dir, "src")]);
      expect(clean.code).toBe(0);
      expect(clean.text).toContain("Switch the import to strata-react/strata.css");
      expect((await run([join(dir, "nope")])).code).toBe(2);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
