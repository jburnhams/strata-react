// Builds the GitHub Pages site into site/:
//   /          Storybook (every component in every state)
//   /api/      TypeDoc API reference from the source's types and doc comments
//   /visuals/  the committed visual baselines, light and dark side by side, per story
// Run after `npm run build-storybook` and `npx typedoc` (npm run site does all three).
import { cpSync, existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));
const site = join(root, "site");
const storybook = join(root, "storybook-static");
const baselines = join(root, "tests/visual/baselines");

if (!existsSync(join(storybook, "index.json"))) throw new Error("Run npm run build-storybook first.");
if (!existsSync(join(site, "api/index.html"))) throw new Error("Run npx typedoc first.");

cpSync(storybook, site, { recursive: true });

const index = JSON.parse(readFileSync(join(storybook, "index.json"), "utf8"));
const stories = Object.values(index.entries).filter((e) => e.type === "story");
const files = new Set(readdirSync(baselines));
mkdirSync(join(site, "visuals/img"), { recursive: true });

const esc = (s) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
const groups = new Map();
for (const s of stories) {
  const shots = ["light", "dark"].map((t) => `${s.id}--${t}.png`).filter((f) => files.has(f));
  if (!shots.length) continue;
  for (const f of shots) cpSync(join(baselines, f), join(site, "visuals/img", f));
  if (!groups.has(s.title)) groups.set(s.title, []);
  groups.get(s.title).push({ ...s, shots });
}

const body = [...groups]
  .map(
    ([title, items]) => `<section id="${esc(title.toLowerCase().replace(/[^a-z0-9]+/g, "-"))}">
  <h2>${esc(title)}</h2>
  ${items
    .map(
      (s) => `<article>
    <h3><a href="../?path=/story/${esc(s.id)}">${esc(s.name)}</a></h3>
    <div class="shots">${s.shots
      .map((f) => `<figure class="${f.endsWith("--dark.png") ? "dark" : "light"}"><img src="img/${esc(f)}" alt="${esc(`${title}: ${s.name}, ${f.endsWith("--dark.png") ? "dark" : "light"} theme`)}" loading="lazy"><figcaption>${f.endsWith("--dark.png") ? "Dark" : "Light"}</figcaption></figure>`)
      .join("")}</div>
  </article>`,
    )
    .join("\n  ")}
</section>`,
  )
  .join("\n");

const toc = [...groups.keys()].map((t) => `<a href="#${esc(t.toLowerCase().replace(/[^a-z0-9]+/g, "-"))}">${esc(t)}</a>`).join("");

writeFileSync(
  join(site, "visuals/index.html"),
  `<!doctype html>
<html lang="en-GB">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>strata-react visual baselines</title>
<style>
  :root { color-scheme: light dark; --bg: #fbfbfa; --fg: #1d201e; --muted: #5d625f; --rule: #dcdfdc; --panel: #f1f2f0; }
  @media (prefers-color-scheme: dark) { :root { --bg: #141615; --fg: #e9ebe9; --muted: #a3a8a5; --rule: #2e3230; --panel: #1c1f1d; } }
  * { box-sizing: border-box; }
  body { margin: 0; background: var(--bg); color: var(--fg); font: 15px/1.5 ui-sans-serif, system-ui, sans-serif; }
  header, main { max-width: 1200px; margin: 0 auto; padding: 0 16px; }
  header { padding-top: 32px; padding-bottom: 8px; }
  h1 { font-size: 24px; margin: 0 0 4px; }
  header p { color: var(--muted); margin: 0 0 12px; max-width: 70ch; }
  nav { display: flex; flex-wrap: wrap; gap: 4px 16px; padding: 8px 0 16px; border-bottom: 1px solid var(--rule); }
  a { color: inherit; text-underline-offset: 0.2em; }
  h2 { font-size: 18px; margin: 32px 0 8px; }
  h3 { font-size: 14px; font-weight: 500; margin: 16px 0 6px; }
  .shots { display: flex; flex-wrap: wrap; gap: 12px; }
  figure { margin: 0; max-width: 100%; }
  figure img { display: block; max-width: 100%; height: auto; border: 1px solid var(--rule); border-radius: 4px; }
  figcaption { color: var(--muted); font-size: 12px; margin-top: 2px; }
</style>
</head>
<body>
<header>
  <h1>Visual baselines</h1>
  <p>Every Storybook story, light and dark, as the visual suite expects it to render in Chromium. CI compares each pull request against these with pixelmatch. ${stories.length} stories, ${[...groups.values()].reduce((n, g) => n + g.reduce((m, s) => m + s.shots.length, 0), 0)} screenshots. <a href="../">Storybook</a> · <a href="../api/">API reference</a></p>
  <nav>${toc}</nav>
</header>
<main>
${body}
</main>
</body>
</html>
`,
);
console.log(`site/ built: Storybook, API reference, ${groups.size} visual groups`);
