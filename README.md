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

Node 26 · React 19 · TypeScript · Vite 8 · Tailwind v4 · class-variance-authority · lucide-react ·
TanStack Query, Table and Virtual · React Router · Vitest + Testing Library + MSW ·
Storybook 10 · Playwright Chromium + pixelmatch visual regression · GitHub Actions.

## Install

```bash
npm install strata-react react react-dom react-router @tanstack/react-query
npm install -D tailwindcss @tailwindcss/vite
```

The npm package is built: nothing runs on install. It needs **Node 26 or later**, for apps as
well as for this repo; an older Node gets an `EBADENGINE` warning, so upgrade it. Strata's own dependencies
(React Aria Components, TanStack Table and Virtual, class-variance-authority, clsx, tailwind-merge,
lucide-react) come with it, so an app does not list them.

**Peers.** What an app installs follows from what it imports, and the integration suite checks
it against the built files:

| Import | Needs | Why |
|---|---|---|
| `strata-react` | `react`, `react-dom`, `react-router`, `@tanstack/react-query`, `tailwindcss` | The stack is fixed: `DataTable` and `Tabs` keep sort and tab in the URL, `AppShell` links with `NavLink`, every remote read is `useLoad`. The barrel imports both libraries, so an app that uses only a `Button` still installs them (both are needed for anything past a static page) |
| `strata-react/testing` | the above, plus `@testing-library/react` | `renderWithStrata` and `renderRoutes` wrap Testing Library's `render` |
| `strata-react/visual`, `strata-visual` | `playwright` (exact version), `msw`, `vite` | The screenshot runner; see [Visual regression for apps](#visual-regression-for-apps) |

The last three are optional peers: an app that never imports those entries never needs them.

**An unreleased commit** can be installed from GitHub with
`npm install github:jburnhams/strata-react#<sha>`. npm then runs `prepare`, which installs every
dev dependency and builds the package, so it is slow and also needs Node 26.
Use it to try a fix before it is released, then move back to the npm version.

**Updating:** [`UPGRADING.md`](./UPGRADING.md) lists what an app has to change between versions (breaking and test-visible changes only); [`CHANGELOG.md`](./CHANGELOG.md) is the development log.

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
| Actions | `Button`, `IconButton`, `RowAction`, `AsyncButton`, `useAsyncAction` | Default is `outline`; one filled button per view; `IconButton` requires `label`; `RowAction` is named for its row ("Withdraw Tom Ellery"); `AsyncButton` keeps one width through idle, pending, done and error, and announces `error` with its retry label; buttons carry `data-variant` and `AsyncButton` `data-phase` for tests; `useAsyncAction` returns `{ phase, run, error, thrown, fieldErrors, clearFieldError }` with a stable `run`, describes an `HttpError` in a sentence with the server's own reason for a 4xx (`describeActionError`, or the product's own `describeError`), and `validate` plus a server's 422 put messages on `fieldErrors` for each `Field` |
| Form | `Field`, `Input`, `Textarea`, `NativeSelect`, `ChoiceGroup`, `Checkbox` | `Field` wires label, hint, error, `aria-describedby`, `aria-invalid`, and `action` puts a one-field form's button on the control's row with the hint and error under both; `Checkbox` requires `label` and is one target with it, and has a mixed state |
| Status and figures | `Status`, `Metric`, `MetricStrip`, `Meter`, `crossedThreshold`, `CompositionBar` | A status is always a word; figures have no icons or sparklines; `Meter` is a `meter` named for what it measures, with its reading in words ("72% used"), threshold notches, and a `Status` word once a threshold is crossed (each threshold must name its state); `CompositionBar` is a stacked bar over a table naming every part, its amount and share, and names the remainder (`total` needs `restLabel`); a part that is there reads "<1%" and keeps a sliver, never "0%"; `JobStatus` is a long-running server job: a required word per state beside the app's sentence, a progress bar when the total is known, each failure named with its reason, announced only when the item changes or the job ends |
| Data | `DataView`, `Load<T>`, `Stale`, `StaleNotice`, `LoadError`, `EmptyState`, `Skeleton`, `Thumbnail`, `ThumbnailSkeleton`, `DataTable`, `TableSkeleton`, `VirtualList`, `InfiniteList`, `LoadMore`, `useInView`, `LineChart` | `DataView` requires skeleton and empty, keeps data on screen under a `StaleNotice` (why, how old, Try again) when a refresh fails, and takes an `error` renderer for an app's own look of a failed read (default `LoadError`, always inside an alert); `Thumbnail` is a remote image in a box of fixed `aspect`, with a skeleton while it loads, the required `missing` words (or a `fallback` drawing, such as an avatar's initial) when it fails or `src` is null, required `alt`, `children` overlaid in its corners, and a request only once it nears the screen (`eager` for the first few); tables and lists virtualise from 100 rows; a `DataTable` column with `value` sorts by type with missing values last both ways and draws a placeholder (`missing`, default an en dash); `InfiniteList` loads the next page on approach, with a skeleton for it, a Try again row when it fails and a Show more button for the keyboard, and `scroll="page"` draws a grid that scrolls with the page; `LoadMore` is that next-page row for any list or grid; charts label values directly |
| Selection | `useSelection`, `BulkBar`, `SelectableGrid`, `DataTable`'s `selection` (`RowSelection<T>`) | Opt-in checkbox column with "Select all shown" that respects `isSelectable`; Shift-click or Shift+Space chooses or clears the run from the last row clicked, in the order shown; `initial` (keys or a test on the row) chooses a row the first time it appears, so it applies to data that loads later; the selection drops rows that are gone; `BulkBar` announces the count politely, and while it is up its one filled action is the view's only one (the screen's primary goes to `outline`); `SelectableGrid` is the same selection as a grid of pictures (`renderImage`), each tile one labelled target, virtualised from 100 tiles |
| Expansion | `Disclosure`, `useExpanded`, `DataTable`'s `expansion` (`RowExpansion<T>`) | Show more of one row in place. The toggle is a button with `aria-expanded`; the body is mounted only while open, so a request inside it runs on first open (unlike `<details>`, which mounts every closed body); `useExpanded({ param })` shares the open keys across a list or table and keeps them in the URL; a table's detail row spans the data columns and is measured when virtualised |
| Data loading | `StrataQueryProvider`, `createQueryClient`, `useLoad`, `useInfiniteLoad`, `useJob`, `toLoad`, `staleOf`, `fetchJson`, `HttpError`, `readErrorBody`, `fieldErrorsOf` | TanStack Query in, `Load<T>` out; a refetch that fails after a good read stays `ready` with `stale` set, never an error panel; `useInfiniteLoad` works out the cursor itself (after the last item held), merges pages by key and can `dismiss` an item at once; `useJob` polls a job's status only while it runs and invalidates the queries it changes once, when it ends; `fetchJson` reads an error response's body onto the `HttpError` (`body`, `reason`, `fieldErrors`, read by `readErrorBody` or the API's own `readError`) |
| Page and navigation | `AppShell`, `SideNav`, `Breadcrumb`, `Tabs`, `PageHeader`, `LinkCard`, `LinkCardList` | React Router; tab and sort state in the URL; a `LinkCard` is one link named by its title, described by its text and `Status` marks, with the whole card as the target (`to` a route, `href` elsewhere, marked with an arrow) |
| Keyboard | `useHotkeys`, `KeysLegend`, `Shortcut`, `useActiveItem`, `ActiveList`, `isTypingTarget` | For queues worked from the keyboard; one shortcut list drives the handler and the legend; keys never fire while typing; answering moves focus to the next item |
| Theme | `ThemeProvider`, `useColorScheme`, `useSystemColorScheme`, `ColorSchemeChoice`, `colorSchemeScript` | System, light or dark; sets `.dark`, persists in localStorage when it can; `ColorSchemeChoice` is a radio list for a settings page, or `compact` icon segments named "Appearance" for an app with no settings page |
| Toolbar and toggles | `Toolbar`, `ToolbarSeparator`, `Toggle`, `ToggleGroup`, `Switch` | A toolbar is one tab stop with arrows, Home and End inside; needs a `label`. `Toggle` (`aria-pressed`) and `ToggleGroup` (one of 2 to 7, always one chosen) show chosen as an ink border on a tint, never the filled primary, so they do not break the one-filled-button rule; an icon-only toggle still needs its `label` (shown as a tooltip). `Switch` is only for a setting that applies at once, label and control one target |
| Commands | `Command`, `useCommands`, `Menu`, `ContextMenu`, `CommandMenu`, `CommandLegend`, `formatChord`, `matchesChord` | A command is declared once (label or label function, chords, `disabled` with a reason, `destructive`, `checked`) and drives the key handler, dropdown and menu-bar menus, the context menu, the searchable command menu (Mod+K) and the legend, so they cannot disagree. Chords are written once ("Mod+Shift+Z") and shown per platform (⇧⌘Z, Ctrl+Shift+Z); they never fire while typing or during IME composition, and a chord the browser keeps (Ctrl+S) needs `claim: true`. `useHotkeys` is unchanged for single keys |
| Overlays | `Dialog`, `DialogProps`, `AlertDialog`, `Popover`, `Tooltip` | React Aria underneath. A dialog always has a title and, via `actions`'s close render prop, a way out; `closable={false}` while work cannot stop; `placement="end"` is a sheet. `AlertDialog` is the only confirm: required verb on the confirm button, Cancel focused first, no outside dismiss, stays open with the reason when an async confirm fails. `Popover` needs a `label`. `Tooltip` opens on hover and focus and `IconButton` uses it. All portal onto the `layer-*` stacking utilities |
| Value controls | `NumberField`, `Slider`, `ColorField` | Set a number or colour precisely, inside `Field`. `NumberField` and `Slider` are React Aria's; the number field runs with `commitBehavior="validate"`, so a typed value outside `min`/`max` is kept on screen, explained in the `Field` ("Enter a value from 0% to 500%.") and never passed to `onChange`. A value that is not known is `null` and shows an en dash, never 0 or NaN. Digits and decimal mark follow `locale`. The unit sits inside the control, and in the slider's spoken value when `Intl` has it (%, °, ms, s, kB, MB, GB, kbps, Mbps). Arrows step, Home/End jump to the limits; `Slider editable` adds a number field. `ColorField`: platform picker, typed hex that is normalised, app suggestions, and a contrast note against `against`. No motion on value changes |
| Notices and progress | `Alert`, `toast`, `StrataToastRegion`, `useClientWork`, `JobStatus` | Three weights. A `toast` confirms finished work and goes by itself (5 s plus 40 ms a character, 8 s minimum with an action, paused under the pointer or focus, always dismissable); it has no danger tone, because an error a person must act on is an inline `Alert` with its recovery as `action` (`announce` makes it `role="alert"` only when it answers something the person just did). `StrataToastRegion` goes once at the app root. `useClientWork` runs browser work with progress, cancel (aborts its `signal`, ends `cancelled`, never `failed`) and a double-start guard; `JobStatus` shows it exactly as it shows a server job, with `onCancel`, `cancelled` and `onDismiss` |
| Inspector | `Inspector`, `InspectorSection`, `PropertyRow`, `PropertyList` | Properties of the selected thing. `Inspector` is a labelled region with the selection's name as its heading and the empty state (`empty`, required) when `title` is `null`; `selectionKey` gives a new selection fresh controls and keeps focus in the panel. `InspectorSection` is React Aria's `Disclosure` with the body mounted only while open; open and closed are remembered under `storageKey` (storage that throws just means defaults). `PropertyRow` is a `Field` with a "Reset <label>" that shows only while `modified`. `PropertyList` is a `dl`: missing values print an en dash heard as "Not known", units follow a non-breaking space, long values truncate with the whole value in a tooltip |
| Feedback | `UndoBar`, `useUndoable`, `Done` | Undo before confirm; the hook owns which rows are out of view (`isRemoved`), a failed commit brings the row back with Try again in the same bar, and `flush()` commits before a dependent action; `Done` is the one celebration, and it must say what happens next |
| Helpers | `cn`, `format`, `createFormat`, `NBSP` | `cn` knows `type-*`; all numbers and dates through `Intl`; `format.integer(n)`, `.decimal(n)`, `.percent(n)` are callable and keep Intl's methods; `format.bytes(n, unit?)` writes sizes in decimal units (`byteUnit` shares one unit across figures); `format.date(at)` ("8 Nov 2026") and `format.dateTime(at)` ("8 Nov 2026, 06:05"), like `clock`, `day` and `shortDay`, take a Date, ISO string or epoch ms; `format.ago(at, now?)` ("3 weeks ago"), `format.compact(n)` ("1.2k", and `count(n, one, many, { compact: true })`), `format.runningTime(seconds)` ("1:02:09") and `format.share(n)` ("<1%" for a part that rounds to 0); every number and date formatter prints the placeholder (`format.missing`, an en dash) for `null` or `undefined`; `createFormat(locale, { timeZone, missing })` fixes the zone and the placeholder; units and counts join with a non-breaking space |
| Testing | `strata-react/testing`: `renderWithStrata`, `renderRoutes`, `createTestQueryClient`, `installLayoutShims`, `installFakeIntersectionObserver`, `filledButtons`, `expectOneFilledButton`, `asyncButtonPhase` | Router + query client around Testing Library's `render`; `renderRoutes(routes, { route, basename })` renders the app's own `RouteObject[]` in a memory data router, so layout routes, redirects, loaders and error elements run, and returns the `router` (where a redirect landed is `router.state.location`) and an act-wrapped `navigate`; a fixed box and ResizeObserver so measuring components render in jsdom; an IntersectionObserver the test fires with `scrollToEnd()` or `intersect(el)`; `filledButtons()` and `expectOneFilledButton()` check "one filled button per view" from `data-variant`, and `asyncButtonPhase(el)` reads an `AsyncButton`'s phase. Role names keep the non-breaking space from `format.count`, so match them with the same call or a `\s` regex |
| Visual regression | `strata-react/visual` and the `strata-visual` command | Screenshots an app's Storybook and its routes in each MSW state, light and dark, against baselines in the app's repo |

Specs for the components not built yet (menus, toasts, command menu, prose)
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
stories `story-id--theme.png`. A shot fails when it differs from its baseline, when any of its
text is drawn in a font installed on the machine rather than one the page loaded, when the page
throws or logs an error, when it makes a request no handler answers, or, in CI, when it has no
baseline.

**Comparison.** Both images are box-blurred 3×3, then compared with pixelmatch at threshold 0.1
(anti-aliased pixels ignored) and 4 differing pixels allowed; any size change fails. The blur
keeps the ink an edge or glyph lays down and drops where exactly it fell, which is what differs
between rasterisers: on Strata's 218 shots, Chromium's GPU raster path moved up to 159 pixels a
shot under plain pixelmatch and at most 1 after the blur, while a changed letter still moved 2 to
4,500 (172 of 182 caught, against 145 before). Override with `compare: { threshold, blur,
maxDiffPixels, includeAA }` only with evidence from your own screens. The summary line says how
many shots were pixel-identical and how many matched within tolerance (the five closest to
failing are listed as `within`).

**Fonts.** Every face must be one the page loads: bundle it with `@fontsource` (or your own
`@font-face`) and name it first in the theme's `--font-*`. Strata's defaults fall through to
`ui-sans-serif`, which is Cantarell on one Linux, DejaVu Sans on another and San Francisco on a
Mac, and a glyph missing from a web font (an arrow, `⌘`) falls back the same way; no threshold
absorbs that. The runner asks Chromium which face drew each element's text and fails the shot
naming the face and an example (`"DejaVu Sans" in <kbd> "⌘"`). `systemFonts: "warn"` reports
instead; `"allow"` skips the check. Story tags pick the viewport: `visual-wide`, `visual-phone`, `no-visual` to skip.
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
`STRATA_VISUAL_CHROMIUM_ARGS` adds Chromium flags for experiments; Strata's
`visual-portability` workflow uses it to run the suite under GPU rasterisation, on arm64 and on
another Ubuntu against the committed baselines.

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
