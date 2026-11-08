// The shapes a visual suite is written in. One Shot is one PNG: a URL, a theme, a viewport, how to
// tell it has rendered, and what to cut out. Storybook stories and app routes are both turned into
// shots, so capture, comparison and baselines are the same code for a component library and for
// an app's screens (strata-react issue #13).
import type { Page } from "playwright";
import type { RequestHandler } from "msw";
import type { CompareOptions } from "./compare";

/** The two colour schemes every shot is taken in. */
export type Theme = "light" | "dark";

/** A viewport in CSS pixels. Screenshots are taken at a device scale factor of 1. */
export interface Viewport {
  width: number;
  height: number;
}

/** A named viewport (see {@link viewports}) or an explicit size. */
export type ViewportChoice = keyof typeof viewports | Viewport;

/**
 * Named viewports. `wide` and `phone` are what the Storybook tags `visual-wide` and
 * `visual-phone` select; `default` is a laptop-sized screen for routes. (Untagged stories render
 * 1024 wide and 200 tall and grow with the component, see {@link storybookShots}.)
 */
export const viewports = {
  default: { width: 1024, height: 768 },
  wide: { width: 1440, height: 900 },
  phone: { width: 390, height: 844 },
} as const satisfies Record<string, Viewport>;

/**
 * What a screenshot covers. `paint` is the union of what the root element paints (text,
 * controls, SVGs, and boxes with a background, border or shadow) plus 8px, so a component's
 * baseline shows the component and not the empty canvas. `page` is the whole page, for screens.
 */
export type Clip = "paint" | "page";

/** A step run after a shot has rendered and before it is captured: open a menu, focus a field. */
export type Setup = (page: Page, shot: Shot) => Promise<void> | void;

/** One screenshot: everything the runner needs to take it and to name its baseline. */
export interface Shot {
  /** The baseline's file name without `.png`, e.g. `review--empty--wide--dark`. */
  name: string;
  /** Path and query under the served base (`/review?tab=queue`), or an absolute URL. */
  path: string;
  theme: Theme;
  viewport: Viewport;
  /** Selector of the element the app renders into; the shot waits until it has children. */
  root: string;
  clip: Clip;
  /** A Playwright selector that must be visible before the shot is taken (see {@link RouteState.waitFor}). */
  waitFor?: string;
  /** MSW handlers answering the page's requests, first match wins. Route shots only. */
  handlers?: readonly RequestHandler[];
  /** Class put on `<html>` in the dark theme (Strata's `dark:` variant reads `.dark`). */
  darkClass?: string | false;
  setup?: Setup;
}

/** An app's built Storybook. */
export interface StorybookTarget {
  /** The `storybook build` output folder. Default `storybook-static`. */
  dir?: string;
  /** The Storybook global the preview reads the theme from. Default `theme`, as Strata's preview. */
  themeGlobal?: string;
}

/** One state of a route: the MSW handlers that put the server into it, and optional steps. */
export interface RouteState {
  /** Handlers tried before the target's base handlers (like `server.use(...)` in a test). */
  handlers?: readonly RequestHandler[];
  /** A different path for this state, e.g. the same screen with `?tab=sync`. */
  path?: string;
  /**
   * A Playwright selector that must be visible before the shot is taken, such as `role=alert` or
   * `text=Try again`. Needed when a state takes longer than the network to show: an error after
   * the query client's retry, a toast after a timer.
   */
  waitFor?: string;
  setup?: Setup;
}

/** A screen of the app, screenshotted in each of its states. */
export interface Route {
  /** Names the baselines: lower-case letters, digits and dashes. */
  name: string;
  /** Path and query under the app's base, e.g. `/review` or `/library?sort=-added`. */
  path: string;
  /**
   * The server states to capture, by name. A list of handlers is shorthand for `{ handlers }`.
   * Default: one state, `default`, served by the base handlers alone.
   */
  states?: Record<string, readonly RequestHandler[] | RouteState>;
  viewports?: readonly ViewportChoice[];
  clip?: Clip;
  root?: string;
  waitFor?: string;
  setup?: Setup;
}

/** An app served from its production build (or a running server), screenshotted route by route. */
export interface AppTarget {
  /** The build folder to serve, e.g. `dist`. Unknown paths that ask for HTML get `index.html`. */
  dir?: string;
  /** Or a server that is already running, e.g. `http://localhost:4173`. */
  url?: string;
  /** The app's base path (Vite's `base`). Default `/`. */
  base?: string;
  /** MSW handlers for every route: the healthy server, usually the app's `handlers.ts`. */
  handlers?: readonly RequestHandler[];
  /** Default `#root`. */
  root?: string;
  /** Default `["wide"]`. Every route is taken at each. */
  viewports?: readonly ViewportChoice[];
  /** Default `page`. */
  clip?: Clip;
  /** Default `dark`; `false` to rely on `prefers-color-scheme` alone. */
  darkClass?: string | false;
  /**
   * A `fetch` or XHR request no handler answers: `error` (default) fails the shot, because a
   * screenshot that depends on a real server is not a baseline; `bypass` lets it through.
   */
  onUnhandledRequest?: "error" | "bypass";
  routes: readonly Route[];
}

/** A visual suite: where baselines live and what to screenshot. Paths are relative to the config file. */
export interface VisualConfig {
  /** Committed baselines. Default `tests/visual/baselines`. */
  baselines?: string;
  /** Actual, expected and diff PNGs of changed shots (uploaded by CI). Default `tests/visual/output`. */
  output?: string;
  /** Default `["light", "dark"]`. */
  themes?: readonly Theme[];
  /** Freeze the page's clock at this time, so "3 minutes ago" and today's date stay put. */
  time?: string | number | Date;
  /** The page's time zone. Default `UTC`, so a date renders the same on every machine. */
  timezone?: string;
  /** The page's locale (`navigator.language`, `Intl` defaults). Default `en-US`. */
  locale?: string;
  /**
   * What to do with text drawn in a font installed on the machine rather than one the page
   * loaded (a theme whose `--font-*` falls through to `ui-sans-serif`, or a glyph the web font
   * lacks). `error` (default) fails the shot, because no comparison threshold makes Cantarell
   * match San Francisco; `warn` reports it; `allow` skips the check. Bundle every face with
   * `@fontsource` (or your own `@font-face`) and name it first in the theme's `--font-*`.
   */
  systemFonts?: "error" | "warn" | "allow";
  /**
   * How a screenshot is compared with its baseline. The defaults (a 3×3 blur, then pixelmatch at
   * threshold 0.1 with 4 differing pixels allowed) absorb anti-aliasing differences between
   * machines and still fail on a changed letter; change them only with evidence from your own
   * screens.
   */
  compare?: CompareOptions;
  /** Pages captured at once. Default 4. */
  concurrency?: number;
  storybook?: StorybookTarget | string;
  app?: AppTarget;
}

/** What a run found. */
export interface VisualReport {
  /** Shots taken. */
  total: number;
  same: number;
  /** `name.png: reason` for each shot that matched without being pixel-identical (anti-aliasing absorbed). */
  tolerated: string[];
  /** `name.png: reason` for each shot that differs from its baseline. */
  changed: string[];
  /** Shots with no baseline yet (written, and copied to the output folder). */
  added: string[];
  /** Baselines no shot produced (removed when updating). */
  obsolete: string[];
  /** Shots that failed: page errors, console errors, unhandled requests, nothing rendered. */
  errors: string[];
  /** Things that make baselines less trustworthy, such as an unpinned Playwright. */
  warnings: string[];
  updated: boolean;
  /** Whether the run should fail (in CI a missing baseline fails too). */
  failed: boolean;
}
