// The strata-stock-classes command: lists the stock Tailwind classes still in an app's source (see stock-classes.ts).
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { parseArgs } from "node:util";
import { findStockClasses, type StockClass } from "./stock-classes";

const usage = `Usage: strata-stock-classes [options] [folder or file ...]

Lists the stock Tailwind classes (colours such as bg-stone-100, text-sm, rounded-xl, shadow-lg, font-serif)
that strata.css would stop compiling, so an app on strata.migrate.css knows what is left to convert. Reads
.ts .tsx .js .jsx .mjs .html .mdx .vue .svelte files, and the @apply lines of .css files. Default: ./src.

  --fail     exit 1 when any are found (for a CI step that holds the line while migrating)
  --help     show this
`;

const readable = /\.(?:[cm]?[jt]sx?|html|mdx|vue|svelte|css)$/;
const skipped = new Set(["node_modules", "dist", ".git", "storybook-static", "coverage"]);

function* walk(path: string): Generator<string> {
  if (statSync(path).isFile()) {
    if (readable.test(path)) yield path;
    return;
  }
  for (const name of readdirSync(path).sort()) if (!skipped.has(name)) yield* walk(join(path, name));
}

/** Runs the command; the exit code. */
export async function main(argv: string[], out: (text: string) => void = (t) => console.log(t)): Promise<number> {
  const { values, positionals } = parseArgs({ args: argv, options: { fail: { type: "boolean" }, help: { type: "boolean" } }, allowPositionals: true });
  if (values.help) {
    out(usage);
    return 0;
  }
  const roots = positionals.length ? positionals : ["src"];
  const all: { file: string; found: StockClass[] }[] = [];
  for (const root of roots) {
    try {
      statSync(root);
    } catch {
      out(`strata-stock-classes: ${root} does not exist`);
      return 2;
    }
    for (const file of walk(root)) {
      const found = findStockClasses(readFileSync(file, "utf8"), file);
      if (found.length) all.push({ file: relative(process.cwd(), file), found });
    }
  }
  const total = all.reduce((n, f) => n + f.found.length, 0);
  if (!total) {
    out("No stock Tailwind classes left. Switch the import to strata-react/strata.css.");
    return 0;
  }
  const byKind = new Map<string, number>();
  for (const { file, found } of all) {
    for (const f of found) {
      out(`${file}:${f.line}  ${f.className}  (${f.kind})`);
      byKind.set(f.kind, (byKind.get(f.kind) ?? 0) + 1);
    }
  }
  out("");
  out(`${total} stock classes in ${all.length} files: ${[...byKind].map(([k, n]) => `${n} ${k}`).join(", ")}.`);
  for (const rule of new Set(all.flatMap((f) => f.found.map((x) => `${x.kind}: ${x.instead}`)))) out(`  ${rule}`);
  return values.fail ? 1 : 0;
}
