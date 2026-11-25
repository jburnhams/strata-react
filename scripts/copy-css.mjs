// Copies the Tailwind source stylesheet into dist/ and points Tailwind's scanner at the built
// components, so an app that imports "strata-react/strata.css" gets every class the components
// use without listing node_modules in its own @source. A second file, strata.migrate.css, is the same
// stylesheet without the namespace reset (the block between the strata:strict markers), for an app that
// moves onto Strata one screen at a time and still uses stock Tailwind colours and sizes (issue #225).
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));
mkdirSync(`${root}dist`, { recursive: true });
const bare = readFileSync(`${root}src/styles/strata.bare.css`, "utf8");
const theme = readFileSync(`${root}src/styles/theme.css`, "utf8");
const sources = `\n/* The built components, so their classes are generated. */\n@source "./*.js";\n`;

// strata.bare.css: the contract alone, no look. What an app with its own theme imports.
writeFileSync(`${root}dist/strata.bare.css`, `${bare}${sources}`);
console.log("dist/strata.bare.css written");

// strata.css: the contract plus the default look in one file. CSS wants @import first, so the look's
// font imports are lifted to the top, and the contract's own Geist import is dropped (the look names its
// face; bundling an unused one would ship its files for nothing).
const geist = /\/\* strata:geist-begin \*\/[\s\S]*?\/\* strata:geist-end \*\/\n?/;
if (!geist.test(bare)) throw new Error("src/styles/strata.bare.css lost its strata:geist markers");
const imports = [...theme.matchAll(/^@import [^;]+;\n/gm)].map((m) => m[0]);
if (imports.length === 0) throw new Error("src/styles/theme.css has no @import lines: the default faces would not be bundled");
const head = bare.match(/^\/\*[\s\S]*?\*\/\n/)[0];
const body = bare.slice(head.length).replace(geist, "");
const palettes = readFileSync(`${root}src/styles/palettes.css`, "utf8");
const look = `${theme.replace(/^@import [^;]+;\n/gm, "")}\n${palettes}`;
writeFileSync(`${root}dist/strata.css`, `${head}\n${imports.join("")}${body}\n${look}${sources}`);
console.log("dist/strata.css written");

// reading.css: the opt-in reading serif, copied as it is.
writeFileSync(`${root}dist/reading.css`, readFileSync(`${root}src/styles/reading.css`, "utf8"));
console.log("dist/reading.css written");

const strict = /\/\* strata:strict-begin \*\/[\s\S]*?\/\* strata:strict-end \*\//;
if (!strict.test(bare)) throw new Error("src/styles/strata.bare.css lost its strata:strict markers: strata.migrate.css cannot be made");
const migrate = bare.replace(
  strict,
  `/* MIGRATION MODE (strata.migrate.css): Tailwind's stock colours, sizes, radii, shadows and fonts are NOT cleared here, so an
   app's own \`bg-stone-100\` and \`text-sm\` keep compiling beside Strata's roles. It is the bare contract (no default look), so an app
   keeps its own colours while it moves over. Switch the import to strata.css or strata.bare.css once
   \`strata-stock-classes\` finds nothing left. */`,
);
writeFileSync(`${root}dist/strata.migrate.css`, `${migrate}${sources}`);
console.log("dist/strata.migrate.css written");
