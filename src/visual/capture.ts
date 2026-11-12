// Taking one shot. Everything here is about determinism: a fresh browser context per shot so
// shots cannot affect each other, reduced motion and frozen animations so the settled state is
// what is captured, fonts awaited, the theme set both as the colour scheme and as the class the
// app reads, the clock optionally frozen, and, for routes, every request the page makes answered
// by MSW handlers in Node, so the screenshot depends on nothing outside the suite.
import type { Browser, BrowserContext, Page, Request as PlaywrightRequest, Route as PlaywrightRoute } from "playwright";
import type { RequestHandler } from "msw";
import type { Shot, VisualConfig } from "./types";

// Where ThemeProvider and colorSchemeScript() keep the preference (COLOR_SCHEME_STORAGE_KEY in components/theme.tsx; copied, not imported, so the runner loads no React).
const COLOR_SCHEME_STORAGE_KEY = "strata-color-scheme";

// Animations and transitions off, caret hidden: a screenshot is of the settled state.
const freeze = `*, *::before, *::after { animation: none !important; transition: none !important; caret-color: transparent !important; }`;

/** Options shared by every shot of a run. */
export interface CaptureOptions {
  /** Where `shot.path` resolves, ending in `/`. */
  baseUrl: string;
  time?: string | number | Date;
  timezone?: string;
  locale?: string;
  /** Block service workers (an app's own MSW worker or PWA cache would bypass the handlers). */
  blockServiceWorkers?: boolean;
  onUnhandledRequest?: "error" | "bypass";
  /** Look up which faces drew the page's text and return the ones that are not web fonts. Default true. */
  checkFonts?: boolean;
}

/** What one shot produced. */
export interface Capture {
  png: Buffer;
  /** Page errors, console errors and unanswered requests. */
  problems: string[];
  /**
   * Text drawn in a font installed on this machine rather than one the page loaded, one line per
   * face with an example element, e.g. `"DejaVu Sans" in <kbd> "⌘K"`. Such text renders
   * differently on every machine, so the runner fails the shot (see {@link VisualConfig.systemFonts}).
   */
  systemFonts: string[];
}

/** Resolves a shot's path under the base URL, keeping the base's own path (`/app/` + `/review`). */
export function resolveShotUrl(path: string, baseUrl: string): string {
  if (/^[a-z][a-z0-9+.-]*:/i.test(path)) return path;
  return new URL(path.replace(/^\/+/, ""), baseUrl).href;
}

/** Converts a request the page made into a Fetch `Request` MSW can match. */
export function toFetchRequest(request: Pick<PlaywrightRequest, "url" | "method" | "headers" | "postDataBuffer">): Request {
  const method = request.method();
  const body = method === "GET" || method === "HEAD" ? undefined : (request.postDataBuffer() ?? undefined);
  return new Request(request.url(), { method, headers: request.headers(), body: body ? new Uint8Array(body) : undefined });
}

async function answerWithHandlers(
  context: BrowserContext,
  handlers: readonly RequestHandler[],
  baseUrl: string,
  unhandled: "error" | "bypass",
  problems: string[],
) {
  const msw = await import("msw").catch(() => {
    throw new Error("route shots with handlers need msw: npm install -D msw");
  });
  const origin = new URL(baseUrl).origin;
  await context.route("**/*", async (route: PlaywrightRoute) => {
    const request = route.request();
    const response = await msw.getResponse([...handlers], toFetchRequest(request), { baseUrl: origin, quiet: true });
    if (response && response.headers.get("x-msw-intention") !== "passthrough") {
      const headers: Record<string, string> = {};
      response.headers.forEach((value, key) => (headers[key] = value));
      await route.fulfill({ status: response.status, headers, body: Buffer.from(await response.arrayBuffer()) });
      return;
    }
    if (!response && unhandled === "error" && ["fetch", "xhr", "eventsource", "websocket"].includes(request.resourceType())) {
      const url = new URL(request.url());
      problems.push(`no handler for ${request.method()} ${url.origin === origin ? "" : url.origin}${url.pathname}${url.search}`);
    }
    await route.continue();
  });
}

/** Takes one shot and returns its PNG, or throws with what went wrong. Page and console errors are returned as problems. */
export async function capture(browser: Browser, shot: Shot, options: CaptureOptions): Promise<Capture> {
  const context = await browser.newContext({
    viewport: shot.viewport,
    deviceScaleFactor: 1,
    reducedMotion: "reduce",
    colorScheme: shot.theme,
    timezoneId: options.timezone ?? "UTC",
    locale: options.locale ?? "en-US",
    serviceWorkers: options.blockServiceWorkers ? "block" : "allow",
  });
  const problems: string[] = [];
  try {
    if (options.time !== undefined) await context.clock.setFixedTime(options.time);
    // The theme the app's ThemeProvider reads before React runs (what `colorSchemeScript()` reads), so a shot's
    // theme reaches an app whose default preference is not "system" (issue #136). Failing storage is the app's no-op.
    await context.addInitScript(
      ({ key, theme }) => {
        try {
          localStorage.setItem(key, theme);
        } catch {}
      },
      { key: COLOR_SCHEME_STORAGE_KEY, theme: shot.theme },
    );
    if (shot.darkClass) {
      await context.addInitScript(
        ({ cls, dark }) => {
          const apply = () => document.documentElement?.classList.toggle(cls, dark);
          apply();
          document.addEventListener("DOMContentLoaded", apply);
        },
        { cls: shot.darkClass, dark: shot.theme === "dark" },
      );
    }
    if (shot.handlers?.length || options.onUnhandledRequest === "error") {
      await answerWithHandlers(context, shot.handlers ?? [], options.baseUrl, options.onUnhandledRequest ?? "bypass", problems);
    }
    const page = await context.newPage();
    page.on("pageerror", (e) => problems.push(e.message));
    // Error responses a state serves on purpose (4xx/5xx) are logged by Chromium; not a fault.
    page.on("console", (m) => {
      if (m.type() === "error" && !m.text().startsWith("Failed to load resource")) problems.push(m.text());
    });
    await page.goto(resolveShotUrl(shot.path, options.baseUrl), { waitUntil: "load" });
    await page.addStyleTag({ content: freeze });
    await page.waitForFunction((root) => (document.querySelector(root)?.childElementCount ?? 0) > 0, shot.root, { timeout: 15_000 }).catch(() => {
      throw new Error(`${shot.root} stayed empty for 15s`);
    });
    if (shot.waitFor) await page.locator(shot.waitFor).first().waitFor({ state: "visible", timeout: 15_000 });
    await settle(page);
    if (shot.setup) {
      await shot.setup(page, shot);
      await settle(page);
    }
    let png: Buffer;
    if (shot.clip === "page") {
      png = await page.screenshot({ fullPage: true, animations: "disabled" });
    } else {
      const clip = await page.evaluate(paintedBox, { root: shot.root, margin: 8 });
      if (!clip) throw new Error("rendered nothing visible");
      png = await page.screenshot({ fullPage: true, clip, animations: "disabled" });
    }
    const systemFonts = options.checkFonts === false ? [] : await platformFonts(page);
    return { png, problems, systemFonts };
  } finally {
    await context.close();
  }
}

async function settle(page: Page) {
  // A state that is meant to stay loading keeps a request open, so networkidle may not come.
  await page.waitForLoadState("networkidle", { timeout: 3_000 }).catch(() => undefined);
  await page.evaluate(() => document.fonts.ready.then(() => undefined));
  // A paused video shows its first frame once decoded; without this a shot is taken before or after, depending on the machine.
  await page
    .waitForFunction(() => [...document.querySelectorAll("video")].every((v) => v.readyState >= 2 || v.error !== null), undefined, { timeout: 5_000 })
    .catch(() => undefined);
  await page.waitForTimeout(250);
}

// Which faces drew the text. Chromium's DevTools protocol reports, per element, the font files
// that actually painted its glyphs and whether each came from the page (@font-face) or from the
// machine. A system face is the largest source of machine-to-machine difference left once the
// browser is pinned: the same `ui-sans-serif` is Cantarell on one Linux, DejaVu on another and
// San Francisco on a Mac, and a glyph missing from a web font (an arrow, ⌘) falls back to
// whatever the machine has. So the shot reports it rather than tolerating it in the comparison.
async function platformFonts(page: Page): Promise<string[]> {
  const cdp = await page.context().newCDPSession(page);
  try {
    await cdp.send("DOM.enable");
    await cdp.send("CSS.enable");
    const { root } = await cdp.send("DOM.getDocument", { depth: -1, pierce: true });
    type DomNode = {
      nodeId: number;
      nodeType: number;
      nodeName: string;
      nodeValue: string;
      pseudoType?: string;
      children?: DomNode[];
      shadowRoots?: DomNode[];
      pseudoElements?: DomNode[];
      contentDocument?: DomNode;
    };
    const texts: { id: number; name: string; text: string }[] = [];
    const walk = (n: DomNode) => {
      if (n.nodeName === "SCRIPT" || n.nodeName === "STYLE" || n.nodeName === "HEAD") return;
      const own = n.children?.filter((c) => c.nodeType === 3 && c.nodeValue.trim()) ?? [];
      if (n.nodeType === 1 && own.length) texts.push({ id: n.nodeId, name: n.nodeName.toLowerCase(), text: own.map((c) => c.nodeValue.trim()).join(" ") });
      // Generated content (`::before { content: "⌘" }`) draws text too; it has no text child.
      for (const p of n.pseudoElements ?? []) texts.push({ id: p.nodeId, name: `${n.nodeName.toLowerCase()}::${p.pseudoType ?? "pseudo"}`, text: "" });
      for (const c of [...(n.children ?? []), ...(n.shadowRoots ?? []), ...(n.contentDocument ? [n.contentDocument] : [])]) walk(c);
    };
    walk(root as DomNode);
    const found = new Map<string, string>();
    for (const t of texts) {
      // A node that is not rendered (display: none) has no fonts and is skipped by Chromium.
      const { fonts } = await cdp.send("CSS.getPlatformFontsForNode", { nodeId: t.id }).catch(() => ({ fonts: [] }));
      for (const f of fonts) {
        if (f.isCustomFont || found.has(f.familyName)) continue;
        const text = t.text.length > 30 ? `${t.text.slice(0, 29)}…` : t.text;
        // The CSS stack that fell through to the machine, so a `--font-mono` that names a face the app did not import is
        // recognisable as such (issue #136): the glyph or the whole stack was missing from the bundled faces.
        const { computedStyle } = await cdp.send("CSS.getComputedStyleForNode", { nodeId: t.id }).catch(() => ({ computedStyle: [] }));
        const stack = computedStyle.find((p) => p.name === "font-family")?.value;
        found.set(f.familyName, `"${f.familyName}" in <${t.name}>${text ? ` "${text}"` : ""}${stack ? ` (font-family: ${stack})` : ""}`);
      }
    }
    return [...found.values()];
  } finally {
    await cdp.detach().catch(() => undefined);
  }
}

// Runs in the page. The box around what the root actually paints: text, replaced and form
// elements, SVGs, and any box with a background, border or shadow, each cut to the scroll
// containers it sits in. So a row of buttons is cropped to the buttons, not the full-width div
// holding them, and fixed elements (an undo bar) count wherever they are. Portalled overlays
// (children of the body outside the root) count too, so an open dialog or popover is in its shot. The screenshot is
// fullPage, so the box may extend past the viewport and a large component is captured whole.
function paintedBox({ root: selector, margin }: { root: string; margin: number }) {
  const root = document.querySelector(selector);
  if (!root) return null;
  const replaced = new Set(["IMG", "INPUT", "SELECT", "TEXTAREA", "CANVAS", "VIDEO", "svg", "HR"]);
  const transparent = (c: string) => c === "transparent" || /rgba\(.*,\s*0\)$/.test(c) || /\/\s*0\)$/.test(c);
  const paints = (el: Element) => {
    const cs = getComputedStyle(el);
    if (replaced.has(el.tagName)) return true;
    if (!transparent(cs.backgroundColor) || cs.backgroundImage !== "none" || cs.boxShadow !== "none") return true;
    return (["Top", "Right", "Bottom", "Left"] as const).some(
      (s) => parseFloat(cs[`border${s}Width`]) > 0 && cs[`border${s}Style`] !== "none",
    );
  };
  const clipTo = (r: DOMRect, el: Node) => {
    let { left, top, right, bottom } = r;
    for (let a = el.parentElement; a && a !== document.body; a = a.parentElement) {
      const cs = getComputedStyle(a);
      if (cs.overflowX !== "visible" || cs.overflowY !== "visible" || cs.clipPath !== "none" || cs.clip !== "auto") {
        const b = a.getBoundingClientRect();
        left = Math.max(left, b.left);
        top = Math.max(top, b.top);
        right = Math.min(right, b.right);
        bottom = Math.min(bottom, b.bottom);
      }
      if (cs.position === "fixed") break;
    }
    return right - left > 1 && bottom - top > 1 ? { left, top, right, bottom } : null;
  };
  const rects: { left: number; top: number; right: number; bottom: number }[] = [];
  // Overlays (dialogs, popovers, tooltips, menus) are portalled to the body, outside the root, so
  // the walk covers the root and every other element the body holds besides scripts and styles.
  const roots: Element[] = [root, ...[...document.body.children].filter((c) => !c.contains(root) && !["SCRIPT", "STYLE", "LINK", "TEMPLATE"].includes(c.tagName))];
  const nodes: Node[] = [];
  for (const r of roots) {
    const walker = document.createTreeWalker(r, NodeFilter.SHOW_ELEMENT | NodeFilter.SHOW_TEXT);
    for (let n = walker.nextNode(); n; n = walker.nextNode()) nodes.push(n);
  }
  for (const n of nodes) {
    if (n.nodeType === Node.TEXT_NODE) {
      if (!n.textContent?.trim() || !n.parentElement) continue;
      const range = document.createRange();
      range.selectNodeContents(n);
      for (const r of range.getClientRects()) {
        // From the text node itself, so its own element's clip counts too (an sr-only span is a
        // 1px clipped box, and its text paints nothing).
        const c = clipTo(r, n);
        if (c) rects.push(c);
      }
      continue;
    }
    const el = n as Element;
    if (el.closest("svg") && el.tagName !== "svg") continue;
    if (getComputedStyle(el).visibility === "hidden" || !paints(el)) continue;
    const c = clipTo(el.getBoundingClientRect(), el);
    if (c) rects.push(c);
  }
  if (!rects.length) return null;
  const x0 = Math.max(0, Math.floor(Math.min(...rects.map((r) => r.left)) + scrollX - margin));
  const y0 = Math.max(0, Math.floor(Math.min(...rects.map((r) => r.top)) + scrollY - margin));
  const x1 = Math.min(document.documentElement.scrollWidth, Math.ceil(Math.max(...rects.map((r) => r.right)) + scrollX + margin));
  const y1 = Math.min(document.documentElement.scrollHeight, Math.ceil(Math.max(...rects.map((r) => r.bottom)) + scrollY + margin));
  return { x: x0, y: y0, width: x1 - x0, height: y1 - y0 };
}
