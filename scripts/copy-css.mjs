// Copies the Tailwind source stylesheet into dist/ and points Tailwind's scanner at the built
// components, so an app that imports "strata-react/strata.css" gets every class the components
// use without listing node_modules in its own @source. A second file, strata.migrate.css, is the same
// stylesheet without the namespace reset (the block between the strata:strict markers), for an app that
// moves onto Strata one screen at a time and still uses stock Tailwind colours and sizes (issue #225).
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));
mkdirSync(`${root}dist`, { recursive: true });
const css = readFileSync(`${root}src/styles/strata.css`, "utf8");
const sources = `\n/* The built components, so their classes are generated. */\n@source "./*.js";\n`;
writeFileSync(`${root}dist/strata.css`, `${css}${sources}`);
console.log("dist/strata.css written");

const strict = /\/\* strata:strict-begin \*\/[\s\S]*?\/\* strata:strict-end \*\//;
if (!strict.test(css)) throw new Error("src/styles/strata.css lost its strata:strict markers: strata.migrate.css cannot be made");
const migrate = css.replace(
  strict,
  `/* MIGRATION MODE (strata.migrate.css): Tailwind's stock colours, sizes, radii, shadows and fonts are NOT cleared here, so an
   app's own \`bg-stone-100\` and \`text-sm\` keep compiling beside Strata's roles. Switch the import to strata.css once
   \`strata-stock-classes\` finds nothing left. */`,
);
writeFileSync(`${root}dist/strata.migrate.css`, `${migrate}${sources}`);
console.log("dist/strata.migrate.css written");
