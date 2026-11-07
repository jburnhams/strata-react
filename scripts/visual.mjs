// Visual regression for every story, light and dark.
//
//   node scripts/visual.mjs            compare against tests/visual/baselines/, fail on any change
//   node scripts/visual.mjs --update   write the current screenshots as the new baselines
//   node scripts/visual.mjs --filter data-table   only stories whose id contains the text
//
// Needs a built Storybook in storybook-static/ (npm run build-storybook). Serves it on a local
// port, reads index.json, opens each story's iframe in headless Chromium (Playwright), waits for
// fonts and the network to settle with animations off, saves a PNG, and compares it with the
// baseline using pixelmatch. Changed stories get actual, expected and diff PNGs in
// tests/visual/output/ (uploaded by CI as an artifact). Each PNG is clipped to the story's own
// paint, so a baseline shows the component, not the empty canvas around it. Story tags pick
// the viewport the component lays out in:
// `visual-wide` (1440×900), `visual-phone` (390×844), default 1024 wide; `no-visual` skips.
import { createServer } from "node:http";
import { createReadStream, existsSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from "node:fs";
import { extname, join, normalize } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";
import { compare, decode } from "./visual-compare.mjs";

const root = fileURLToPath(new URL("..", import.meta.url));
const staticDir = join(root, "storybook-static");
const baselineDir = join(root, "tests/visual/baselines");
const outputDir = join(root, "tests/visual/output");
const args = process.argv.slice(2);
const update = args.includes("--update");
const filter = args.includes("--filter") ? args[args.indexOf("--filter") + 1] : undefined;
const themes = ["light", "dark"];
const viewports = {
  default: { width: 1024, height: 200 },
  "visual-wide": { width: 1440, height: 900 },
  "visual-phone": { width: 390, height: 844 },
};

if (!existsSync(join(staticDir, "index.json"))) {
  console.error("storybook-static/index.json not found: run npm run build-storybook first.");
  process.exit(1);
}

const types = { ".html": "text/html", ".js": "text/javascript", ".mjs": "text/javascript", ".css": "text/css", ".json": "application/json", ".svg": "image/svg+xml", ".woff2": "font/woff2", ".woff": "font/woff", ".png": "image/png" };
const server = createServer((req, res) => {
  const path = normalize(decodeURIComponent(new URL(req.url, "http://x").pathname)).replace(/^([/\\])+/, "");
  let file = join(staticDir, path || "index.html");
  if (!file.startsWith(staticDir) || !existsSync(file)) {
    res.writeHead(404).end();
    return;
  }
  if (statSync(file).isDirectory()) file = join(file, "index.html");
  res.writeHead(200, { "Content-Type": types[extname(file)] ?? "application/octet-stream", "Service-Worker-Allowed": "/" });
  createReadStream(file).pipe(res);
});
await new Promise((r) => server.listen(0, "127.0.0.1", r));
const base = `http://127.0.0.1:${server.address().port}`;

const index = JSON.parse(readFileSync(join(staticDir, "index.json"), "utf8"));
const stories = Object.values(index.entries).filter(
  (e) => e.type === "story" && !e.tags?.includes("no-visual") && (!filter || e.id.includes(filter)),
);

// Animations and transitions off, caret hidden: a screenshot is of the settled state.
const freeze = `*, *::before, *::after { animation: none !important; transition: none !important; caret-color: transparent !important; }`;

mkdirSync(baselineDir, { recursive: true });
rmSync(outputDir, { recursive: true, force: true });
mkdirSync(outputDir, { recursive: true });

const browser = await chromium.launch({ args: ["--font-render-hinting=none", "--disable-lcd-text", "--force-color-profile=srgb"] });
const results = { same: 0, changed: [], added: [], errors: [] };
const seen = new Set();

const jobs = stories.flatMap((story) => themes.map((theme) => ({ story, theme })));
for (const { story, theme } of jobs) seen.add(`${story.id}--${theme}.png`);

async function shoot({ story, theme }) {
  // A story's own tag beats its file's (Storybook merges both): phone first, then wide.
  const tag = ["visual-phone", "visual-wide"].find((t) => story.tags?.includes(t)) ?? "default";
  {
    const name = `${story.id}--${theme}.png`;
    const context = await browser.newContext({ viewport: viewports[tag], deviceScaleFactor: 1, reducedMotion: "reduce", colorScheme: theme });
    const page = await context.newPage();
    const problems = [];
    page.on("pageerror", (e) => problems.push(e.message));
    // Error responses a story serves on purpose (MSW 4xx/5xx) are logged by Chromium; not a fault.
    page.on("console", (m) => m.type() === "error" && !m.text().startsWith("Failed to load resource") && problems.push(m.text()));
    try {
      await page.goto(`${base}/iframe.html?id=${story.id}&viewMode=story&globals=theme:${theme}`, { waitUntil: "load" });
      await page.addStyleTag({ content: freeze });
      await page.waitForFunction(() => document.querySelector("#storybook-root")?.childElementCount > 0, null, { timeout: 15_000 });
      // A story that is meant to stay loading keeps a request open, so networkidle may not come.
      await page.waitForLoadState("networkidle", { timeout: 3_000 }).catch(() => undefined);
      await page.evaluate(() => document.fonts.ready);
      await page.waitForTimeout(250);
      // Clip to what the story actually paints: text, replaced and form elements, SVGs, and any
      // box with a background, border, outline or shadow, each cut to the scroll containers it
      // sits in. So a row of buttons is cropped to the buttons, not the full-width div holding
      // them, and fixed elements (the undo bar) count wherever they are. fullPage lets the clip
      // extend past the viewport, so a tall or wide component is captured whole.
      const clip = await page.evaluate((margin) => {
        const root = document.querySelector("#storybook-root");
        const replaced = new Set(["IMG", "INPUT", "SELECT", "TEXTAREA", "CANVAS", "VIDEO", "svg", "HR"]);
        const transparent = (c) => c === "transparent" || /rgba\(.*,\s*0\)$/.test(c) || /\/\s*0\)$/.test(c);
        const paints = (el) => {
          const cs = getComputedStyle(el);
          if (replaced.has(el.tagName)) return true;
          if (!transparent(cs.backgroundColor) || cs.backgroundImage !== "none" || cs.boxShadow !== "none") return true;
          return ["Top", "Right", "Bottom", "Left"].some((s) => parseFloat(cs[`border${s}Width`]) > 0 && cs[`border${s}Style`] !== "none");
        };
        const clipTo = (r, el) => {
          let { left, top, right, bottom } = r;
          for (let a = el.parentElement; a && a !== document.body; a = a.parentElement) {
            const cs = getComputedStyle(a);
            if (cs.overflowX !== "visible" || cs.overflowY !== "visible" || cs.clipPath !== "none" || cs.clip !== "auto") {
              const b = a.getBoundingClientRect();
              left = Math.max(left, b.left); top = Math.max(top, b.top);
              right = Math.min(right, b.right); bottom = Math.min(bottom, b.bottom);
            }
            if (cs.position === "fixed") break;
          }
          return right - left > 1 && bottom - top > 1 ? { left, top, right, bottom } : null;
        };
        const rects = [];
        const walker = document.createTreeWalker(root, NodeFilter.SHOW_ELEMENT | NodeFilter.SHOW_TEXT);
        for (let n = walker.nextNode(); n; n = walker.nextNode()) {
          if (n.nodeType === Node.TEXT_NODE) {
            if (!n.textContent.trim()) continue;
            const range = document.createRange();
            range.selectNodeContents(n);
            // From the text node itself, so its own element's clip counts too (an sr-only span is
            // a 1px clipped box, and its text paints nothing).
            for (const r of range.getClientRects()) { const c = clipTo(r, n); if (c) rects.push(c); }
            continue;
          }
          if (n.closest("svg") && n.tagName !== "svg") continue;
          if (getComputedStyle(n).visibility === "hidden" || !paints(n)) continue;
          const c = clipTo(n.getBoundingClientRect(), n);
          if (c) rects.push(c);
        }
        if (!rects.length) return null;
        const x0 = Math.max(0, Math.floor(Math.min(...rects.map((r) => r.left)) + scrollX - margin));
        const y0 = Math.max(0, Math.floor(Math.min(...rects.map((r) => r.top)) + scrollY - margin));
        const x1 = Math.min(document.documentElement.scrollWidth, Math.ceil(Math.max(...rects.map((r) => r.right)) + scrollX + margin));
        const y1 = Math.min(document.documentElement.scrollHeight, Math.ceil(Math.max(...rects.map((r) => r.bottom)) + scrollY + margin));
        return { x: x0, y: y0, width: x1 - x0, height: y1 - y0 };
      }, 8);
      if (!clip) throw new Error("story rendered nothing visible");
      const png = await page.screenshot({ fullPage: true, clip, animations: "disabled" });
      if (problems.length) results.errors.push(`${name}: ${problems.join(" | ")}`);
      const baselinePath = join(baselineDir, name);
      if (update || !existsSync(baselinePath)) {
        if (!update) results.added.push(name);
        writeFileSync(baselinePath, png);
        if (!update) writeFileSync(join(outputDir, name), png);
        return;
      }
      const result = compare(decode(readFileSync(baselinePath)), decode(png));
      if (result.same) {
        results.same++;
      } else {
        results.changed.push(`${name}: ${result.reason}`);
        writeFileSync(join(outputDir, name.replace(/\.png$/, ".actual.png")), png);
        writeFileSync(join(outputDir, name.replace(/\.png$/, ".expected.png")), readFileSync(baselinePath));
        if (result.diff) writeFileSync(join(outputDir, name.replace(/\.png$/, ".diff.png")), result.diff);
      }
    } catch (e) {
      results.errors.push(`${name}: ${e.message.split("\n")[0]}`);
    } finally {
      await context.close();
    }
  }
}

// A few pages at once: each story gets its own context, so they cannot affect each other.
const queue = [...jobs];
await Promise.all(Array.from({ length: 4 }, async () => {
  for (let job = queue.shift(); job; job = queue.shift()) await shoot(job);
}));
await browser.close();
server.close();

const obsolete = filter ? [] : readdirSync(baselineDir).filter((f) => f.endsWith(".png") && !seen.has(f));
if (update) for (const f of obsolete) rmSync(join(baselineDir, f));

const total = seen.size;
if (update) {
  console.log(`Wrote ${total} baselines${obsolete.length ? `, removed ${obsolete.length} obsolete` : ""}.`);
} else {
  console.log(`${results.same} of ${total} screenshots match their baselines.`);
}
for (const line of results.changed) console.log(`changed  ${line}`);
for (const line of results.added) console.log(`new      ${line} (baseline written; commit it)`);
for (const line of obsolete) console.log(`obsolete ${line}${update ? " (removed)" : " (run with --update to remove)"}`);
for (const line of results.errors) console.log(`error    ${line}`);

// In CI a missing baseline is a failure too: it means a story was added without its screenshot.
const failed = results.errors.length || results.changed.length || (process.env.CI && results.added.length);
if (failed) {
  console.log(`\nDiffs are in tests/visual/output/. If the change is intended, run npm run test:visual:update and commit the baselines.`);
  process.exit(1);
}
