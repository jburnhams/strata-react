/**
 * Visual regression for Strata apps: the runner strata-react tests itself with, for an app's own
 * Storybook build and for its routes, each route in the server states its MSW handlers describe.
 * Every shot is taken light and dark in Playwright's Chromium, compared with a baseline committed
 * in the app's repo using pixelmatch, and reported as matching, changed, new or failed. Run it
 * with the `strata-visual` command, or call {@link runVisual}.
 *
 * Needs `playwright` (pinned to an exact version) and, for routes with handlers, `msw`.
 *
 * @module strata-react/visual
 */
export { runVisual, defineVisualConfig, formatReport, pinWarnings, type RunOptions } from "./run";
export { storybookShots, routeShots, defaultThemes } from "./targets";
export { capture, resolveShotUrl, toFetchRequest, type CaptureOptions, type Capture } from "./capture";
export { serveStatic, type StaticServer } from "./serve";
export { compare, decode, encode, boxBlur, THRESHOLD, BLUR, MAX_DIFF_PIXELS, type CompareOptions, type Image, type CompareResult } from "./compare";
export {
  viewports,
  type Theme,
  type Viewport,
  type ViewportChoice,
  type Clip,
  type Setup,
  type Shot,
  type StorybookTarget,
  type RouteState,
  type Route,
  type AppTarget,
  type VisualConfig,
  type VisualReport,
} from "./types";
