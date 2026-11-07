// Copies the Tailwind source stylesheet into dist/ and points Tailwind's scanner at the built
// components, so an app that imports "strata-react/strata.css" gets every class the components
// use without listing node_modules in its own @source.
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));
mkdirSync(`${root}dist`, { recursive: true });
const css = readFileSync(`${root}src/styles/strata.css`, "utf8");
writeFileSync(`${root}dist/strata.css`, `${css}\n/* The built components, so their classes are generated. */\n@source "./*.js";\n`);
console.log("dist/strata.css written");
