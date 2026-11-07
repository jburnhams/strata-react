# strata-react

An opinionated React + Tailwind v4 framework for building product frontends: components,
UX patterns and styles, with the testing and review tooling that keeps them honest. Built
from the research in [jburnhams/ux-research](https://github.com/jburnhams/ux-research)
(`ui-library/`), which explains every decision.

It is opinionated about **structure, behaviour, states, accessibility and the stack**, and
deliberately silent about **the look**: there is no default theme. Each product generates its
own palette from its subject, and Tailwind's stock colours, sizes, radii and shadows are
removed so they cannot be typed by accident.

Rules for working in this repo, for people and coding agents: [`CLAUDE.md`](./CLAUDE.md).

## The stack

Node 26 to develop (apps run on 22.22+) · React 19 · TypeScript · Vite 8 · Tailwind v4 · class-variance-authority · lucide-react ·
TanStack Query, Table and Virtual · React Router · Vitest + Testing Library + MSW ·
Storybook 10 · Playwright Chromium + pixelmatch visual regression · GitHub Actions.

## Install

```bash
npm install strata-react react react-dom react-router @tanstack/react-query
npm install -D tailwindcss @tailwindcss/vite
```

The npm package is built: nothing runs on install, and it needs Node 22.22 or later (the floor
react-router 8 and msw set; the repo itself is developed on Node 26). Strata's own dependencies
(TanStack Table and Virtual, class-variance-authority, clsx, tailwind-merge, lucide-react, Radix
Slot) come with it, so an app does not list them.

**Peers.** What an app installs follows from what it imports, and the integration suite checks
it against the built files:

| Import | Needs | Why |
|---|---|---|
| `strata-react` | `react`, `react-dom`, `react-router`, `@tanstack/react-query`, `tailwindcss` | The stack is fixed: `DataTable` and `Tabs` keep sort and tab in the URL, `AppShell` links with `NavLink`, every remote read is `useLoad`. The barrel imports both libraries, so an app that uses only a `Button` still installs them (both are needed for anything past a static page) |
| `strata-react/testing` | the above, plus `@testing-library/react` | `renderWithStrata` wraps Testing Library's `render` |
| `strata-react/visual`, `strata-visual` | `playwright` (exact version), `msw`, `vite` | The screenshot runner; see [Visual regression for apps](#visual-regression-for-apps) |

The last three are optional peers: an app that never imports those entries never needs them.

**An unreleased commit** can be installed from GitHub with
`npm install github:jburnhams/strata-react#<sha>`. npm then runs `prepare`, which installs every
dev dependency and builds the package, so it is slow and wants Node 26 (an older Node warns).
Use it to try a fix before it is released, then move back to the npm version.

## Set up an app

```css
/* src/app.css */
@import "tailwindcss";
@import "strata-react/strata.css";   /* token contract, namespace reset, type steps, base layer */
@import "./theme.generated.css";     /* your palette: ux-research ux-design/skill/scripts/palette.mjs */
@import "./theme.css";               /* your status roles, faces and subject colours, with reasons */
```

No `@source` line for the library is needed. Tailwind's automatic detection skips `node_modules`,
so `strata.css` names the built components itself (`@source "./*.js"`, relative to the installed
file), and importing it is enough for every class they use to be generated. The integration suite
checks this on a copy installed as real files under an app's git-ignored `node_modules`. An app
that sets `source(none)` on its Tailwind import still gets them, since that turns off only
automatic detection.

`theme.css` supplies what Strata names but does not choose: `--success`, `--success-subtle`,
`--warning…`, `--danger…`, `--info…` (pale tint + dark ink of one hue, ink at least 6:1),
`--font-sans` / `--font-display` in an `@theme` block, and optionally `--title-weight`,
`--title-stretch`, `--title-tracking`. See `.storybook/theme.css` for a complete example (the
kiln-room fixture).

```tsx
import { createBrowserRouter, RouterProvider } from "react-router";
import { StrataQueryProvider, ThemeProvider } from "strata-react";
import "./app.css";

const router = createBrowserRouter([{ path: "/", element: <KilnRoom /> }]);

createRoot(document.getElementById("root")!).render(
  <ThemeProvider>
    <StrataQueryProvider>
      <RouterProvider router={router} />
    </StrataQueryProvider>
  </ThemeProvider>,
);
```

`ThemeProvider` sets the `.dark` class strata.css keys on. It follows the operating system until
a person chooses light or dark, keeps that choice in localStorage (and carries on without it when
storage is blocked), and follows a choice made in another tab. Put `<ColorSchemeChoice />` on the
settings page, or build your own control from `useColorScheme()`. So a dark page does not flash
light while the bundle loads, inline the pre-paint script in `index.html`'s `<head>`; generate it
once with `colorSchemeScript()` (it reads the same key the provider writes).

```tsx
// One question: "Is my work out of the kiln yet?"
function KilnRoom() {
  const load = useLoad({ queryKey: ["bookings"], queryFn: () => fetchJson<Booking[]>("/api/bookings") });
  return (
    <AppShell product="Back Lane Clay" nav={nav}>
      <PageHeader title="Kiln room" finding={{ text: "Kiln 2 is safe to open at about 14:50." }} />
      <DataView
        state={load}
        isEmpty={(rows) => rows.length === 0}
        skeleton={<TableSkeleton />}
        empty={<EmptyState title="All three kilns are cold" />}
      >
        {(rows) => <DataTable caption="Work in the kilns" columns={columns} rows={rows} rowKey={(b) => b.id} sortParam="sort" />}
      </DataView>
    </AppShell>
  );
}
```

## Components

| Group | Exports | Notes |
|---|---|---|
| Actions | `Button`, `IconButton`, `RowAction`, `AsyncButton`, `useAsyncAction` | Default is `outline`; one filled button per view; `IconButton` requires `label`; `RowAction` is named for its row ("Withdraw Tom Ellery"); `AsyncButton` keeps one width through idle, pending, done and error, and announces `error` with its retry label; `useAsyncAction` returns `{ phase, run, error }` with a stable `run`, and describes an `HttpError` in a sentence (`describeActionError`, or the product's own `describeError`) |
| Form | `Field`, `Input`, `Textarea`, `NativeSelect`, `ChoiceGroup`, `Checkbox` | `Field` wires label, hint, error, `aria-describedby`, `aria-invalid`; `Checkbox` requires `label` and is one target with it, and has a mixed state |
| Status and figures | `Status`, `Metric`, `MetricStrip` | A status is always a word; figures have no icons or sparklines |
| Data | `DataView`, `Load<T>`, `EmptyState`, `Skeleton`, `DataTable`, `TableSkeleton`, `VirtualList`, `InfiniteList`, `LineChart` | `DataView` requires skeleton and empty; tables and lists virtualise from 100 rows; `InfiniteList` loads the next page on approach, with a skeleton for it, a Try again row when it fails and a Show more button for the keyboard; charts label values directly |
| Selection | `useSelection`, `BulkBar`, `DataTable`'s `selection` (`RowSelection<T>`) | Opt-in checkbox column with "Select all shown" that respects `isSelectable`; the selection drops rows that are gone; `BulkBar` announces the count politely |
| Data loading | `StrataQueryProvider`, `createQueryClient`, `useLoad`, `useInfiniteLoad`, `toLoad`, `fetchJson`, `HttpError` | TanStack Query in, `Load<T>` out; `useInfiniteLoad` works out the cursor itself (after the last item held), merges pages by key and can `dismiss` an item at once |
| Page and navigation | `AppShell`, `SideNav`, `Breadcrumb`, `Tabs`, `PageHeader` | React Router; tab and sort state in the URL |
| Keyboard | `useHotkeys`, `KeysLegend`, `Shortcut`, `useActiveItem`, `ActiveList`, `isTypingTarget` | For queues worked from the keyboard; one shortcut list drives the handler and the legend; keys never fire while typing; answering moves focus to the next item |
| Theme | `ThemeProvider`, `useColorScheme`, `useSystemColorScheme`, `ColorSchemeChoice`, `colorSchemeScript` | System, light or dark; sets `.dark`, persists in localStorage when it can; no picker beyond the settings-page radio group |
| Feedback | `UndoBar`, `useUndoable`, `Done` | Undo before confirm; the hook owns which rows are out of view (`isRemoved`), a failed commit brings the row back with Try again in the same bar, and `flush()` commits before a dependent action; `Done` is the one celebration, and it must say what happens next |
| Helpers | `cn`, `format`, `createFormat`, `NBSP` | `cn` knows `type-*`; all numbers and dates through `Intl`; `format.integer(n)`, `.decimal(n)`, `.percent(n)` are callable and keep Intl's methods; units and counts join with a non-breaking space |
| Testing | `strata-react/testing`: `renderWithStrata`, `createTestQueryClient`, `installLayoutShims`, `installFakeIntersectionObserver` | Router + query client around Testing Library's `render`; a fixed box and ResizeObserver so measuring components render in jsdom; an IntersectionObserver the test fires with `scrollToEnd()` or `intersect(el)`. Role names keep the non-breaking space from `format.count`, so match them with the same call or a `\s` regex |
| Visual regression | `strata-react/visual` and the `strata-visual` command | Screenshots an app's Storybook and its routes in each MSW state, light and dark, against baselines in the app's repo |

Specs for the components not built yet (dialogs, sheets, menus, toasts, command menu, prose)
are in ux-research `ui-library/components.md`.

## Visual regression for apps

`strata-visual` is the runner strata-react tests itself with: Playwright Chromium screenshots,
pixelmatch comparison, light and dark, frozen animations, committed baselines. An app points it at
its Storybook build, its routes, or both. Route mode is for apps whose screens have no stories:
each route is taken in each server state, and the state is set by MSW handlers that answer the
page's requests in Node, so the app needs no test mode and no service worker.

```bash
npm install -D -E playwright        # exact version: the baselines belong to its Chromium
npx playwright install chromium
```

```ts
// strata-visual.config.ts
import { defineVisualConfig } from "strata-react/visual";
import { handlers, queueEmpty, queueError, queueLoading } from "./src/mocks/handlers";

export default defineVisualConfig({
  storybook: "storybook-static",            // optional: every story, tags as below
  app: {
    dir: "dist",                            // the production build, served with history fallback
    base: "/",                              // Vite's base, if the app is built under a path
    handlers,                               // the healthy server, the same handlers the unit tests use
    viewports: ["wide", "phone"],           // 1440×900 and 390×844; "default" is 1024×768
    routes: [
      {
        name: "review",
        path: "/review",
        states: {
          ready: [],
          loading: [queueLoading],
          empty: [queueEmpty],
          error: { handlers: [queueError], waitFor: "role=alert" },  // after the query client's retry
          sorted: { path: "/review?sort=added.desc" },               // URL state is just a path
        },
      },
      {
        name: "settings",
        path: "/settings",
        states: { sync: { setup: (page) => page.getByRole("tab", { name: "Sync" }).click() } },
      },
    ],
  },
});
```

```bash
vite build && npx strata-visual --update   # write baselines into tests/visual/baselines/; commit them
vite build && npx strata-visual            # compare; diffs land in tests/visual/output/
npx strata-visual --filter review--error   # only some shots
```

Baselines are named `route--state--viewport--theme.png` (`review--empty--phone--dark.png`) and
stories `story-id--theme.png`. A shot fails when it differs from its baseline (pixelmatch at
threshold 0.1, anti-aliasing ignored, 20 stray pixels allowed, any size change), when the page
throws or logs an error, when it makes a request no handler answers, or, in CI, when it has no
baseline. Story tags pick the viewport: `visual-wide`, `visual-phone`, `no-visual` to skip.
Pages run in UTC and `en-US`; set `timezone`, `locale` or a frozen `time` in the config.
Strata's own suite (`strata-visual.config.ts`, with the kiln-room example app in
`examples/kiln-app/`) is a working reference.

In CI, install the pinned Chromium and upload the diffs when it fails:

```yaml
- run: npm ci
- run: npx playwright install --with-deps chromium
- run: npm run build
- run: npx strata-visual
- if: failure()
  uses: actions/upload-artifact@v4
  with: { name: visual-diffs, path: tests/visual/output/, if-no-files-found: ignore }
```

Write the baselines in that same Chromium on Linux (in CI, or in the Playwright Docker image of
the pinned version): a Mac renders text differently. `--update` records the Chromium and platform
in `.strata-visual.json`, and a run that differs says so beside its failures.

## Develop

```bash
npm install
npm run storybook           # http://localhost:6006
npm test                    # typecheck + unit tests
npm run test:integration    # build, then check the package and its CSS as an app sees them
npm run test:visual         # strata-visual: every story and the example app's route states, light and dark
npm run test:visual:update  # accept the current screenshots as baselines
npm run site                # build the docs site into site/
```

## Docs site

GitHub Pages serves one site, built by `.github/workflows/pages.yml` on every push to main:
Storybook at the root, the TypeDoc API reference at `/api/`, and a gallery of every visual
baseline (light and dark, linked to its story) at `/visuals/`. One-time setup: Settings → Pages →
Source: GitHub Actions.

## Licence

MIT
