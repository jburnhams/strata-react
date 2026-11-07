// Taking one shot. Everything here is about determinism: a fresh browser context per shot so
// shots cannot affect each other, reduced motion and frozen animations so the settled state is
// what is captured, fonts awaited, the theme set both as the colour scheme and as the class the
// app reads, the clock optionally frozen, and, for routes, every request the page makes answered
// by MSW handlers in Node, so the screenshot depends on nothing outside the suite.
import type { Browser, BrowserContext, Page, Request as PlaywrightRequest, Route as PlaywrightRoute } from "playwright";
import type { RequestHandler } from "msw";
import type { Shot } from "./types";

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
export async function capture(browser: Browser, shot: Shot, options: CaptureOptions): Promise<{ png: Buffer; problems: string[] }> {
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
    return { png, problems };
  } finally {
    await context.close();
  }
}

async function settle(page: Page) {
  // A state that is meant to stay loading keeps a request open, so networkidle may not come.
  await page.waitForLoadState("networkidle", { timeout: 3_000 }).catch(() => undefined);
  await page.evaluate(() => document.fonts.ready.then(() => undefined));
  await page.waitForTimeout(250);
}

// Runs in the page. The box around what the root actually paints: text, replaced and form
// elements, SVGs, and any box with a background, border or shadow, each cut to the scroll
// containers it sits in. So a row of buttons is cropped to the buttons, not the full-width div
// holding them, and fixed elements (an undo bar) count wherever they are. The screenshot is
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
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_ELEMENT | NodeFilter.SHOW_TEXT);
  for (let n = walker.nextNode(); n; n = walker.nextNode()) {
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
