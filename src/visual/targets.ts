// Turning what an app has into shots. A component library has stories; an app may have only
// screens (strata-listory has Review, Library and Settings and no stories), so routes are a
// first-class target: each route is taken in each server state, viewport and theme, with the
// state set by MSW handlers, the same handlers its unit tests use. Names are stable and readable
// (`review--empty--phone--dark.png`) because a person reviews baselines by file name in a diff.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { viewports, type AppTarget, type Route, type RouteState, type Shot, type StorybookTarget, type Theme, type Viewport, type ViewportChoice } from "./types";

/** The light and dark themes, the default for every target. */
export const defaultThemes: readonly Theme[] = ["light", "dark"];

// Untagged stories lay out in a 1024-wide, 200-tall frame and the clip grows with the component,
// so a short component's fixed elements (the undo bar) sit near it rather than 768px down.
const storyViewport: Viewport = { width: 1024, height: 200 };

interface IndexEntry {
  id: string;
  type: string;
  title?: string;
  name?: string;
  tags?: string[];
}

/**
 * Shots for every story in a built Storybook (its `index.json`), in each theme. Tags pick the
 * viewport: `visual-phone` 390×844, `visual-wide` 1440×900, otherwise 1024 wide; `no-visual`
 * skips the story. A story's own tag beats its file's, since Storybook merges both.
 */
export function storybookShots(target: StorybookTarget & { dir: string }, themes: readonly Theme[] = defaultThemes): Shot[] {
  const index = JSON.parse(readFileSync(join(target.dir, "index.json"), "utf8")) as { entries: Record<string, IndexEntry> };
  const global = target.themeGlobal ?? "theme";
  return Object.values(index.entries)
    .filter((e) => e.type === "story" && !e.tags?.includes("no-visual"))
    .flatMap((story) => {
      const tag = ["visual-phone", "visual-wide"].find((t) => story.tags?.includes(t));
      const viewport = tag === "visual-phone" ? viewports.phone : tag === "visual-wide" ? viewports.wide : storyViewport;
      return themes.map((theme) => ({
        name: `${story.id}--${theme}`,
        path: `iframe.html?id=${story.id}&viewMode=story&globals=${global}:${theme}`,
        theme,
        viewport: { ...viewport },
        root: "#storybook-root",
        clip: "paint" as const,
        darkClass: false as const,
      }));
    });
}

const slug = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

function viewportName(v: ViewportChoice): string {
  return typeof v === "string" ? v : `${v.width}x${v.height}`;
}

function viewportSize(v: ViewportChoice): Viewport {
  if (typeof v !== "string") return { width: v.width, height: v.height };
  const size = viewports[v];
  if (!size) throw new Error(`unknown viewport "${String(v)}": use ${Object.keys(viewports).join(", ")} or { width, height }`);
  return { ...size };
}

function stateOf(value: readonly unknown[] | RouteState): RouteState {
  return Array.isArray(value) ? { handlers: value as RouteState["handlers"] } : (value as RouteState);
}

/**
 * Shots for every route of an app in each state, viewport and theme, named
 * `route--state--viewport--theme`. A state's handlers come before the target's base handlers, as
 * `server.use(...)` would put them.
 */
export function routeShots(app: AppTarget, themes: readonly Theme[] = defaultThemes): Shot[] {
  const shots: Shot[] = [];
  for (const route of app.routes as readonly Route[]) {
    if (!slug.test(route.name)) throw new Error(`route name "${route.name}" must be lower-case letters, digits and dashes`);
    const states = Object.entries(route.states ?? { default: [] });
    if (!states.length) throw new Error(`route "${route.name}" has an empty states object: leave it out for one default state`);
    const chosen = route.viewports ?? app.viewports ?? ["wide"];
    for (const [stateName, value] of states) {
      if (!slug.test(stateName)) throw new Error(`state "${stateName}" of route "${route.name}" must be lower-case letters, digits and dashes`);
      const state = stateOf(value);
      const setups = [route.setup, state.setup].filter((s) => s !== undefined);
      for (const v of chosen) {
        for (const theme of themes) {
          shots.push({
            name: `${route.name}--${stateName}--${viewportName(v)}--${theme}`,
            path: state.path ?? route.path,
            theme,
            viewport: viewportSize(v),
            root: route.root ?? app.root ?? "#root",
            clip: route.clip ?? app.clip ?? "page",
            waitFor: state.waitFor ?? route.waitFor,
            handlers: [...(state.handlers ?? []), ...(app.handlers ?? [])],
            darkClass: app.darkClass ?? "dark",
            setup: setups.length ? async (page, shot) => { for (const s of setups) await s(page, shot); } : undefined,
          });
        }
      }
    }
  }
  return shots;
}
