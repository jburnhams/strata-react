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
| `strata-react/visual`, `strata-visual` | `playwright` (exact version), `msw`, `vite` | The screenshot runner; see [Visual regression for apps](#visual-regression-for-apps) |

The map, HLS, testing and visual entries need optional peers: an app that never imports those entries never needs them.

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

### Testing with Vitest, or with Jest

strata-react is ESM-only (`exports` has only `import`), as is its peer `react-router`. **Vitest is the supported runner**: it needs no configuration beyond the `strata-react/testing` helpers. An app on Jest has to do the work itself (strata-vid's `jest.base.config.js` is a working example): transform `.mjs` along with `.js`; leave `strata-react`, `react-router`, `@remix-run`, `cookie-es`, `@tanstack` and `pixelmatch` out of `transformIgnorePatterns` so Babel compiles them; and replace `import.meta` for CommonJS with a small Babel plugin (react-router reads it). Strata's own suite runs on Vitest only, so a Jest setup is the app's to keep working.

## Components

| Group | Exports | Notes |
|---|---|---|
| Actions | `Button`, `IconButton`, `RowAction`, `AsyncButton`, `useAsyncAction` | Default is `outline`; one filled button per view; `IconButton` requires `label`; `RowAction` is named for its row ("Withdraw Tom Ellery"); `AsyncButton` keeps one width through idle, pending, done and error, and announces `error` with its retry label; buttons carry `data-variant` and `AsyncButton` `data-phase` for tests; `useAsyncAction` returns `{ phase, run, error, thrown, fieldErrors, clearFieldError }` with a stable `run`, describes an `HttpError` in a sentence with the server's own reason for a 4xx (`describeActionError`, or the product's own `describeError`), and `validate` plus a server's 422 put messages on `fieldErrors` for each `Field` |
| Form | `Field`, `Input`, `Textarea`, `NativeSelect`, `ChoiceGroup`, `Checkbox` | `Field` wires label, hint, error, `aria-describedby`, `aria-invalid`, and `action` puts a one-field form's button on the control's row with the hint and error under both; `Checkbox` requires `label` and is one target with it, and has a mixed state |
| Status and figures | `Status`, `Metric`, `MetricStrip`, `Meter`, `crossedThreshold`, `CompositionBar` | A status is always a word; figures have no icons or sparklines; `Meter` is a `meter` named for what it measures, with its reading in words ("72% used"), threshold notches, and a `Status` word once a threshold is crossed (each threshold must name its state); `CompositionBar` is a stacked bar over a table naming every part, its amount and share, and names the remainder (`total` needs `restLabel`); a part that is there reads "<1%" and keeps a sliver, never "0%"; `JobStatus` is a long-running server job: a required word per state beside the app's sentence, a progress bar when the total is known, each failure named with its reason, announced only when the item changes or the job ends |
| Data | `DataView`, `Load<T>`, `Stale`, `StaleNotice`, `LoadError`, `EmptyState`, `Skeleton`, `Thumbnail`, `ThumbnailSkeleton`, `DataTable`, `TableSkeleton`, `VirtualList`, `InfiniteList`, `LoadMore`, `useInView`, `LineChart` | `DataView` requires skeleton and empty, keeps data on screen under a `StaleNotice` (why, how old, Try again) when a refresh fails, and takes an `error` renderer for an app's own look of a failed read (default `LoadError`, always inside an alert); `Thumbnail` is a remote image in a box of fixed `aspect`, with a skeleton while it loads, the required `missing` words (or a `fallback` drawing, such as an avatar's initial) when it fails or `src` is null, required `alt`, `children` overlaid in its corners, and a request only once it nears the screen (`eager` for the first few); tables, lists and tile grids virtualise from 100 rows, on React Aria's Virtualizer; a `DataTable` is a React Aria table (a `grid`) over TanStack Table's data model; a `DataTable` column with `value` sorts by type with missing values last both ways and draws a placeholder (`missing`, default an en dash); `InfiniteList` loads the next page on approach, with a skeleton for it, a Try again row when it fails and a Show more button for the keyboard, and `scroll="page"` draws a grid that scrolls with the page; `LoadMore` is that next-page row for any list or grid; charts label values directly; `LineChart` can also follow an app's position (`current`), read a value at the pointer or by arrow keys (`readout`, one slider whose value text is the reading), report a picked x (`onPick`) and fill one flat area (`area`); `xLabel` names the x column of its table |
| Compare | `Compare`, `PairVote`, `PairJudge`, `CompareAudio`, `CompareText`, `CompareGrid`, `CompareVideoGrid`, `ViewportFrame`, `useViewport`, `FullscreenFrame`, `useDifference`, `differences` | Two pictures judged together: side by side, swipe (a divider that moves from the keyboard), fade, blink (`x` flips) and difference (a live difference blend with amplify, or pixelmatch's changed pixels with a tolerance and the share that differ; pixels are read only when that view is open, at most 2048 px on the long side, and a picture the browser will not let the page read says so in words); `CompareGrid` is every candidate at once with the same zoom and full screen, and `actions` for what a tile offers; one zoom and pan for both sides (buttons, `+` `-` `0`, Ctrl-wheel or trackpad pinch, drag, arrow keys, double click, `1:1`), and full screen (the browser's Fullscreen API, a modal where there is none). `blind` is required: a blind comparison names pictures by `label` only and never writes the variant `id`, `note` or `alt`. A picture that fails shows the required `missing` words in its place; the keys come from one `Shortcut[]` shared with `KeysLegend`, and `keys={false}` leaves them to a surrounding screen. `PairVote` wraps `Compare` for a blind pairwise judgment: answer keys `a` `b` `t` `s` in Compare's one legend, a vote bar with no filled button, `pending`, a flag menu, a progress line, preload and Undo, and click to choose (a click on the picture you prefer, not a drag or double click; in swipe the side of the divider, in blink the side showing, none in fade or difference; `onPick` on `Compare` and `CompareVideo`, `pick={false}` turns it off). `CompareAudio` is one transport for two clips with an A/B switch that keeps the playhead (same time, or the same share when the lengths differ), a loop range and loudness matching (the louder clip turned down to the quieter, by RMS); `CompareText` is two texts scrolled together with a word diff and an optional reference; `PairJudge` is the answering around any of them; `CompareVideo` is two videos on one clock (play, pause, seek and speed drive both, the follower kept within a frame, both held while either waits for data) in side by side, swipe, fade and blink, with zoom and pan locked and nearest-neighbour pixels past 1:1, candidates of different sizes drawn in one box, one soundtrack (`audio`), and the same slots as the rest. `autoPlay` starts the pair once both can play (muted; not with reduced motion unless `"always"`) and `loopWhole` loops the whole clip when no range is set (also on `CompareVideoGrid`). Frame by frame (`,` `.`), a loop range the app can hold (`i` `o` `c`), speeds down to 0.1 and named `moments` are in it; `CompareVideoGrid` is every candidate's video at once on that one clock (one transport, one zoom, regions, a loop, stepping), light on the browser (metadata only until the first play, cells out of sight paused and left out of the sync, sound off unless `audio` names a cell, a cell that falls behind marked "Catching up"), with an optional `reference` drawn first, never blind and nearest-neighbour. `regions` (on `Compare`, `CompareVideo` and `CompareGrid`) names boxes in the source's coordinates to look at enlarged: chips, keys `q` `w` `e` `r` `y` `u`, nearest-neighbour drawing, the box outlined while its chip is pointed at, and Shift-drag to make another |
| Selection | `useSelection`, `BulkBar`, `SelectableGrid`, `DataTable`'s `selection` (`RowSelection<T>`) | Opt-in checkbox column with "Select all shown" that respects `isSelectable`; Shift-click or Shift+Space chooses or clears the run from the last row clicked, in the order shown; `initial` (keys or a test on the row) chooses a row the first time it appears, so it applies to data that loads later; the selection drops rows that are gone; `BulkBar` announces the count politely, and while it is up its one filled action is the view's only one (the screen's primary goes to `outline`); `SelectableGrid` is the same selection as a grid of pictures (`renderImage`), each tile one labelled target, virtualised from 100 tiles |
| Expansion | `Disclosure`, `useExpanded`, `DataTable`'s `expansion` (`RowExpansion<T>`) | Show more of one row in place. The toggle is a button with `aria-expanded`; the body is mounted only while open, so a request inside it runs on first open (unlike `<details>`, which mounts every closed body); `useExpanded({ param })` shares the open keys across a list or table and keeps them in the URL; a table's detail row spans the data columns and is measured when virtualised |
| Data loading | `StrataQueryProvider`, `createQueryClient`, `useLoad`, `useInfiniteLoad`, `useJob`, `toLoad`, `staleOf`, `fetchJson`, `HttpError`, `readErrorBody`, `fieldErrorsOf` | TanStack Query in, `Load<T>` out; a refetch that fails after a good read stays `ready` with `stale` set, never an error panel; `useInfiniteLoad` works out the cursor itself (after the last item held), merges pages by key and can `dismiss` an item at once; `useJob` polls a job's status only while it runs and invalidates the queries it changes once, when it ends; `fetchJson` reads an error response's body onto the `HttpError` (`body`, `reason`, `fieldErrors`, read by `readErrorBody` or the API's own `readError`) |
| Page and navigation | `AppShell`, `SideNav`, `Breadcrumb`, `Tabs`, `PageHeader`, `LinkCard`, `LinkCardList` | React Router; tab and sort state in the URL; a `LinkCard` is one link named by its title, described by its text and `Status` marks, with the whole card as the target (`to` a route, `href` elsewhere, marked with an arrow) |
| Keyboard | `useHotkeys`, `KeysLegend`, `Shortcut`, `useActiveItem`, `ActiveList`, `isTypingTarget` | For queues worked from the keyboard; one shortcut list drives the handler and the legend; keys never fire while typing; answering moves focus to the next item |
| Theme | `ThemeProvider`, `useColorScheme`, `useSystemColorScheme`, `ColorSchemeChoice`, `colorSchemeScript` | System, light or dark; sets `.dark`, persists in localStorage when it can; `ColorSchemeChoice` is a radio list for a settings page, or `compact` icon segments named "Appearance" for an app with no settings page |
| Density | `Density`, `DensityName`, `ThemeProvider`'s `density`, `ControlSize` (`size="sm"` on `Input`, `NativeSelect`, `NumberField`, `IconButton`) | Control height is two variables, `--control-h` and `--control-h-sm`. `<ThemeProvider density="compact">` or `<Density page value="compact">` sets them app-wide, including dialogs and menus, which portal out of the app's root; `<Density value="compact">` is one region (a toolbar, a dense panel) and does not reach its overlays. A coarse pointer (touch) always gets 44px targets, whatever the density |
| Workspace | `Workspace`, `Split`, `Pane`, `useWorkspaceState`, `WorkspaceState` | One screen of panes for a tool: splits of panes with a growing stage, a header on every pane (name, actions, fold button), separators that resize by pointer and by keyboard (arrows, Shift, Home, End, Enter to restore) within each pane's `min` and `max`, panes that fold to a rail or header bar with a visible way back (and `state.toggle(id)` from a menu), sizes and folds remembered with `useWorkspaceState("name")`, and stacking below 720px. Each pane is a labelled region |
| History and save state | `useHistory`, `useHistoryState`, `History`, `useAutoSave`, `SaveStatus`, `SaveState`, `useLeaveGuard` | Undo and redo for a document edited over a session: a step is a name and an `undo`/`redo` pair, `begin(label)` groups a drag into one step, a `key` merges a slider's pushes, a `limit` drops the oldest. `history.commands` are Undo and Redo as `Command`s ("Undo move clip", Mod+Z, Mod+Shift+Z or Mod+Y) for `useCommands` and `Menu`. `useAutoSave` debounces and never overlaps saves; `SaveStatus` is the fixed-width sign ("Saved 10:42", "Saving…", "Unsaved changes", "Not saved" with the reason and "Try again"), quiet except for a failure and its recovery. For one removal that commits after a few seconds, use `useUndoable` |
| Toolbar and toggles | `Toolbar`, `ToolbarSeparator`, `Toggle`, `ToggleGroup`, `Switch` | A toolbar is one tab stop with arrows, Home and End inside; needs a `label`. `Toggle` (`aria-pressed`) and `ToggleGroup` (one of 2 to 7, always one chosen) show chosen as an ink border on a tint, never the filled primary, so they do not break the one-filled-button rule; an icon-only toggle still needs its `label` (shown as a tooltip). `Switch` is only for a setting that applies at once, label and control one target |
| Commands | `Command`, `useCommands`, `Menu`, `ContextMenu`, `CommandMenu`, `CommandLegend`, `formatChord`, `matchesChord` | A command is declared once (label or label function, chords, `disabled` with a reason, `destructive`, `checked`) and drives the key handler, dropdown and menu-bar menus, the context menu, the searchable command menu (Mod+K) and the legend, so they cannot disagree. Chords are written once ("Mod+Shift+Z") and shown per platform (⇧⌘Z, Ctrl+Shift+Z); they never fire while typing or during IME composition, and a chord the browser keeps (Ctrl+S) needs `claim: true`. `useHotkeys` is unchanged for single keys |
| Overlays | `Dialog`, `DialogProps`, `AlertDialog`, `Popover`, `Tooltip` | React Aria underneath. A dialog always has a title and, via `actions`'s close render prop, a way out; `closable={false}` while work cannot stop; `placement="end"` is a sheet. `AlertDialog` is the only confirm: required verb on the confirm button, Cancel focused first, no outside dismiss, stays open with the reason when an async confirm fails. `Popover` needs a `label`. `Tooltip` opens on hover and focus and `IconButton` uses it. All portal onto the `layer-*` stacking utilities |
| Value controls | `NumberField`, `Slider`, `ColorField` | Set a number or colour precisely, inside `Field`. `NumberField` and `Slider` are React Aria's; the number field runs with `commitBehavior="validate"`, so a typed value outside `min`/`max` is kept on screen, explained in the `Field` ("Enter a value from 0% to 500%.") and never passed to `onChange`. A value that is not known is `null` and shows an en dash, never 0 or NaN. Digits and decimal mark follow `locale`. The unit sits inside the control, and in the slider's spoken value when `Intl` has it (%, °, ms, s, kB, MB, GB, kbps, Mbps). Arrows step, Home/End jump to the limits; `Slider editable` adds a number field. `ColorField`: platform picker, typed hex that is normalised, app suggestions, and a contrast note against `against`. No motion on value changes |
| Notices and progress | `Alert`, `toast`, `StrataToastRegion`, `useClientWork`, `JobStatus` | Three weights. A `toast` confirms finished work and goes by itself (5 s plus 40 ms a character, 8 s minimum with an action, paused under the pointer or focus, always dismissable); it has no danger tone, because an error a person must act on is an inline `Alert` with its recovery as `action` (`announce` makes it `role="alert"` only when it answers something the person just did). `StrataToastRegion` goes once at the app root. `useClientWork` runs browser work with progress, cancel (aborts its `signal`, ends `cancelled`, never `failed`) and a double-start guard; `JobStatus` shows it exactly as it shows a server job, with `onCancel`, `cancelled` and `onDismiss` |
| Media player | `MediaPlayer`, `useMediaElement`, `SPEECH_RATES`, `useMediaSpans`, `SpanActions` | Play a file or a sequence of chapters without the event glue: the element, its state, Strata's controls (or the browser's own on a touch device, `controls="auto"`), a load error with Try again, `navigator.mediaSession` metadata, the seek bar spanning the whole sequence. `useMediaElement(ref)` alone follows an element drawn with the browser's controls `spans` and `spanKinds` mark stretches (an intro, a recap, a sponsor read) on the seek bar as named ranges in a status role's tone and act on them as playback reaches them: `auto` skips (or mutes, for `action: "mute"`) with "Skipped intro" and Undo, `ask` offers a Skip button over the picture and on the `s` key, `off` only draws; each is acted on once, `onSpan` reports `skipped`, `muted`, `undone` or `played`, and `SeekBar` takes `spans` too. `mediaRef` hands out the player's state and requests (an object ref holds the latest, no render of its own), `overlay` draws the app's own thing over the picture only, and a video keeps a 16:9 (or `aspect`) box before its metadata loads. The HLS attacher starts a `growing` source at its beginning, honours `config.startPosition` and takes `words` for its failures. |
| Media playback | `Transport`, `SeekBar`, `TimeReadout`, `VolumeControl`, `RateChoice`, `MediaStage`, `StageGuides`, `transportShortcuts`, `format.timecode` | The controls around anything that plays, wired to a player the app owns (HTML media, Web Audio, a canvas, a data replay). Every control is a named icon button in one toolbar; the play button's name is "Play" or "Pause". `SeekBar` has the formatted time as its accessible value, arrows step 5 s and Page keys 30 s by default, and optional marks. `VolumeControl` shows its percent, and muting remembers the level. `transportShortcuts` is the one list for `useHotkeys` and `KeysLegend` (Space and K, J and L, the arrows by a frame, Home and End). `format.timecode` prints m:ss, m:ss.mmm or m:ss:ff. `MediaStage` fits a picture of any aspect ratio into the pane with a letterbox on the sunken surface role, and takes overlays such as `StageGuides` |
| Listening and reading | `Waveform`, `TranscriptView`, `PlayWindowButton`, `MediaGroup`; `resamplePeaks`, `peaksFromAudio`, `phraseAt`, `wordAt` | Timed media: a waveform from peaks or a decoded file (one slider, marks by line style, named spans, zoom, a keyboard-made range, a spectrogram underlay); timed text that marks the heard word and plays from any word (modes, speakers, follow and Jump to now, virtualised); `MediaPlayer window` plays one stretch of a file, `MediaGroup` lets one player play at a time, `PlayWindowButton` is a row's play control on a shared element |
| Streams | `MediaPlayer attach`/`growing`, `useAttachedSource`, `attachHls` (`strata-react/hls`) | A source the element cannot play is attached by an engine; a source still being made says so, shows what exists as ready, and waits at its end without ending |
| 360 | `PanoramaViewer` (`strata-react/panorama`), `project`, `unproject`, `describeView` | A 360 picture or video as a controlled window (yaw, pitch, field of view), drag, wheel, pinch and keys, an overlay in the picture's coordinates, said in words, a flat fallback with no WebGL2 |
| Conversation | `Conversation`, `Composer`, `RichText`; `matchEntities`, `parseRichText` | A question-and-answer thread: answers stream, finish or fail in place (Try again), one polite announcement per finished answer, following only while at the bottom (Jump to latest); a composer that sends on Enter and is disabled with its reason while answering (Stop); a safe text subset (bold, code, lists, http links, never HTML) whose known ids, longest first and whole words only, become buttons |
| Pictures from a set | `Lightbox`, `RegionEditor`; `moveRect`, `resizeRect`, `lerpRect` | A picture opened from a grid in a full-size `Dialog` (previous/next, arrow keys, "3 of 40", zoom and 1:1, details beside it, neighbours preloaded, a `missing` sentence, Compare ticked hand-off); named windows drawn and moved on a picture by pointer, keys and numbers, with aspect and bounds held, and a from/to move with a Watch preview |
| Sequences | `SequenceTimeline`; `snapToGrid`, `stepOnGrid`, `settleCut` | A gapless strip of windows whose cuts are sliders: dragged or stepped along a beat grid inside the room the app gives, the refusal said in words, both windows' new lengths announced; Shift+click chooses a run |
| Browsing | `Tree`, `FolderPicker` | A hierarchy that loads as it opens (a hook per open node; skeleton, Try again and empty rows; always virtualised) and a server folder chooser on it: breadcrumb that is also editable text, Up, recents, New folder with the server's refusal on the field, Choose this folder |
| Marking text | `MarkableText`, `Mark`, `MarkSummary`; `rangeBetween` | Select words by drag, Shift+click and Shift+arrows (ids in document order, so it holds across virtualised rows), apply the app's marks from a bar or single-key chords, marks drawn by role, pattern and text, summarised and announced |
| Maps | `strata-react/map`: `RouteMap`; `geo`, `LatLng` (main entry) | Routes and a position that moves along them, on Leaflet (no react-leaflet), behind its own entry. Tiles are the app's (`tiles.light`, `tiles.dark`, each with its attribution); the dark scheme uses the dark set or a filter over the light one. Route colours are roles resolved at draw time; `values` with `colourScale` colour a route by value in runs of one step, with a key that names the steps; a single route gets direction chevrons and start/finish marks (a loop is one mark). The position is one marker moved with `setLatLng`: no route is redrawn for it (keep `routes` stable). As picture content (a route inset over footage): `zoom` sets any zoom (animate it per frame), `follow="centre"` holds the view exactly on a position with no animation (a frame is deterministic), and `positions` draws several, each tied to a route, in its colour and named in the text alternative; routes are not redrawn for any of it. Leaflet's keyboard pan and zoom stay; the map is named by `label` and described by a generated text alternative (routes, lengths, position along). Overlay slots `topEnd` and `bottomStart` avoid Leaflet's own controls and attribution. Leaflet's stylesheet is injected once, so an app imports nothing. `geo` (distance, bearing, bounds, `pointAlong`, `arrows`, `ends`) and `format.distance` need no map library |
| Timeline | `Timeline`, `useTimelineZoom`, `TimelineZoomControls`, `noOverlap` | Items with a start and a length in lanes on a zoomable time axis, for media edits, bookings, rotas and plans. The timeline draws and the app decides: every move, trim, lane change, selection and current-time change is reported (`onItemChange`, `onSelect`, `onPositionChange`) and the app applies it; `validate` refuses a change with a reason shown in words while it is made. One tab stop for the items; arrows move between them, Ctrl+arrows nudge and change lane, Alt+arrows trim, the current time is its own slider, `+` `-` `0` zoom, and each change is announced ("run-02.mp4 moved to 0:13"). The ruler picks steps people write on a scale so labels never collide. Lanes take drops from outside (`dropTypes`, `onDrop` with the lane and snapped time, `validateDrop`, and React Aria's keyboard drag landing at the current time), `laneRows` makes them taller, `kindColours` fixes each kind's stripe, and the header column fits its content. Only items near the view are rendered |
| Sortable list | `SortableList` | Reorder a list and move items between lists, by pointer and by keyboard. React Aria's `GridList` with `useDragAndDrop` (no `@dnd-kit`): a grip per row is the drag handle, so clicking a row selects it and its own actions still work; Enter on the grip picks up, arrows and Tab choose a position or list, Enter drops, Escape cancels, with React Aria's screen-reader announcements. Items carry a kind (`getKind`); a list takes the kinds in `accepts` and says why it refuses another (`refuses`, shown with an icon while that kind is dragged over it). The list never changes the data: `onReorder` and `onInsert` report the move and the app applies it, undoably |
| File intake | `FileButton`, `FileDropZone`, `FileOutcomes`, `MissingFile`, `useFileIntake` | Pick or drop local files, then one outcome per file. `FileButton` is React Aria's `FileTrigger` behind a real named button (the keyboard and phone route); `FileDropZone` is its `DropZone` and says what it takes while a drag is over it. `useFileIntake({ accept, acceptLabel, process })` judges each file after the drop, so a wrong one is named with its reason (type, `maxBytes`, your `check`), runs your own `process` per file (a throw becomes `Failed` with its message and a retry), and never blocks the rest. `FileOutcomes` draws the rows and announces one summary per batch. `MissingFile` is a status word and a "Relink" that opens the picker for that item; the name wraps in a narrow pane and a `thumbnail` can lead it. Nothing assumes a server |
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
