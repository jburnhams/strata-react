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
TanStack Query and Table · React Router · Vitest + Testing Library + MSW ·
Storybook 10 · Playwright Chromium + pixelmatch visual regression · GitHub Actions.

## Install

```bash
npm install strata-react react react-dom react-router @tanstack/react-query
npm install -D tailwindcss @tailwindcss/vite
```

The npm package is built: nothing runs on install. It needs **Node 26 or later**, for apps as
well as for this repo; an older Node gets an `EBADENGINE` warning, so upgrade it. Strata's own dependencies
(React Aria Components, TanStack Table, class-variance-authority, clsx, tailwind-merge,
lucide-react) come with it, so an app does not list them.

**Peers.** What an app installs follows from what it imports, and the integration suite checks
it against the built files:

| Import | Needs | Why |
|---|---|---|
| `strata-react` | `react`, `react-dom`, `react-router`, `@tanstack/react-query`, `tailwindcss` | The stack is fixed: `DataTable` and `Tabs` keep sort and tab in the URL, `AppShell` links with `NavLink`, every remote read is `useLoad`. The barrel imports both libraries, so an app that uses only a `Button` still installs them (both are needed for anything past a static page) |
| `strata-react/testing` | the above, plus `@testing-library/react` | `renderWithStrata` and `renderRoutes` wrap Testing Library's `render`, with a `StrataToastRegion` (so a toast can be found; `toasts: false` if your route tree renders the region, which a root layout route is the best place for) and the toast queue cleared first |
| `strata-react/map` | `leaflet` (optional peer, `^1.9.4`) | `RouteMap`: themed routes and a moving position on the tiles an app supplies |
| `strata-react/hls` | `hls.js` (optional peer, `^1.6.0`) | `attachHls` for `MediaPlayer attach` and `useAttachedSource`: HLS through hls.js wherever the browser has Media Source Extensions (the element's own where not), recovered quietly where it can be, and a stream still being made |
| `strata-react/panorama` | none | `PanoramaViewer`: a 360 (equirectangular) picture or video as a window you pan and zoom, WebGL2 with a flat fallback; its own entry so an app with no 360 ships no GL code |
| `strata-react/scene` | none | `SceneViewport`: the frame, input and camera for a 3D scene the app draws (WebGL2); its own entry so an app with no 3D ships none of it |
| `strata-react/visual`, `strata-visual` | `playwright` (exact version), `msw`, `vite` | The screenshot runner; see [Visual regression for apps](#visual-regression-for-apps) |

The map, HLS, testing and visual entries need optional peers: an app that never imports those entries never needs them.

**pnpm 12** will not install a version younger than its `minimumReleaseAge`, and strata-react releases on every merge, so a fresh release is skipped until it is old enough (pnpm then adds that one version to `minimumReleaseAgeExclude`, which exempts only it). To take each release as it comes, exempt the package once in `pnpm-workspace.yaml`:

```yaml
minimumReleaseAgeExclude:
  - strata-react
```

The alternative is to accept the wait on every release.

**An unreleased commit** can be installed from GitHub with
`npm install github:jburnhams/strata-react#<sha>`. npm then runs `prepare`, which installs every
dev dependency and builds the package, so it is slow and also needs Node 26.
Use it to try a fix before it is released, then move back to the npm version.

**Updating:** [`UPGRADING.md`](./UPGRADING.md) lists what an app has to change between versions (breaking and test-visible changes only); [`CHANGELOG.md`](./CHANGELOG.md) is the development log.

## Set up an app

**The default look is in `strata.css`.** One import gives an app a finished, checked theme (light and
dark) and nothing else to write:

```css
@import "tailwindcss";
@import "strata-react/strata.css";   /* the contract and the default look: palette, status roles, faces, radii, shadow */
```

It is petrol and marigold on a faintly cool ground, with three radii that differ (6, 10 and 14 px), one
petrol-tinted shadow for what floats, **Instrument Sans** for text (at 85% width and heavier for titles and
big figures) and **JetBrains Mono** for code, both bundled. Marigold is the one warm accent and only marks
where attention already is (a selection, the active item of a keyboard-worked list). Every value is a token:
override any of them in a later `:root`, `.dark` or `@theme` block, or bring a whole palette
(`theme.generated.css`) after it. **Palettes are themes beside light and dark.** Five ship in `strata.css` (petrol and marigold, pine and coral,
cobalt and tangerine, steel and mint, clay and teal), each with a light and a dark set, chosen with a
`data-palette` attribute on the root that `ThemeProvider` sets (`defaultPalette`, persisted under
`strata-palette`). The picker is `<PaletteChoice />` (a list for a settings page, each option with a swatch
in its own colours) or `<PaletteChoice compact />` (swatches for a header); `usePalette()` is the hook, and
`paletteScript()` goes in `<head>` beside `colorSchemeScript()` so the page does not flash the default.
Status colours are the same in every palette. An app's own palette is a `[data-palette="name"]` block (and
`.dark [data-palette="name"]`) of the same roles, passed to `PaletteChoice options`.

Reading surfaces can add `@import "strata-react/reading.css"` for Source
Serif 4 as `font-reading`; it is opt-in so other apps bundle nothing for it.

**To opt out of the look** (an app that has its own, such as Tubes) import the contract alone, which is what
`strata.css` was before the look existed:

```css
@import "strata-react/strata.bare.css";   /* no colours, no look; Geist is the only default (the face) */
```

The ramps are `palette.mjs` output (`--primary "#00798f" --secondary "#f2a900" --contrast 0.5 --ground tinted`);
regenerate rather than edit. The Storybook and the example app run on the default look, so every baseline in
`tests/visual/baselines/` shows it.

The longer form, for a product with its own palette (imports `strata.bare.css`):


```css
/* src/app.css */
@import "tailwindcss";
@import "strata-react/strata.bare.css";   /* token contract, namespace reset, type steps, base layer; no look */
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
`--font-sans` / `--font-display` in an `@theme` block (Strata's default `--font-sans` is Geist Variable, bundled; name your own to replace it), and optionally `--title-weight`,
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

### Testing with Vitest, or with Jest

strata-react is ESM-only (`exports` has only `import`), as is its peer `react-router`. **Vitest is the supported runner**: it needs no configuration beyond the `strata-react/testing` helpers. Its setup file is these lines (MSW's server lifecycle is the app's own, beside them):

```ts
// tests/setup.ts
import "@testing-library/jest-dom/vitest";
import { afterEach } from "vitest";
import { setupStrataTests } from "strata-react/testing";

setupStrataTests({ afterEach }); // layout shims, then after each test: unmount, clear toasts, forget loaded thumbnails
```

With Vitest's `globals` off (its default) Testing Library does not clean up by itself, so without this each `renderRoutes` stacks on the last and a role query finds the same tree twice. The shims do nothing where there is no DOM, so the same file can serve `// @vitest-environment node` tests. An app on Jest has to do the work itself (strata-vid's `jest.base.config.js` is a working example): transform `.mjs` along with `.js`; leave `strata-react`, `react-router`, `@remix-run`, `cookie-es`, `@tanstack` and `pixelmatch` out of `transformIgnorePatterns` so Babel compiles them; and replace `import.meta` for CommonJS with a small Babel plugin (react-router reads it). Strata's own suite runs on Vitest only, so a Jest setup is the app's to keep working.

### An app that already has its own Tailwind colours and sizes

`strata.css` clears Tailwind's stock colours, type sizes, radii, shadows and fonts, so `bg-stone-100`, `text-sm`, `rounded-xl` and
`shadow-lg` stop compiling (even `@apply bg-stone-100` fails to build). That is right for a new app and a cliff for an app of
thousands of lines. Such an app imports the same stylesheet **without the reset** and moves screens over one at a time:

```css
@import "tailwindcss";
@import "strata-react/strata.migrate.css";   /* everything in strata.css except the namespace reset */
@import "./theme.generated.css";             /* still needed: the roles Strata's components use (bg-primary, border-input…) */
@import "./theme.css";
```

1. Supply the roles. Generate the palette with `palette.mjs` as for a new app, or, to keep today's look, write the role variables
   from the app's own colours (`:root { --primary: var(--color-emerald-600); --background: var(--color-stone-50); … }` and the
   `@theme inline { --color-primary: var(--primary); … }` mapping `palette.mjs` writes: the stock `--color-*` variables still exist
   in this mode). Turn on dark mode through `ThemeProvider`; the app's own `dark:` classes keep working beside it.
2. Convert a screen at a time to Strata components and roles. `npx strata-stock-classes src` lists the stock classes left
   (colours, `text-sm`…, `rounded-xl`…, `shadow-lg`…, `font-serif`) by file and line, with the role that replaces each;
   `--fail` exits 1 while any remain, to hold the line in CI. It reads class names as text, so it is a list to work from.
3. When it finds none, change the import to `strata-react/strata.css`. A new app starts there; use the migration import only
   for an existing one. The integration suite checks that a stock class and a Strata component compile together in this mode,
   and that the normal one still removes the stock ones.

## Components

| Group | Exports | Notes |
|---|---|---|
| Actions | `Button`, `IconButton`, `RowAction`, `AsyncButton`, `useAsyncAction` | Default is `outline`; one filled button per view; `IconButton` requires `label`; `RowAction` is named for its row ("Withdraw Tom Ellery"); `AsyncButton` keeps one width through idle, pending, done and error, and announces `error` with its retry label; buttons carry `data-variant` and `AsyncButton` `data-phase` for tests; a `title` is refused (type `never`, and a development warning): a tip is a `Tooltip`, or `IconButton`'s `label` and `hint`; `useAsyncAction` returns `{ phase, run, error, thrown, fieldErrors, clearFieldError }` with a stable `run`, describes an `HttpError` in a sentence with the server's own reason for a 4xx (`describeActionError`, or the product's own `describeError`), and `validate` plus a server's 422 put messages on `fieldErrors` for each `Field` |
| Form | `Field`, `Input`, `Textarea`, `NativeSelect`, `ChoiceGroup`, `Checkbox` | `Field` wires label, hint, error, `aria-describedby`, `aria-invalid`, and `action` puts a one-field form's button on the control's row with the hint and error under both; `Checkbox` requires `label` and is one target with it, and has a mixed state |
| Status and figures | `Status`, `Metric`, `MetricStrip`, `Meter`, `crossedThreshold`, `CompositionBar`, `WorkflowSteps`, `WorkflowSummary`, `JobsTable`, `ScheduleTable`, `SystemPanel`, `useSystemInfo`, `PauseButton` | A status is always a word; figures have no icons or sparklines; `Meter` is a `meter` named for what it measures, with its reading in words ("72% used"), threshold notches, and a `Status` word once a threshold is crossed (each threshold must name its state); `CompositionBar` is a stacked bar over a table naming every part, its amount and share, and names the remainder (`total` needs `restLabel`); `other={{ label }}` folds data-driven parts past five into one "Other" part (the four largest stay in order), and a production build folds instead of throwing; a part that is there reads "<1%" and keeps a sliver, never "0%"; `JobStatus` is a long-running server job (its `progress` `{ done, total, current }` reads "12 of 40 done, 28 remaining · IMG_0412"; `useJobAction` starts one: busy until the server answers, a "queued" toast with a link to the jobs page, a "finished" toast when it ends): a required word per state beside the app's sentence, a progress bar when the total is known, each failure named with its reason, announced only when the item changes or the job ends; `WorkflowSteps` draws strata-python's shared `WorkflowRun` (`/api/workflows/<pipeline>/subjects/<id>`): each stage's state as a word, when it ran and how long it took, a failed stage's error with Try again, and Approve on a waiting gate (the first is the view's filled button), saying who approved or that its policy did; `JobsTable` is the shared jobs page (`GET /api/jobs`): each job's state as a word with its progress or error, and Cancel or Run again only where they apply. Both take the app's generated `Schema<"WorkflowRun">` and `Schema<"Task">` as they come; `ScheduleTable` is a machine's scheduled jobs (systemd timers, cron), not the queue: each job's last result as a word (OK, Failed, Running, Never run), when it last ran and when it runs next, the last two dropping on a phone; `SystemPanel` is strata-python's `GET /api/system` (`useSystemInfo()` reads it): version and commit, uptime, each folder as a `Meter` on shared disk limits ("Filling up", "Nearly full") or the word Missing, each service Up or Down with the server's reason, and the app's own `facts`; `PauseButton` takes the `Poll` from `usePoll` (passed to `useLoad({ poll })`): a fixed-name "Pause updates" toggle and "Updated 12:00" |
| Data | `DataView`, `Load<T>`, `Stale`, `StaleNotice`, `LoadError`, `EmptyState`, `Skeleton`, `Thumbnail`, `ThumbnailSkeleton`, `DataTable`, `TableSkeleton`, `VirtualList`, `InfiniteList`, `LoadMore`, `useInView`, `LineChart` | `DataView` requires skeleton and empty, keeps data on screen under a `StaleNotice` (why, how old, Try again) when a refresh fails, and takes an `error` renderer for an app's own look of a failed read (default `LoadError`, always inside an alert); `Thumbnail` is a remote image in a box of fixed `aspect`, with a skeleton while it loads, the required `missing` words (or a `fallback` drawing, such as an avatar's initial) when it fails or `src` is null, required `alt`, `children` overlaid in its corners, and a request only once it nears the screen (`eager` for the first few); tables, lists and tile grids virtualise from 100 rows, on React Aria's Virtualizer; a `DataTable` is a React Aria table (a `grid`) over TanStack Table's data model; a `DataTable` column with `value` sorts by type with missing values last both ways and draws a placeholder (`missing`, default an en dash); `InfiniteList` loads the next page on approach, with a skeleton for it, a Try again row when it fails and a Show more button for the keyboard, and `scroll="page"` draws a grid that scrolls with the page; `LoadMore` is that next-page row for any list or grid; charts label values directly; `LineChart` can also follow an app's position (`current`), read a value at the pointer or by arrow keys (`readout`, one slider whose value text is the reading), report a picked x (`onPick`) and fill one flat area (`area`); `xLabel` names the x column of its table `Thumbnail`'s `src` may be a list tried in order, `onLoad` can reject a picture that loaded (a host's grey placeholder) and `onMissing` is told once when none worked; with `alt=""` and a `fallback` its missing state is presentational. `LoadMore` and `InfiniteList` can draw the Show more and loading rows the app's way (`more`, `loading`, and `ruled={false}` for no hairlines).; a `DataTable` column's `hideBelow="sm"` hides its header and cells together on a narrow screen (CSS only; a virtualised table drops the column by a media query), never a hand-written `matchMedia` filter |
| Compare | `Compare`, `PairVote`, `PairJudge`, `CompareAudio`, `CompareText`, `CompareGrid`, `CompareVideoGrid`, `ViewportFrame`, `useViewport`, `FullscreenFrame`, `useDifference`, `differences` | Two pictures judged together: side by side, swipe (a divider that moves from the keyboard, across or down), fade (or multiply, both inks at once), blink (`x` flips), difference (a live difference blend with amplify, or pixelmatch's changed pixels with a tolerance and the share that differ; pixels are read only when that view is open, at most 2048 px on the long side, and a picture the browser will not let the page read says so in words); and, offered through `modes`, above and below (`stack`, for wide pictures such as a spread) and ink match (`match`: matched ink, ink only in A and only in B in three theme colours, within a `Near` reach, with the share that agrees; `inkMatch`, `useInkMatch`); `maxHeight="fit"` measures the window for the pair and its surroundings instead of the `"viewport"` guess; `CompareGrid` is every candidate at once with the same zoom and full screen, and `actions` for what a tile offers; one zoom and pan for both sides (buttons, `+` `-` `0`, Ctrl-wheel or trackpad pinch, drag, arrow keys, double click, `1:1`), and full screen (the browser's Fullscreen API, a modal where there is none). `blind` is required: a blind comparison names pictures by `label` only and never writes the variant `id`, `note` or `alt`. A picture that fails shows the required `missing` words in its place; the keys come from one `Shortcut[]` shared with `KeysLegend`, and `keys={false}` leaves them to a surrounding screen. `PairVote` wraps `Compare` for a blind pairwise judgment: answer keys `a` `b` `t` `s` in Compare's one legend, a vote bar with no filled button, `pending`, a flag menu, a progress line, preload and Undo, and click to choose (a click on the picture you prefer, not a drag or double click; in swipe the side of the divider, in blink the side showing, none in fade or difference; `onPick` on `Compare` and `CompareVideo`, `pick={false}` turns it off). `CompareAudio` is one transport for two clips with an A/B switch that keeps the playhead (same time, or the same share when the lengths differ), a loop range and loudness matching (the louder clip turned down to the quieter, by RMS); `CompareText` is two texts scrolled together with a word diff and an optional reference; `PairJudge` is the answering around any of them; `CompareVideo` is two videos on one clock (play, pause, seek and speed drive both, the follower kept within a frame, both held while either waits for data) in side by side, swipe, fade and blink, with zoom and pan locked and nearest-neighbour pixels past 1:1, candidates of different sizes drawn in one box, one soundtrack (`audio`), and the same slots as the rest. `autoPlay` starts the pair once both can play (muted; not with reduced motion unless `"always"`) and `loopWhole` loops the whole clip when no range is set (also on `CompareVideoGrid`). Frame by frame (`,` `.`), a loop range the app can hold (`i` `o` `c`), speeds down to 0.1 and named `moments` are in it; `CompareVideoGrid` is every candidate's video at once on that one clock (one transport, one zoom, regions, a loop, stepping), light on the browser (metadata only until the first play, cells out of sight paused and left out of the sync, sound off unless `audio` names a cell, a cell that falls behind marked "Catching up"), with an optional `reference` drawn first, never blind and nearest-neighbour. `regions` (on `Compare`, `CompareVideo` and `CompareGrid`) names boxes in the source's coordinates to look at enlarged: chips, keys `q` `w` `e` `r` `y` `u`, nearest-neighbour drawing, the box outlined while its chip is pointed at, and Shift-drag to make another |
| Selection | `useSelection`, `useChoices`, `BulkBar`, `SelectableGrid`, `DataTable`'s `selection` (`RowSelection<T>`) | Opt-in checkbox column with "Select all shown" that respects `isSelectable`; Shift-click or Shift+Space chooses or clears the run from the last row clicked, in the order shown; `initial` (keys or a test on the row) chooses a row the first time it appears, so it applies to data that loads later; the selection drops rows that are gone; `BulkBar` announces the count politely, and while it is up its one filled action is the view's only one (the screen's primary goes to `outline`); `SelectableGrid` is the same selection as a grid of pictures (`renderImage`), each tile one labelled target, virtualised from 100 tiles; as a photo grid it takes a pixel `tileSize` zoomed by Ctrl/Cmd+wheel, `+` and `-` and two-finger pinch (`onTileSizeChange`), `aspect="natural"` (rows of equal height, each picture at its `naturalAspect`), a marquee from between tiles, `selectionMode` and `selectionBehavior` (`replace` is the Finder's rules; `onAction` opens), `groupBy` (sticky headings with a group box and a fold), a corner `badge`, `unselectableReason`, and counts what a filter hides ("3 chosen are hidden by the filter"); `ViewOptions` with `useViewOptions` is the one toolbar for how it is looked at: sort (natural order, direction named for the key), group, size slider, aspect, grid or list and a filter with its count, kept in `localStorage` and optionally `?sort=…&group=…&size=…`, a "View" popover on a phone. A choice can imply others: `implies(key)` (on `useSelection`, and `useChoices` for a lazy tree) keeps what the person chose apart from what that brings in, follows it through, locks the implied keys (they only clear with what implied them), and gives `implied`, `because(key)`, `counts`, a `note` for the live region and `summary(noun, then)`, the line a destructive confirm can carry ("12 results will be forgotten: 8 chosen, 4 that depend on them") |
| Expansion | `Disclosure`, `useExpanded`, `DataTable`'s `expansion` (`RowExpansion<T>`) | Show more of one row in place. The toggle is a button with `aria-expanded`; the body is mounted only while open, so a request inside it runs on first open (unlike `<details>`, which mounts every closed body); `useExpanded({ param })` shares the open keys across a list or table and keeps them in the URL; a table's detail row spans the data columns and is measured when virtualised |
| Data loading | `StrataQueryProvider`, `createQueryClient`, `useLoad`, `usePoll`, `useInfiniteLoad`, `useJob`, `useWorkflowRun`, `isWorkflowRunning`, `toLoad`, `staleOf`, `fetchJson`, `createApi`, `appBase`, `withBase`, `HttpError`, `readErrorBody`, `fieldErrorsOf` | TanStack Query in, `Load<T>` out; a refetch that fails after a good read stays `ready` with `stale` set, never an error panel; `useLoad({ poll })` with `usePoll({ every })` reads again on an interval until the person pauses it (`PauseButton`), and once at once on resume; `useInfiniteLoad` works out the cursor itself (after the last item held), merges pages by key and can `dismiss` an item at once; `useJob` polls a job's status only while it runs and invalidates the queries it changes once, when it ends; `fetchJson(url, { json })` sends a JSON body (content type and `POST` set for you); `createTypedApi<paths>()` is the same typed by `strata-api-types`' `paths` (path, `{params}`, `query`, `json` and the answer are checked); `createApi({ base })` is `get`/`post`/`put`/`patch`/`delete` over it with the app's base put before root-relative paths (`appBase()` reads the page's `<base href>`, so the app works behind a reverse proxy; use `withBase` for an `<img src>` or a download link); `fetchJson` reads an error response's body onto the `HttpError` (`body`, `reason`, `fieldErrors`, read by `readErrorBody` or the API's own `readError`); the strata apps' shared server shapes (`strata_python.contracts`): `apiPage<T>()` gives `useInfiniteLoad` the `Page<T>` items and its own `next` cursor (nothing held or dismissed changes it), `isTaskRunning(task, FINISHED)` is `useJob`'s `isRunning` for a `Task`, and an error body's `payload` (what is already running, on a 409) is on `HttpError.payload`, read typed with `errorPayload<T>(error)`; `useWorkflowRun({ finished })` is `useJob` for a `WorkflowRun`, polling while the run's job (`WorkflowRun.job`) is in a state not in `finished` |
| Page and navigation | `AppShell`, `SideNav`, `Breadcrumb`, `Tabs`, `PageHeader`, `LinkCard`, `LinkCardList` | React Router; tab and sort state in the URL; a `LinkCard` is one link named by its title, described by its text and `Status` marks, with the whole card as the target (`to` a route, `href` elsewhere, marked with an arrow only when it is on another origin or `external`) |
| Keyboard | `useHotkeys`, `KeysLegend`, `Shortcut`, `useActiveItem`, `ActiveList`, `isTypingTarget`, `useRebindableShortcuts`, `ShortcutEditor`, `keyName` | For queues worked from the keyboard; one shortcut list drives the handler and the legend; keys never fire while typing; answering moves focus to the next item. To let a person rebind the keys, give the same `Shortcut[]` to `useRebindableShortcuts` (remembered under `storageKey`, or handed to `onChange`) and pass its `shortcuts` to `useHotkeys` and `KeysLegend` and its result to `ShortcutEditor`: each action with its keys and a Change that records the next key, a chord refused with the reason (Ctrl, Cmd and Alt belong to the browser), a conflict named with a swap, Reset and Reset all, all said in a polite status `useHotkeys` takes `within` (keys count only with focus inside a region; a shortcut marked `anywhere` stays page-wide) and returns `live`, the keys that answer right now, for `KeysLegend`. |
| Theme | `ThemeProvider` (`defaultPalette`), `PaletteChoice`, `usePalette`, `paletteScript`, `palettes`, `useColorScheme`, `useSystemColorScheme`, `ColorSchemeChoice`, `colorSchemeScript` | System, light or dark; sets `.dark`, persists in localStorage when it can; `ColorSchemeChoice` is a radio list for a settings page, or `compact` icon segments named "Appearance" for an app with no settings page |
| Density | `Density`, `DensityName`, `ThemeProvider`'s `density`, `ControlSize` (`size="sm"` on `Input`, `NativeSelect`, `NumberField`, `IconButton`) | Control height is two variables, `--control-h` and `--control-h-sm`. `<ThemeProvider density="compact">` or `<Density page value="compact">` sets them app-wide, including dialogs and menus, which portal out of the app's root; `<Density value="compact">` is one region (a toolbar, a dense panel) and does not reach its overlays. A coarse pointer (touch) always gets 44px targets, whatever the density A second look for a region is roles alone: set `--control-h`, `--control-h-sm`, `--control-px`, `--control-px-sm`, `--control-icon` and each type step's `--type-<step>-size`, `-leading` and `-weight` (`caption`, `label`, `body-sm`, `body`, `heading`, `title`, `figure`) on a class; the defaults are today's values. |
| Workspace | `Workspace`, `WorkspaceBar`, `Split`, `Pane`, `useWorkspaceState`, `WorkspaceState` | One screen of panes for a tool: splits of panes with a growing stage, a header on every pane (name, actions, fold button), separators that resize by pointer and by keyboard (arrows, Shift, Home, End, Enter to restore) within each pane's `min` and `max`, panes that fold to a rail or header bar with a visible way back (and `state.toggle(id)` from a menu), sizes and folds remembered with `useWorkspaceState("name")`, and stacking below 720px. `WorkspaceBar` is the one bar across the top (the tool's name as the `h1`, a polite status, the filled action, an end slot for the scheme and palette choice, wrapping on a phone), where `PageHeader` is an app screen's heading and `Toolbar` a row of controls inside a pane. A pane's body is inset by default so an `Inspector` lines up with the pane's name; `flush` draws a tree, table or stage edge to edge. `onFiles` and `acceptLabel` on `Workspace` take files dropped anywhere on the window (`FileDropOverlay`). Each pane is a labelled region |
| Writes kept while offline | `createOutbox`, `useOutbox`, `useOutboxStarted`, `OutboxStatus`, `isRefusal` | Writes that must not be lost when the connection is (answers in a game played on a tablet whose wifi drops): kept in localStorage (`strata:outbox:<name>`), sent one at a time oldest first, a dependent write (`after`) refused with what it follows; a 4xx is refused and listed with the server's reason until dismissed, anything else (no answer, 5xx, 401/403 from a login, 408, 429) waits and is tried again after 2 s doubling to a minute, at once on `online` or when the page is shown. `add` answers how the first try went (`sent`, `waiting`, `refused`) so a screen goes on without the server. Every write must be idempotent on the server (a client-made id). `OutboxStatus noun="answer"` is the sign: nothing while all is sent, "3 answers kept on this device. The server could not be reached. Trying again at 10:42." with Send now, and the refused list |
| Items kept for offline | `createReserve`, `useReserve` | The read side of the outbox: items the server made ahead (rounds of play), kept per key in localStorage (`strata:reserve:<name>:<key>`), `size` each. `take(key)` removes and returns the oldest (an item is used once); `refresh(key, fresh)` after a fresh item arrives drops kept items `sameMake(kept, fresh)` calls out of date and tops up in one request when fewer than half remain (one in flight per key; a failure is tried again at the next refresh); `useReserve(reserve, key)` is the count for "6 rounds kept for offline"; `seed` and `clear` for tests and stories. Without storage nothing is kept and `persisted` says so |
| History and save state | `useHistory`, `useHistoryState`, `History`, `useAutoSave`, `SaveStatus`, `SaveState`, `useLeaveGuard` | Undo and redo for a document edited over a session: a step is a name and an `undo`/`redo` pair, `begin(label)` groups a drag into one step, a `key` merges a slider's pushes, a `limit` drops the oldest. `history.commands` are Undo and Redo as `Command`s ("Undo move clip", Mod+Z, Mod+Shift+Z or Mod+Y) for `useCommands` and `Menu`. `useAutoSave` debounces and never overlaps saves; `SaveStatus` is the fixed-width sign ("Saved 10:42", "Saving…", "Unsaved changes", "Not saved" with the reason and "Try again"), quiet except for a failure and its recovery. For one removal that commits after a few seconds, use `useUndoable` |
| Links and URL choices | `ButtonLink`, `TextLink`, `useSearchParam`, `NativeSelect param=`, `ChoiceGroup param=`, `ToggleGroup param=` | `ButtonLink` is a link (`to` for a route, `href` for a download) drawn as a `Button` with its variants; it sets `data-variant`, so `variant="default"` is the view's one filled button for `expectOneFilledButton()`. `TextLink` is the house in-app link. Both are React Aria links with React Router navigation. A filter or choice a person would link to is `useSearchParam("mode", { default, parse })` (the default is never written, an invalid value reads as the default, other params are kept, history is replaced), or `param=` on the three controls, as `Tabs` does |
| Speech | `speak`, `useSpeech`, `SayAgain`, `ClipsProvider`, `useClips`, `useSayOnShow`, `canSay`, `textOf`, `installFakeSpeech` (`strata-react/testing`) | The browser's `speechSynthesis` with the voice picked by language once voices have loaded, what is being said cancelled by the next prompt, a slightly slow default rate, and nothing where there is no speech or the person muted it. Recorded prompts (`speak(parts)`, `SayAgain parts=`): each part's clip plays in order, and the browser's voice says the words when a part has no clip or one fails (one voice per prompt). `SayAgain`'s name is the sentence it says. `installFakeSpeech()` records what was said and which clips played in a test (`clips()`, `finish()`, `failClip()`) . `ClipsProvider load=` reads the app's clip list once (a record of line text to URL, read again only when `clipsQueryKey` is invalidated); `useClips()` gives `ready`, `parts(text)`, `say(text)` and `words(text)` (`split` cuts a prompt into lines, `describe` words a line that has no clip), `useSayOnShow(text)` says a prompt once the list has arrived or failed, and `SayAgain` inside the provider needs no `parts` or `lang`; outside it, the browser's voice alone |
| Recording | `useRecorder`, `useAutoRecorder`, `InputLevel`, `ListeningLevel`, `TakeLevel`, `MicrophoneContext`, `encodeWav`, `createSegmenter`, `fakeMicrophone`, `speechScript` (`strata-react/testing`) | One take of speech from the microphone as a lossless 16-bit PCM WAV (an AudioWorklet, not MediaRecorder, which only writes compressed audio), with the browser's echo cancellation, noise suppression and gain off. `start()` resolves with the take when it stops, by `stop()` or at `maxSeconds`. `InputLevel` is the live peak in dBFS with a "Too loud" notch at -3; `TakeLevel` judges the finished take for speech in words. The device comes from `MicrophoneContext`, so tests pass `renderWithStrata(ui, { microphone: fakeMicrophone() })`. The microphone needs a secure page (https or localhost); the refusals read as sentences. Hands-free: `useAutoRecorder({ maxSeconds, onTake, paused })` keeps the microphone open and hands over each stretch of speech as its own take (`AutoTake`, `cut` when it ran past `maxSeconds`), cut by `createSegmenter` (20 ms frames against the room's measured quiet: 12 dB to start, 1 s of quiet to end, 0.3 s kept either side, under 0.3 s of speech dropped); `ListeningLevel` says whether it is waiting, hearing a take or paused, with the room's level. `fakeMicrophone({ script: speechScript(n), loop })` reads with gaps |
| Toolbar and toggles | `Toolbar`, `ToolbarSeparator`, `Toggle`, `ToggleGroup`, `Switch` | A toolbar is one tab stop with arrows, Home and End inside; needs a `label`. `Toggle` (`aria-pressed`) and `ToggleGroup` (one of 2 to 7, always one chosen) show chosen as an ink border on a tint, never the filled primary, so they do not break the one-filled-button rule; an icon-only toggle still needs its `label` (shown as a tooltip). `Switch` is only for a setting that applies at once, label and control one target |
| Commands | `Command`, `useCommands`, `Menu`, `ContextMenu`, `CommandMenu`, `CommandLegend`, `formatChord`, `matchesChord` | A command is declared once (label or label function, chords, `disabled` with a reason, `destructive`, `checked`) and drives the key handler, dropdown and menu-bar menus, the context menu, the searchable command menu (Mod+K) and the legend, so they cannot disagree. Chords are written once ("Mod+Shift+Z") and shown per platform (⇧⌘Z, Ctrl+Shift+Z); they never fire while typing or during IME composition, and a chord the browser keeps (Ctrl+S) needs `claim: true`. `useHotkeys` is unchanged for single keys |
| Overlays | `Dialog`, `DialogProps`, `AlertDialog`, `Popover`, `Tooltip` | React Aria underneath. A dialog always has a title and, via `actions`'s close render prop, a way out; `closable={false}` while work cannot stop; `placement="end"` is a sheet. `AlertDialog` is the only confirm: required verb on the confirm button, Cancel focused first, no outside dismiss, stays open with the reason when an async confirm fails. `Popover` needs a `label`. `Tooltip` opens on hover and focus and `IconButton` uses it. All portal onto the `layer-*` stacking utilities |
| Value controls | `NumberField`, `Slider`, `ColorField`, `SecretField` | Set a number or colour precisely, inside `Field`. `NumberField` and `Slider` are React Aria's; the number field runs with `commitBehavior="validate"`, so a typed value outside `min`/`max` is kept on screen, explained in the `Field` ("Enter a value from 0% to 500%.") and never passed to `onChange`. A value that is not known is `null` and shows an en dash, never 0 or NaN. Digits and decimal mark follow `locale`. The unit sits inside the control, and in the slider's spoken value when `Intl` has it (%, °, ms, s, kB, MB, GB, kbps, Mbps). Arrows step, Home/End jump to the limits; `Slider editable` adds a number field. `ColorField`: platform picker, typed hex that is normalised, app suggestions, and a contrast note against `against`. No motion on value changes. `NumberField` options for a value set a little at a time or that costs work to change: `nudge={[0.1, 1, 10]}` (a toolbar of named step buttons that repeat when held and stop at the limits), `suggestion={{ value, label, reason }}` (a row with the reason in words and Use this value, never applied by itself) and `preview` (changes wait behind Apply and Revert; `onChange` is Apply's). `SecretField` is a credential the server keeps and never shows again: not set, set (no characters, no length, no input in the DOM), a masked entry with a Show toggle named for what it reveals, `onSave` through `AsyncButton`, Replace, a confirmed Remove that says what stops working, and a Test whose result is text beside it; a set, untouched field reports nothing |
| Notices and progress | `Alert`, `toast`, `StrataToastRegion`, `useClientWork`, `JobStatus` | Three weights. A `toast` confirms finished work and goes by itself (5 s plus 40 ms a character, 8 s minimum with an action, paused under the pointer or focus, always dismissable); it has no danger tone, because an error a person must act on is an inline `Alert` with its recovery as `action` (`announce` makes it `role="alert"` only when it answers something the person just did). `StrataToastRegion` goes once at the app root. `useClientWork` runs browser work with progress, cancel (aborts its `signal`, ends `cancelled`, never `failed`) and a double-start guard; `JobStatus` shows it exactly as it shows a server job, with `onCancel`, `cancelled` and `onDismiss` |
| Media player | `MediaPlayer`, `useMediaElement`, `SPEECH_RATES`, `useMediaSpans`, `SpanActions`, `PlayerNotice`, `SpanStrip`, `MediaContents` | Play a file or a sequence of chapters without the event glue: `marks` puts one file's own chapters (and `kind: "scene"` scenes, shorter) on the seek bar, each named in a tooltip and pressed to jump; the skip buttons beside Play step by scene (small) and chapter (large), or by 10 s and 1 min where a file has none (`skip`, `skipAction`); `fps` adds frame steps (`,` and `.`); `float` keeps a playing video in a corner box once the player has scrolled off the screen; and `MediaContents` lists them beside the player (the playing one marked, pressing one plays from its start, never scrolling the page); the element, its state, Strata's controls (or the browser's own on a touch device, `controls="auto"`), a load error with Try again, `navigator.mediaSession` metadata, the seek bar spanning the whole sequence. `useMediaElement(ref)` alone follows an element drawn with the browser's controls `spans` and `spanKinds` mark stretches (an intro, a recap, a sponsor read) on the seek bar as named ranges in a status role's tone and act on them as playback reaches them: `auto` skips (or mutes, for `action: "mute"`) with "Skipped intro" and Undo, `ask` offers a Skip button over the picture and on the `s` key, `off` only draws; each is acted on once, `onSpan` reports `skipped`, `muted`, `undone` or `played`, and `SeekBar` takes `spans` too. `mediaRef` hands out the player's state and requests (an object ref holds the latest, no render of its own), `overlay` draws the app's own thing over the picture only, `heading` (title, subtitle, avatar, each a link, with the app's router `state`) is drawn across the top of a video while paused or the pointer moves, and a video keeps a 16:9 (or `aspect`) box before its metadata loads. `gain` plays the sound at a factor through Web Audio (an app's loudness normalisation: 100% is the level the app chose; a change glides there) and `boost` lets the volume past 100% behind a Louder toggle (`VolumeControl boost`), both with a limiter at -1 dBFS; the element is routed only once its audio context runs, so a context the page may not start costs the gain, never the sound. A video has a Full screen button and the `f` key by default (`fullscreen={false}` removes them); on the picture a click plays or pauses, a double click toggles full screen and the wheel sets the volume while the player has focus. A kind's `colour` names a custom property of the app's theme (`"--seg-sponsor"`) instead of a tone, each range carries `data-kind`, and under the browser's own controls a `SpanStrip` under the picture draws the ranges. `start` begins a first load at a time (an attacher's `startAt`, or a seek once the metadata is in) and says "Picked up at 2:05" with Start over (`resumeWords`); `onProgress` reports the position and the seconds actually played through, each once, a skipped span counted (`useMediaElement` takes it too, with `markWatched`). The HLS attacher starts a `growing` source at its beginning, honours `config.startPosition` and takes `words` for its failures. |
| Edit lists | `EditListPlayer`, `useEditList`; `editTimes`, `locateInEdit`, `editTimeOf`, `continues`, `nextBreak` | An edit (clips that are stretches `[start, end)` of files) played as one timeline before it is rendered: two stacked `<video>` elements, the one behind already loaded and sought to the next clip that does not carry straight on, so a cut shows no gap; clips of one file that follow on play through; the cut is timed from the browser's frame callbacks (a refresh early by the frame loop where there are none); a seek bar marked at every clip, Previous and Next clip (P and N), frame steps with `fps` (`,` and `.`), a new edit (another revision) stays in the clip being watched, and the empty state is a required prop |
| Media playback | `useTimeline`, `TimelinePlayer`, `Transport`, `SeekBar`, `TimeReadout`, `VolumeControl`, `RateChoice`, `MediaStage`, `StageGuides`, `transportShortcuts`, `format.timecode` | The controls around anything that plays, wired to a player the app owns (HTML media, Web Audio, a canvas, a data replay). Every control is a named icon button in one toolbar; the play button's name is "Play" or "Pause". `SeekBar` has the formatted time as its accessible value, arrows step 5 s and Page keys 30 s by default, and optional marks. `VolumeControl` shows its percent, and muting remembers the level. `transportShortcuts` is the one list for `useHotkeys` and `KeysLegend` (Space and K, J and L, the arrows by a frame, Home and End). `format.timecode` prints m:ss, m:ss.mmm or m:ss:ff. `MediaStage` fits a picture of any aspect ratio into the pane with a letterbox on the sunken surface role, and takes overlays such as `StageGuides` `useTimeline` is the same state for a clock the app owns (a recorded run, a replay, an animation): rAF at `rate`, loops or stops, play at the end restarts, a seek pauses, `step` by `frame`, `startAt`, joins a `MediaGroup` and the key-owner rule, so `Transport`, `SeekBar` and `transportShortcuts` plug in; `TimelinePlayer` puts a stage (a `SceneViewport` given `time`) over the same control bar, with the stage keeping the arrow keys. |
| Listening and reading | `Waveform`, `TranscriptView`, `PlayWindowButton`, `MediaGroup`, `FilmStrip`; `resamplePeaks`, `peaksFromAudio`, `peakGain`, `phraseAt`, `wordAt`, `pickEvenly`, `frameAt` | Timed media: a waveform from peaks or a decoded file (one slider, marks by line style, named spans, zoom, a keyboard-made range, a spectrogram underlay, `normalise` to draw quiet sound to fill the height and say by how much); `FilmStrip` is a row of frames from a stretch of video that fits its width (picked evenly), each with its time, pressing one seeks (`onSeek`, one tab stop with arrow keys), and the frame at `time` inside `span` is ringed; timed text that marks the heard word and plays from any word (modes, speakers, follow and Jump to now, virtualised), with doubtful words (dotted, named, counted, "Only doubtful"), a mark per phrase set from a row menu (`states`, `onPhraseState`), correction in place (Enter or F2, `onEdit`) and a hover and focus card (`renderCard`); `MediaPlayer window` plays one stretch of a file, `MediaGroup` lets one player play at a time, `PlayWindowButton` is a row's play control on a shared element; a review transcript needs no player (`time` and `onSeek` are optional), takes `marking` (words become `MarkableText` marks with ids `wordId(phraseId, index)`, selected across rows that are not mounted) and shows a corrected word (`word.correction`) dotted with the original on hover and `onCorrectionPress` to open it |
| Streams | `MediaPlayer attach`/`growing`, `useAttachedSource`, `attachHls` (`strata-react/hls`) | A source the element cannot play is attached by an engine; a source still being made says so, shows what exists as ready, and waits at its end without ending |
| 360 | `PanoramaViewer` (`strata-react/panorama`), `project`, `unproject`, `describeView` | A 360 picture or video as a controlled window (yaw, pitch, field of view), drag, wheel, pinch and keys, an overlay in the picture's coordinates, said in words, a flat fallback with no WebGL2 |
| Conversation | `Conversation`, `Composer`, `RichText`; `matchEntities`, `parseRichText` | A question-and-answer thread: answers stream, finish or fail in place (Try again), one polite announcement per finished answer, following only while at the bottom (Jump to latest); answers can carry pictures (`images`, labelled, lazy, linked to full size) that stay visible beside the collapsed "looked up"; a composer that sends on Enter and is disabled with its reason while answering (Stop); a safe text subset (bold, code, lists, http links, never HTML) whose known ids, longest first and whole words only, become buttons |
| Pictures from a set | `Lightbox` (`useLightboxUrl`), `BookViewer` (`useBookUrl`), `TileGrid`, `BoxOverlay`/`BoxList`/`useBoxes`, `BoxedPicture`, `RegionEditor`; `regionStyle`, `moveRect`, `resizeRect`, `lerpRect`, `turnedSize`, `turnRect`, `readingOrder`, `zoomToBox`, `findPage` | A picture opened from a grid in a full-size `Dialog` (previous/next, arrow keys, "3 of 40" or a position like "Page 22 (12) of 44", zoom and 1:1, details beside it, an overlay and actions for the item, a thumbnail strip, `?view=` in the URL, neighbours preloaded, a `missing` sentence, Compare ticked hand-off); a scanned book read inline as spreads or single pages with printed and scan names, go-to, `?page=` and a strip with badges; a grid of picture tiles that link (`TileGrid`, with `TileGridSkeleton`); read-only boxes on a picture linked to a list beside it, and the picture opened zoomed to one of them (a face in its photo, `BoxedPicture`); one box of a picture shown on its own in a `Thumbnail` (`region`); `RegionEditor` also turns the picture by an angle (the windows turn with it) and edits a spread's gutter; named windows drawn and moved on a picture by pointer, keys and numbers, with aspect and bounds held, and a from/to move with a Watch preview |
| Sequences | `SequenceTimeline`; `snapToGrid`, `stepOnGrid`, `settleCut` | A gapless strip of windows whose cuts are sliders: dragged or stepped along a beat grid inside the room the app gives, the refusal said in words, both windows' new lengths announced; Shift+click chooses a run |
| Browsing | `Tree`, `FolderPicker` | A hierarchy that loads as it opens (`current` + `onCurrentChange` is the row in view beside the ticked ones, `count` and `badge` per row, `sortChildren`, `reveal` of a deep link (its ancestors are written into `useExpanded({ param })`'s URL), `branchPress="toggle"` so pressing a folder's name opens it and only files are chosen, `resolveBranch` so ticking a year says "2019 and its 91 folders" without opening them; a hook per open node; skeleton, Try again and empty rows; always virtualised); `choices` (from `useChoices`) chooses several: a checkbox per row, Shift ranges, a parent drawn mixed from what has loaded under it (ticking a branch never opened reads and opens it and chooses everything under it), "Select all shown", and rows the choice implies marked "Included because of …" in words and a server folder chooser on it: breadcrumb that is also editable text, Up, recents, New folder with the server's refusal on the field, Choose this folder; a `Folder` may carry a `badge` and `tone` ("project", as words), `canChoose` gives the reason the button is disabled beside it, `chooseLabel` names it, `onOpen` can answer `"choose"` to take a folder at once instead of entering it, and the listing may return a `footer` under the tree |
| Marking text | `MarkableText`, `Mark`, `MarkSummary`; `rangeBetween` | Select words by drag, Shift+click and Shift+arrows (ids in document order, so it holds across virtualised rows), apply the app's marks from a bar or single-key chords, marks drawn by role, pattern and text, summarised and announced |
| Maps | `strata-react/map`: `RouteMap`; `geo`, `LatLng` (main entry) | Routes and a position that moves along them, on Leaflet (no react-leaflet), behind its own entry. Tiles are the app's (`tiles.light`, `tiles.dark`, each with its attribution); the dark scheme uses the dark set or a filter over the light one. Route colours are roles resolved at draw time; `values` with `colourScale` colour a route by value in runs of one step, with a key that names the steps; a single route gets direction chevrons and start/finish marks (a loop is one mark). The position is one marker moved with `setLatLng`: no route is redrawn for it (keep `routes` stable). As picture content (a route inset over footage): `zoom` sets any zoom (animate it per frame), `follow="centre"` holds the view exactly on a position with no animation (a frame is deterministic), and `positions` draws several, each tied to a route, in its colour and named in the text alternative; routes are not redrawn for any of it. Leaflet's keyboard pan and zoom stay; the map is named by `label` and described by a generated text alternative (routes, lengths, position along). Overlay slots `topEnd` and `bottomStart` avoid Leaflet's own controls and attribution. Leaflet's stylesheet is injected once, so an app imports nothing. `geo` (distance, bearing, bounds, `pointAlong`, `arrows`, `ends`) and `format.distance` need no map library |
| Timeline | `Timeline`, `useTimelineZoom`, `TimelineZoomControls`, `noOverlap` | Items with a start and a length in lanes on a zoomable time axis, for media edits, bookings, rotas and plans. The timeline draws and the app decides: every move, trim, lane change, selection and current-time change is reported (`onItemChange`, `onSelect`, `onPositionChange`) and the app applies it; `validate` refuses a change with a reason shown in words while it is made. One tab stop for the items; arrows move between them, Ctrl+arrows nudge and change lane, Alt+arrows trim, the current time is its own slider, `+` `-` `0` zoom, and each change is announced ("run-02.mp4 moved to 0:13"). The ruler picks steps people write on a scale so labels never collide. Lanes take drops from outside (`dropTypes`, `onDrop` with the lane and snapped time, `validateDrop`, and React Aria's keyboard drag landing at the current time), `laneRows` makes them taller, `kindColours` fixes each kind's stripe, and the header column fits its content. Only items near the view are rendered |
| Answering by tap | `ChoiceGrid`, `ChoiceGridSkeleton`, `ChoiceState`; the `type-picture` step | One question, large picture tiles, one right answer, for someone who may not read yet (a child's learning game). Each tile is `open`, `wrong` (greyed, never red), `right` or `answer` (shown after the tries ran out), always with its word; a choice with no answer key ("Which one next?", a rating) uses `picked` (primary border, neutral word, `marks={{ picked }}`), which closes the grid so a slow request cannot be tapped twice; the app owns the answer key. Answered tiles cannot be pressed again and the grid closes once the answer shows. React Aria's `GridList`: arrows across and down, Enter answers. Tiles at least 120px (`md`) or 160px (`lg`); `stretch` shares the row out so a few tiles fill a wide screen; `beckon` pulses the open tiles one at a time in a random order until the grid closes |
| Answering by placing | `PlaceBoard`, `PlaceState` | An answer that is an arrangement (give a number, put in order, match pairs, sort), for someone who may not read yet. Two taps: pick a piece up (`aria-pressed`, "Picked up"), put it in a place ("Put apple in the basket"); tap it again to put it down, "Put … back" returns a placed one. Same presses by touch, mouse, keyboard and screen reader; places are disabled until a piece is held, so Tab walks the pieces, then the places; focus follows a moved piece. The app owns `placement`, applies `onMove` and checks; `placeState` marks a place `right` or `wrong` (neutral, never red) with its word, `locked` ends the round. Pieces 96px or more in the pile, 72px once placed; `beckon` pulses the pile's pieces one at a time while none is held; `stretch` shares the pile's and places' rows out; a picture never outgrows its tile |
| Seeing for a moment | `Glimpse`, `useCountdown` | Something shown briefly and then hidden ("How many did you see?"). A 3-2-1 (`count`) before every look, then the content for `ms` with a bar under it that empties as the time goes (`drain`), then hidden with its room kept, so nothing under it moves. Changing `again` shows it again, count and timer included (after a wrong answer); `peeks` offers that many looks again on a "Look again" button in the empty box, gone once used. `onLook` reports each look and why (`first`, `again`, `peek`). `useCountdown(running, seconds, onDone)` is the whole-second count on its own (an auto Next) |
| Sortable list | `SortableList` | Reorder a list and move items between lists, by pointer and by keyboard. React Aria's `GridList` with `useDragAndDrop` (no `@dnd-kit`): a grip per row is the drag handle, so clicking a row selects it and its own actions still work; Enter on the grip picks up, arrows and Tab choose a position or list, Enter drops, Escape cancels, with React Aria's screen-reader announcements. Items carry a kind (`getKind`); a list takes the kinds in `accepts` and says why it refuses another (`refuses`, shown with an icon while that kind is dragged over it). The list never changes the data: `onReorder` and `onInsert` report the move and the app applies it, undoably |
| Drag source | `DragSource` | A row that is dragged onto a drop target elsewhere (a `Timeline` lane), by pointer or from the keyboard. React Aria's `useDrag` with a drag button: a grip named "Drag <label>" picks it up with Enter, Tab moves between targets that take its types, Enter drops, Escape cancels, with React Aria's announcements; the pointer can pick up the whole row and the row's own buttons still work. `items` returns the drag's data (`DragData`, a type to a value), read by the target |
| File intake | `FileButton`, `FileDropZone`, `FileDropOverlay`, `FileOutcomes`, `MissingFile`, `useFileIntake` | Pick or drop local files, then one outcome per file. `FileButton` is React Aria's `FileTrigger` behind a real named button (the keyboard and phone route); `FileDropZone` is its `DropZone` and says what it takes while a drag is over it; `FileDropOverlay` (also `Workspace onFiles`) is the whole window as the target, with an overlay that names what it takes; it ignores the app's own drags (every `DragSource`'s, and any type named in `refuseTypes`), so a keyboard drag to a timeline lane does not stop on it. `useFileIntake({ accept, acceptLabel, process })` judges each file after the drop, so a wrong one is named with its reason (type, `maxBytes`, your `check`), runs your own `process` per file (a throw becomes `Failed` with its message and a retry), and never blocks the rest. `FileOutcomes` draws the rows and announces one summary per batch. `MissingFile` is a status word and a "Relink" that opens the picker for that item; the name wraps in a narrow pane and a `thumbnail` can lead it. Nothing assumes a server |
| Inspector | `Inspector`, `InspectorSection`, `PropertyRow`, `PropertyList` | Properties of the selected thing. `Inspector` is a labelled region with the selection's name as its heading and the empty state (`empty`, required) when `title` is `null`; `selectionKey` gives a new selection fresh controls and keeps focus in the panel. `InspectorSection` is React Aria's `Disclosure` with the body mounted only while open; open and closed are remembered under `storageKey` (storage that throws just means defaults). `PropertyRow` is a `Field` with a "Reset <label>" that shows only while `modified`. `PropertyList` is a `dl`: missing values print an en dash heard as "Not known", units follow a non-breaking space, long values truncate with the whole value in a tooltip |
| Feedback | `UndoBar`, `useUndoable`, `Done` | Undo before confirm; the hook owns which rows are out of view (`isRemoved`), a failed commit brings the row back with Try again in the same bar, and `flush()` commits before a dependent action; `Done` is the one celebration, and it must say what happens next |
| Helpers | `cn`, `format`, `createFormat`, `NBSP` | `cn` knows `type-*`; all numbers and dates through `Intl`; `format.integer(n)`, `.decimal(n)`, `.percent(n)` are callable and keep Intl's methods; `format.bytes(n, unit?)` writes sizes in decimal units, `{ binary: true }` (or a unit such as "GiB") in KiB, MiB, GiB (`byteUnit` shares one unit across figures); `format.duration(seconds)` ("16 min", "3.5 h", "2 days", or `{ style: "parts" }` for an uptime, "1d 1h 0m"), `format.measure(12.3, "GB")` and `format.agoTick(seconds)` ("−2 min", for a history chart's axis); `format.date(at)` ("8 Nov 2026") and `format.dateTime(at)` ("8 Nov 2026, 06:05"), like `clock`, `day` and `shortDay`, take a Date, ISO string or epoch ms; `format.ago(at, now?)` ("3 weeks ago"), `format.compact(n)` ("1.2k", and `count(n, one, many, { compact: true })`), `format.runningTime(seconds)` ("1:02:09") and `format.share(n)` ("<1%" for a part that rounds to 0); every number and date formatter prints the placeholder (`format.missing`, an en dash) for `null` or `undefined`; `createFormat(locale, { timeZone, missing })` fixes the zone and the placeholder; units and counts join with a non-breaking space |
| Bytes | `ByteView`, `ByteHighlight`, `ByteRange` | A hex dump for the file no other viewer understands: offsets, sixteen bytes a row and the printable characters, windowed so a 50 MB file scrolls, one tab stop with Left/Right by byte, Up/Down by row, PageUp/PageDown by screen, Home/End, Shift to extend; the range reported as `{ start, end }` (end exclusive) for a decoder beside it; `highlight` tints ranges by tone and names them in the status |
| Pictures from bytes | `PixelImage`, `pixelZoom`, `rgbaToBlob`, `useObjectUrl` | A decoded RGBA buffer (or `ImageData`) on a canvas at a whole-number zoom with square pixels and a checkerboard behind clear ones, named with its size; `useObjectUrl(bytes \| Blob, type)` is a URL for `MediaPlayer`, `Thumbnail` or a download, revoked when the value changes or the component unmounts |
| Console | `Console`, `ConsoleLine`, `ConsoleLevel` | A command line over a polite `log` that is virtualised from 100 lines and pinned to the end unless scrolled up: levels as words (`Warning`, `Error`), an echo of the command, history with Up and Down kept under `historyKey`, Tab completion from the app's `complete` |
| 3D scene | `strata-react/scene`: `SceneViewport`, `useOrbitCamera`, `frameFor`, `describeCamera`, camera maths | A frame for a scene the app draws in WebGL2: `render(gl, frame)` runs on change (frame has the view, projection and eye), orbit by drag, pan by right drag or Shift, zoom by Ctrl/Cmd+wheel or pinch (a plain wheel scrolls the page), arrows, `+` `-` `0`, a Reset button (animated unless motion is reduced), `mode="fly"` for a walkthrough, a lost context restored (`frame.context` counts them), the camera in words; its own entry, no dependency `time` redraws it from a `useTimeline` clock (`frame.time`), `TimelinePlayer` puts it over the player's bar. One view model with `PanoramaViewer`: both read pointers, wheel and the settled status through `useViewPointers`, `useWheelZoom` and `useSettledStatus`; `cameraFromView` and `viewFromCamera` turn a panorama view into the fly camera that looks the same way; `followCamera` (and `followAim`) follow a heading the app supplies with the person's own look on top, for "through the player's eyes". |
| Testing | `strata-react/testing`: `renderWithStrata`, `renderRoutes`, `createTestQueryClient`, `installLayoutShims`, `setupStrataTests`, `installFakeIntersectionObserver`, `filledButtons`, `expectOneFilledButton`, `asyncButtonPhase` | Router + query client around Testing Library's `render`; `renderRoutes(routes, { route, basename })` renders the app's own `RouteObject[]` in a memory data router, so layout routes, redirects, loaders and error elements run, and returns the `router` (where a redirect landed is `router.state.location`) and an act-wrapped `navigate`; a fixed box and ResizeObserver so measuring components render in jsdom (a no-op without a DOM, so a setup file shared with node-environment tests is safe); `setupStrataTests({ afterEach })` is the one setup call (the layout shims, and after each test unmounting, the toast queue and loaded thumbnails: Testing Library only cleans up by itself when Vitest's `globals` are on); an IntersectionObserver the test fires with `scrollToEnd()` or `intersect(el)`; `filledButtons()` and `expectOneFilledButton()` check "one filled button per view" from `data-variant`, and `asyncButtonPhase(el)` reads an `AsyncButton`'s phase. Role names keep the non-breaking space from `format.count`, so match them with the same call or a `\s` regex |
| API types | `strata-react/api-types` and the `strata-api-types` command | See "API types from the server" below |
| Visual regression | `strata-react/visual` and the `strata-visual` command | Screenshots an app's Storybook and its routes in each MSW state, light and dark, against baselines in the app's repo |

Specs for the components not built yet (menus, toasts, command menu, prose)
are in ux-research `ui-library/components.md`.

## API types from the server

An app's FastAPI server publishes its routes, the shared contracts (`strata_python.contracts`: `Health`, `Task`, `Page`, `ErrorBody`…) and its typed settings at `/api/openapi.json`. `strata-api-types` writes the TypeScript types from that schema, so they follow the Python ones instead of being written again by hand:

```sh
npm install --save-dev openapi-typescript        # once; see the TypeScript note below
npx strata-api-types http://localhost:8360/api/openapi.json -o src/api.generated.ts
npx strata-api-types openapi.json -o src/api.generated.ts --check   # CI: exits 1 when the file is stale
```

The schema is a URL (a running server) or a JSON file the server's CLI wrote, so CI needs no server. Commit the output and never edit it, as with `theme.generated.css`; it holds nothing of the machine (no URL, no date), so `--check` is exact. The file exports `paths`, `components` and `Schema<"Task">`. Then use the shared shapes with the hooks made for them: `useInfiniteLoad({ …, ...apiPage<Item>() })` pages by `Page<T>`'s own `next` cursor, `useJob({ isRunning: (t) => isTaskRunning(t, FINISHED) })` ends when a `Task`'s state is a finished one, and `errorPayload<T>(error)` reads an error body's `payload` (what is already running, on a 409).

`openapi-typescript` does the reading (types only, nothing in the app's bundle) and is an optional peer, so an app that never runs the command installs nothing. It declares `typescript@^5` as a peer; an app on another TypeScript points it at its own with an `overrides` entry, `"openapi-typescript": { "typescript": "$typescript" }`, as this repository does (the generator uses the TypeScript 6 API and is tested on it).

An app on **TypeScript 7** needs more than the override: TypeScript 7 ships no JavaScript API, so `$typescript` would hand openapi-typescript a package it cannot use, and an override that names the TypeScript 6 package directly fails `npm install` (openapi-typescript's peer must match the root `typescript`). Copy this repository's split: the name `typescript` is the TypeScript 6 package and TypeScript 7 has its own name, and `tsc` runs from that.

```json
{
  "devDependencies": {
    "typescript": "npm:@typescript/typescript6@~6.0.2",
    "typescript7": "npm:typescript@~7.0.2"
  },
  "scripts": { "typecheck": "node node_modules/typescript7/bin/tsc --noEmit" },
  "overrides": { "openapi-typescript": { "typescript": "$typescript" } }
}
```

When openapi-typescript cannot load, `strata-api-types` says why (and, if the `typescript` it finds is version 7 or later, this fix) instead of asking for an install that is already done.

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

A shot's theme reaches the app itself: the runner stores it under the key `ThemeProvider` reads (`strata-color-scheme`) before the page loads, so light shots are light even in an app whose default is dark. To show a state that needs files dropped, use `dropFiles(page, "text=Drop files", [{ name: "clip.mp4", type: "video/mp4", content: bytes }])` from `strata-react/visual` in a `setup`: it dispatches the drag events with a data transfer that holds real `File`s and file-system entries (which React Aria's drop zones need) and a fixed `lastModified`, so a date shown from the file does not change between runs.

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
`@font-face`) and name it first in the theme's `--font-*`. Strata's own default sans is Geist Variable, bundled with the package
(`strata.css` imports it; the app's build must resolve a CSS `url()` to a `.woff2`, which Vite does and the bare Tailwind CLI does not),
so an app that names none still loads a face. Anything that falls through to
`ui-sans-serif` (the mono default, a face you name that fails to load) is Cantarell on one Linux, DejaVu Sans on another and San Francisco on a
Mac, and a glyph missing from a web font (an arrow, `⌘`) falls back the same way; no threshold
absorbs that. The runner asks Chromium which face drew each element's text and fails the shot
naming the face and an example (`"DejaVu Sans" in <kbd> "⌘"`). `systemFonts: "warn"` reports
instead; `"allow"` skips the check; `systemFonts: { pin: "DejaVu Sans", files: ["tests/visual/fonts/DejaVuSans.ttf"] }` is for an app that chooses `system-ui` on purpose: on Linux the runner gives Chromium a fontconfig file whose only fonts are those files and which answers every system family with the pin, so the baselines match on every machine (elsewhere it warns and the machine's face is drawn; record baselines where CI does). **Lazy pictures.** A whole-page (route) shot of a page taller than the window is first shown to the page in a window as tall as itself, and waits up to 15 s for the pictures that start loading (a `Thumbnail` below the fold; a picture still missing then is reported on the shot, not passed over), then the window goes back to its size (the runner's Chromium also briefly resizes the window to 1×1 during a whole-page capture, so a component that measures its width re-renders then; `Thumbnail` and `FilmStrip` keep their pictures through it), so the baseline shows what a person sees after scrolling, not grey loading boxes; `scrollThrough: false` takes the page as it loads. Story tags pick the viewport: `visual-wide`, `visual-phone`, `no-visual` to skip.
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
