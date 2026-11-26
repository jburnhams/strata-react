# Upgrading strata-react

What an app has to change when it updates, newest first. Only things that break, change
behaviour an app or its tests can see, or need an action. New components and props are not
listed; the [API reference](https://jburnhams.github.io/strata-react/api/) has them, and the
full development log, with reasons, is [`CHANGELOG.md`](./CHANGELOG.md).

Releases are cut on every merge to `main` (`v0.1.x`), so a day can span several versions.
Sections are by date; `v0.1.17` was published 2026-11-09 and the Release page gives each tag's
time. While the version is 0.x, any release may break.

Every PR that changes what an app sees adds a line here (see `CLAUDE.md`, "Changelog").

## 2026-11-26 (player skips and frame steps, #387)
- **`MediaPlayer` draws skip buttons either side of Play** (`Back 10 s`, `Forward 10 s`, `Back 1 min`, `Forward 1 min`, or `Previous scene`, `Next chapter`… when `marks` has them), and a sequence's `Previous chapter` now comes before Play. A test that listed the `Playback` toolbar's buttons, or found the only "Play" by position, needs the new names; `skip={false}` removes them. Visual baselines with a player move.
- `SeekBar` marks are buttons with a `Tooltip`, not a `title`: a test that read a mark's `title` reads its accessible name (unchanged, "Dinner, 10:00") or hovers for the tooltip.
- `MediaPlayer` no longer renders `Transport`; the toolbar is still named "Playback".

## 2026-11-25 (seek bar marks past the end)
- **`SeekBar` (and `MediaPlayer` through it) no longer draws a mark outside 0 to the duration.** A test that found a mark button past the loaded file's end will not find it; pass marks within the file.

## 2026-11-25 (CompositionBar, #377)
- `CompositionBar` no longer crashes a production build when a sixth part has no `colour`: it folds the smallest into "Other" and logs `console.error`. Development and tests still throw. Parts that come from data should pass `other={{ label }}` to fold on purpose; a test that expected the throw under `NODE_ENV=production` now sees the folded bar.

## 2026-11-25 (twelve issues, #359–#370)
- **`Pane`'s body is inset** (`p-3`, the header's own padding) so an `Inspector` or text lines up with the pane's name (#366). A pane that holds a tree, table, list or stage drawn to the edge adds `flush`; a pane whose content you inset yourself (`className="p-3"` on the child) can delete that. Visual baselines with a `Pane` move.
- `Expanded` (from `useExpanded`) has a new member, `toggle(key)` (#364): an `Expanded` you build by hand in a test or story must supply it. `Tree`'s new `branchPress="toggle"` makes pressing a folder's row open it instead of choosing it; the default (`"select"`) is unchanged.
- `installLayoutShims()` returns a no-op where there is no DOM (#363), so a setup file shared with `// @vitest-environment node` tests no longer throws. New `setupStrataTests({ afterEach })` in `strata-react/testing` is the one setup call (shims, then after each test: unmount, clear toasts, forget loaded thumbnails); an app whose Vitest `globals` are off and that had its own `afterEach(cleanup)` can replace it. `strata.bare.css` gains the `image-pixelated` utility.
- pnpm 12: add `minimumReleaseAgeExclude: [strata-react]` to `pnpm-workspace.yaml` to take each release the day it is cut (#362); README, Install.

## 2026-11-25 (thumbnails and polling)
- A `Thumbnail` for a picture the page has already loaded now asks for it at once when it mounts again, wherever it is, and shows it as soon as the image is there (a `FilmStrip` after a resize, a re-sorted list), instead of waiting near the screen as a skeleton (#352). `renderWithStrata` and `renderRoutes` reset this per test; a test using plain `render` that expects no request for a repeated `src` before it scrolls near sees one (call `forgetLoadedThumbnails`).

- `Poll` has a new member, `with({ every })` (#349): a read with its own pace takes `useLoad({ poll: poll.with({ every: 60_000 }) })` and keeps the page's pause, resume and "updated" time. A `Poll` you build by hand (in a test or story) must now supply `with`; one from `usePoll` already has it.
- `SystemPanel` takes `headingLevel` (2, 3 or 4; default 2, unchanged) so a page's own `h2` section can hold it (#348). `renderWithStrata` and `renderRoutes` take `base: "/_home/"` (#350): a `<base href>` for the render, removed on unmount, so `withBase`, `createApi` and `useSystemInfo` read the mount point they read in production; delete a hand-written `<base>` in your setup file.
- Visual baselines: `status-and-figures-pausebutton`, `-scheduletable`, `-systempanel` and `navigation-linkcard--same-site` were recorded before the default look and moved to it.

## 2026-11-25 (later)
- `useHotkeys` also hears a key pressed on a control inside a grid or table row (a tile's checkbox) in the capture phase, because React Aria's row hooks stop those keys reaching `window` (#328): shortcuts that were dead after a checkbox click now run. A test that clicked the tile instead of its checkbox to avoid this can click the checkbox.
- `LinkCard` with an `href` on the page's own origin (`/notes/`) no longer draws the leaving arrow; `external` says it either way (#340). A baseline with such a card moves: the arrow is gone.
- `format.byteUnit(n)` is typed `ByteUnit | BinaryByteUnit` (its value for the default decimal call is unchanged); `format.bytes`'s second argument also takes `{ binary, unit }`.
- `strata-visual` waits up to 15 s (was 3) for pictures in a whole-page shot and reports ones still not loaded as a problem on the shot (#331), where it used to pass silently; a page that holds an `<img>` request open on purpose fails its route shot until `scrollThrough: false`. `systemFonts` also takes `{ pin, files }` (#342).

## 2026-11-25
- New: palettes as themes. `ThemeProvider` now also sets `data-palette` on the root (default `petrol`, persisted under `strata-palette`; `defaultPalette`, `paletteStorageKey`), which `strata.css` keys four extra palettes on; `PaletteChoice` and `usePalette` are the picker and hook. Apps on `strata.bare.css` get none of the palette CSS and see only the attribute. `Choice` (in `ChoiceGroup`) takes an optional decorative `leading`.
- **`strata.css` now includes Strata's default look** (petrol and marigold palette, status roles, radii 6/10/14 px, a tinted overlay shadow, **Instrument Sans** and **JetBrains Mono**, bundled). **An app that has its own look must change its import to `strata-react/strata.bare.css`**, which is exactly what `strata.css` was until now (no colours, Geist as the only default); then nothing else changes (Tubes: that one line). An app that stays on `strata.css` and defines every role itself is unchanged for those roles but picks up the look for anything it does not set (radii, shadow, faces, title voice, `--accent`); override those in a later `:root`, `.dark` or `@theme` block. `strata.migrate.css` is the bare contract without the stock-class reset, as before. New opt-in `strata-react/reading.css` brings Source Serif 4 as `font-reading`. New dependencies of strata-react: `@fontsource-variable/instrument-sans`, `@fontsource-variable/jetbrains-mono` (apps install nothing; the app's bundler must resolve the `.woff2` urls, as for Geist).
- The default `--font-sans` is **Geist Variable**, bundled (Fontsource, a dependency of strata-react), where it was the system sans. An app that names its own face in `--font-sans` is unchanged; an app that never did gets a new look and moved baselines (re-record them: the face is now the same on every machine, so the screenshots no longer depend on its fonts). Mono is still a system face. `strata.css` now `@import`s `@fontsource-variable/geist`, so **the app's build must resolve a CSS `url()` to a `.woff2`**: Vite does this with nothing added (the files are emitted with hashed names under the app's base); a build that runs the Tailwind CLI and esbuild on its own must copy `node_modules/@fontsource-variable/geist/files/*.woff2` next to the compiled CSS (the rules say `./files/…`) or name its own face.

## 2026-11-24
- `RateChoice` (the speed in `MediaPlayer`, `VideoClock`, `CompareVideo`, `CompareVideoGrid`) is React Aria's `Select`, not a native select (#324): a test that did `user.selectOptions(getByRole("combobox", { name: "Playback speed" }), "1.5×")` now clicks `getByRole("button", { name: /Playback speed/ })` and then `findByRole("option", { name: "1.5×" })`. Visual baselines with a player move: the control is narrower, so a phone-width player's controls can fit on one row.
- `createApi`'s `post`/`put`/`patch` send a `Blob`, bytes, `FormData`, `URLSearchParams` or a stream as it is (a Blob with its own type as Content-Type); before, any body was `JSON.stringify`ed, so such a body arrived as `{}`. `createTypedApi` takes `body` (not `json`) on an operation whose request body has only a non-JSON media type, so a workaround that went round the typed client through `fetchJson` can be deleted.
- `SayAgain` inside a `ClipsProvider` takes the recordings of `text` and the provider's `lang` itself; one given `parts` or `lang` is unchanged, and outside a provider nothing changes.

## 2026-11-23
- Speech (#310): `installFakeSpeech()` now also replaces `window.Audio` until `uninstall()`, and each `Spoken` entry has `clip` (null for the browser's voice), so a test that compares a whole entry with `toEqual` adds `clip: null`. `useSpeech().say` takes a sentence or recorded parts; `stopSpeaking()` and unmounting `useSpeech` stop a playing clip too.
- `ChoiceGrid`'s `marks` type is `ChoiceMarks` (a quiz's three words, or `{ picked }` alone); `createTypedApi`'s POST/PUT/PATCH on an operation with `requestBody?: never` no longer ask for `json`, so a `json: undefined` workaround can be deleted. The request argument is now required when the operation has a required path or query value (a call that left it out compiled and threw at run time); pass `{ path: … }`.
- `installLayoutShims()` now also installs an in-memory `localStorage` and `sessionStorage` where the runtime's are unusable (Node 25+ under jsdom), emptied after each test. Apps that carried their own shim can delete it; one that tests "no storage" must replace it afterwards.
- `strata-api-types` reports why openapi-typescript failed to load instead of always asking for an install; a TypeScript 7 app needs the `typescript`/`typescript7` split in the README (new section text, no code change).
- `NativeSelect`, `ChoiceGroup` and `ToggleGroup` are now unions that also take `param` (URL-held choice); `ChoiceGroup` and `ToggleGroup` are function components with the same props, so nothing changes for existing callers. `fetchJson`'s init type is `FetchJsonInit` (`RequestInit` plus `json`).

- `FileDropZone` no longer takes a `DragSource` drag (or one of its new `refuseTypes`): a keyboard drag skips it and it does not offer "Drop to add". A test that Tabbed past the zone during a keyboard drag can drop that Tab.
- `strata-visual` gives a route's page, when taller than the window, a window as tall as itself before its shot, so lazy pictures (`Thumbnail`) below the fold are drawn in the baseline: re-record baselines that showed their grey loading boxes (`scrollThrough: false` in the config keeps the old behaviour). An app that passed `eager` to `Thumbnail` only for its screenshots can drop it.
- `MediaPlayer` with `controls="native"` (or `"auto"` on a touch device) and `spans` now draws a thin strip of the spans under the picture.

## 2026-11-19
- In fullscreen, `MediaPlayer` grows the video into the controls’ space while they are hidden.

## 2026-11-18
- `MediaPlayer` hides the custom controls after three idle seconds during full-screen playback. Moving the mouse or using the keyboard reveals them.

## 2026-11-15

- `MediaPlayer` (video, Strata's controls) now has a Full screen button after the volume and an `f` key (where the browser has the Fullscreen API); pass `fullscreen={false}` to remove them. The player is wrapped in `FullscreenFrame`, so a test that counts buttons or a baseline of a video player changes.
- `MediaPlayer` video: click plays or pauses, double click toggles full screen, and the wheel sets the volume while the player has focus. A test that clicks the video now changes playback.
- `useAsyncAction` no longer sets state or starts its settle timer after unmount; nothing to change.

## After v1.0.47 (2026-11-14)

- New, optional: the `strata-api-types` command (`strata-react/api-types`) generates API types from a server's OpenAPI schema. It needs `openapi-typescript` installed in the app (an optional peer) and, on a TypeScript other than 5, an `overrides` entry for its `typescript@^5` peer; see the README. Apps that do not run it change nothing.

## After v1.0.46 (2026-11-14)

- `MarkableText` now acts on arrow, Home, End and Escape keys only while its own region has focus; keys from something focusable inside it (a list of rows) are that thing's. Words drawn as `Mark`s with nothing focusable around them behave as before.

## After v1.0.44 (2026-11-14)

- `SelectableGrid` with `groupBy` is now one virtualised list: a group's heading is a row of the grid (not a `region` with its own list per group), so a test that looked for `getByRole("region", { name })` finds the heading row instead, and only the visible rows are in the DOM. Tiles `isSelectable` refuses are now focusable (not selectable) so the arrow keys land on them and their `unselectableReason` can be read; they were skipped before. The grouped baselines move.

## After v1.0.43 (2026-11-14)

- `toast.show(...)` with no `StrataToastRegion` mounted warns once in development ("nothing will be drawn") and still queues the toast; an app that called it before its region mounted will see the warning, and `renderWithStrata` keeps its region on by default so a test is unchanged.
- A pending `AsyncButton` (and any `Button` given `aria-busy`) now carries `aria-busy="true"` on the element; React Aria's button had been dropping it. A test that matched the button's attributes exactly may need the new one.
- `Toolbar` leaves Home and End to a slider inside it (they went to the first and last control before).
- `SelectableGrid`: a `tileSize` may be a number of pixels; with `groupBy` the grid is not virtualised and each group is its own list (an arrow key stops at a group's edge). A grid that sets none of the new props is unchanged.

## After v1.0.42 (2026-11-14)

- `strata-visual` serves an app build's `index.html` with `<base href="/">` (the target's `base`) added when the page has no base tag, as python-app-template's server does, so a build with `base: './'` finds its assets on a nested route; drop a `visual` Vite mode that injected the tag yourself (it is left alone if the page already has one).
- A shot now fails when a script or stylesheet request returns 4xx/5xx or HTML. A route that used to write an empty baseline because its assets never loaded fails now: fix the build or the server, then run `test:visual:update` and look at the diff.

## After v1.0.40 (2026-11-13 to 2026-11-14)

- Two `StrataToastRegion`s mounted at once no longer draw every toast twice: the first mounted draws and a second draws nothing (and warns in development, naming `renderRoutes(..., { toasts: false })`). A test that worked around the doubling with `findAllByText` can use `findByText`; an app with a region in a layout and another in a page loses the page's.
- Full screen on `Compare` and `CompareVideo` now fills what the controls leave (measured), whatever `maxHeight` was, where a caller's `maxHeight` used to cap it too, and where no `maxHeight` left the frame as tall as its width made it. New `maxHeight="fit"` and `reserve` measure the page; `"viewport"` is still the fixed guess.
- A picture that loads with no size (an SVG without one) no longer sets `Compare`'s aspect to NaN; the 3:2 box stays.
- `Button`, `IconButton` and `RowAction` refuse `title` (the type is `never`; React Aria's button never forwarded it, so a tip carried over from a native button silently vanished). Wrap the button in a `Tooltip`, or give `IconButton` a `label` and `hint`. In development a `title` that gets through (an untyped caller) and a button whose only content is one symbol with no `aria-label` log a warning once.
- Development warnings (a second toast region, command clashes, the media-player key clash, and the new `Button` ones) now read `process.env.NODE_ENV`, which your bundler replaces; before, the library build had turned them off. Expect to see them in development if you were doing any of those things.
- `FolderPicker`'s `useFolders` may return `{ folders, footer }` as well as an array; a row with a `badge` has `, badge` in its name (`name: "film-2026, project"`). `FolderPicker` and `Tree` gain props only; a picker that sets none of them is unchanged, except that a chosen folder's own listing is now read for its footer (cached, so no second request when the tree has it open).

## After v1.0.39 (2026-11-13)

- `Tree`'s props are now a union: give `selected` and `onSelect` (one chosen node) or `choices` from `useChoices` (several). Code that passed `selected` and `onSelect` compiles as before.
- `useSelection`'s `selected` includes keys implied by `implies` only when you pass `implies`; without it nothing changes. `NumberField`'s `onChange` may now return a promise (only `preview` mode awaits it). A transcript with `onEdit`, `renderCard` or `states` set draws a menu, an edit box and a card; one without them is unchanged, and the extra summary line and "Only doubtful" toggle appear only when a word is doubtful or a phrase has a `state`.

## After v0.1.17 (2026-11-11 to 2026-11-12)

- `RouteMap` now always has a tile under the last pixel column of the map (Leaflet could leave one bare, depending on the path the view took). A `RouteMap` baseline in a centred follow may gain one column of tile at the right edge.
- The type steps (`type-body`…) now read `--type-<step>-size`, `-leading` and `-weight` with today's values as the fallback, and `Button` reads `--control-px`, `--control-px-sm` and `--control-icon` (defaults 1rem, 0.75rem, 1rem, declared on `:root`): nothing to change unless an app already defines variables with those names. `Thumbnail`'s missing state with `alt=""` and no `missing` words is `aria-hidden` instead of an `img` named ""; a test that found it by role finds nothing. `Thumbnail`'s `src` type widened to a list; `onLoad`, `onMissing` are new.
- `MediaPlayer` with `kind="video"` draws the picture in a box (`aspect`, else the video's own shape, else 16:9 before its metadata loads) instead of letting the element size itself: a page that styled around the old height, and any video player baseline, will see the box. `VolumeControl`'s slider now shrinks (`min-w-24`) in a narrow row.
- `createHlsAttacher` and `attachHls`: a `growing` source now starts at its beginning (`startPosition` 0) where it started at the live edge, and `config.startPosition` is honoured on a first load; a test that expected `-1` for either sees `0` or the app's value. `StreamContext` has an optional `growing` for any other engine to read.
- `PairVote` and `Compare`/`CompareVideo` with `onPick` now choose on a click (after a 300 ms wait for a double click), so a screen that passes `onPick` or uses `PairVote` sees clicks answer; `pick={false}` keeps a click for panning only. `PairVoteSlot` gains an optional `onPick`: a custom `view` that spreads the whole slot onto `Compare` or `CompareVideo` gets it, and one that picks fields by hand adds it. `CompareVideo` and `CompareVideoGrid` now go back to 0, paused, when the pair's sources change (before, the position carried over). New props `autoPlay` and `loopWhole` are off by default.
- `MediaElementState` has new members (`window`, `playWindow`, `ready`, `waitingForMore`, `reportProblem`): code that builds one by hand (a stand-in for `Transport`, say) must add them. `useMediaElement` and `MediaPlayer` now keep the pitch whenever the rate changes (`preservesPitch`).
- `RouteMap` draws a "Reset view" button under the zoom control; a test that counts the map's buttons, and any `RouteMap` visual baseline, will see it.
- `MediaPlayer`: the `<audio>`/`<video>` element is now labelled "<label>, audio" (or "video") and the group keeps "<label>"; a test that queried the element by the bare label queries the group or the longer name. With several players on a page, Space, K, J, L and M go to the one last played, focused or pressed (a single player is unchanged); `shortcuts={false}` still opts out.
- `Switch` and `Checkbox` `detail` is now the control's accessible description, not part of its name: `getByRole("switch", { name: "Show 1 video" })` finds it, and a test that matched the name with a regex to include the detail should query the exact label (and `toHaveAccessibleDescription` for the detail).
- `renderWithStrata` and `renderRoutes` render a `StrataToastRegion` and clear the toast queue before each render. A test whose route tree already renders the region (a root layout route) passes `toasts: false`, or finds every toast twice.
- `LineChart` no longer marks its last point "<value> now" when `current` is set (the rule, dot and label at the end of the line are gone; `current` already says where now is). A chart that has `current` and wants the end marked passes `end="now"`; a chart without `current` that does not want it passes `end="none"`. Baselines of charts with `current` change.
- `SeekBar` with a `duration` of 0, `NaN` or `Infinity` (or `null`, now allowed) is drawn disabled; before it was enabled with the thumb at 0. Nothing to change unless a test seeks a bar with no duration.
- Arrows and macOS modifiers in `KeysLegend`, `CommandLegend`, menu shortcuts and tooltip hints are drawn as icons, each followed by a screen-reader name (`←` reads "left arrow", `⌘` "Command"), so the text no longer contains the symbol: a test that queries `"j or ↓"` queries `"j or down arrow"`, and `"⌘Z"` is `"Command Z"`. Their baselines change a little.
- The dim behind a `Dialog`, `AlertDialog`, `CommandMenu` and full-screen view is black at an alpha (the `scrim` utility), not `foreground`: in a dark theme it now dims the page instead of brightening it. Dark baselines of anything with an open overlay change.
- `strata-visual` stores each shot's theme under `strata-color-scheme` before the page loads, so a shot is in the theme it is named for even in an app whose `ThemeProvider` defaults to dark. An app that worked around it by clicking the theme in a `setup` can drop that; its baselines for the light shots change. New: `dropFiles` in `strata-react/visual`; a system-font failure now names the CSS `font-family` stack.
- `Timeline`'s lane header column is content-sized (at least `w-40`, at most `w-80`) instead of a fixed `w-40`; a screen with a long lane name or several header controls is now wider there. Lane height is `--lane-h` (one `--control-h` by default).
- `format.timecode` with `precision: "frames"` now returns four parts (`0:04:05:15`, was `4:05:15`); update tests that read it. `MissingFile`'s markup changed (the name wraps; status and Relink may sit on a second row).
React Aria Components is now the primitives layer (`react-aria-components`, installed with the
package). `@radix-ui/react-slot` is gone.

- **`Input` and `NativeSelect` take `size="default" | "sm"`**, not the native numeric `size` attribute (it is no longer passed through). Their height comes from `--control-h` / `--control-h-sm`, so a root `data-density` changes them, as it does `Button`. `NumberField`'s box lost its fixed height for the same reason; its visual baselines may move by a pixel.
- **A `ColorField` inside a `Field` has its picker named after the field** ("Route colour, picker"), not "Colour picker"; query it by that name. A `Dialog` or `AlertDialog` with `open` and no `trigger` no longer renders a `DialogTrigger`.
- **`DataTable` is a `grid`**, not a `table`: query `getByRole("grid", { name: caption })`, cells as `gridcell` and the first column's cells as `rowheader` (React Aria requires a row header; it is the first column). A sortable header is the `columnheader` itself, with no inner `button`: click it, and `aria-sort` is `"none"` until sorted. The `region` that wrapped a table is gone, and a toggle has no `aria-controls`. A click on a cell no longer touches the selection: only the checkbox or Space chooses a row. A part-chosen "Select all shown" still clears. Virtualised tables (100+ rows) size columns evenly rather than to their content. In a jsdom test of a virtualised table with `expansion`, or of a `SelectableGrid` of 100+ tiles, set `Element.prototype.scrollHeight` (the Virtualizer measures rows by it).
- **`SelectableGrid` is a `grid` of `row`s** (was a `list` of `listitem`s, a `region` once virtualised): query `getByRole("grid", { name: label })`; a press anywhere on a tile toggles it as before, and Shift-click, Shift+Space and "Select all shown" still extend and clear. Virtualised tiles keep a margin of one gap around the box.
- **`@tanstack/react-virtual` is no longer a dependency.** Strata does not need it; if an app imported it through Strata, add it itself.
- **`VirtualList` and `InfiniteList` (region mode) are a `grid` of `row`s**, not a `list` of `listitem`s in a `region`: query `getByRole("grid", { name })` and count items with `[data-index]` (the next-page row is a row too). Arrow keys move between rows. New `rowHeight` prop for fixed-height rows. `scroll="page"` is unchanged.
- **State classes are the `tailwindcss-react-aria-components` variants** (`selected:`, `focus-visible:`, `hover:`, `disabled:`), loaded by `strata.css` (the plugin is installed with the package). A test that matched a class such as `data-[selected]:border-foreground` now matches `selected:border-foreground`; hover colours no longer apply on touch screens.
- **`Compare`'s flip shortcut is labelled with the candidates' labels** ("Flip X and Y"), not always "Flip A and B". A test or visual baseline that reads the legend changes.
- **`Compare`'s default view switch has a fifth view, `difference`** (key `5`). An app that renders `Compare` without `modes` sees one more toggle (and its visual baselines move); pass `modes={["side", "swipe", "fade", "blink"]}` to keep the previous four.
- **`Button` has no `asChild`.** A button that navigates is a link: use a router `Link`.
  Do not rely on `@radix-ui/react-slot` arriving through Strata.
- **`IconButton` shows `label` as a tooltip**, not a `title` attribute. New optional `hint`
  for a shortcut. `Button` still takes `onClick` and `disabled`; `onPress` also works.
- **Tests that query roles:** `ChoiceGroup` and `ColorSchemeChoice` are `radiogroup`, not
  `group`. A mixed `Checkbox` is the DOM `indeterminate` state, no longer `aria-checked="mixed"`.
- **Checkbox, radio and selection tables are drawn from tokens**, not native controls. Expect
  visual baselines to change (selection tables 4px shorter, choice groups 8px taller).
- **Tooltips and other portalled overlays are now in `strata-visual` shots** (the clip walks
  the other children of `<body>`). Rewrite baselines that included a tooltip trigger.
- **Visual baselines:** lucide-react 1.72 redrew icons (moon, sort arrows, shell and status
  icons), and the reference Chromium moved to 158 (Playwright 1.65). Re-record, after looking.
- No app change: TypeScript 7 for the repo's own typecheck, TanStack Table 9 inside `DataTable`
  (its column API is unchanged), new `layer-bar`/`layer-overlay`/`layer-tip` utilities (use them
  instead of writing a z-index).

## v0.1.17 and the days before (2026-11-07 to 2026-11-09)

- **`useUndoable`** (2026-11-07): returns `{ pending, failed, isRemoved, schedule, undo, flush,
  retry, dismiss }`. `PendingRemoval` requires a `failure` sentence. `UndoBar` takes
  `undoable={...}` instead of `pending` and `onUndo`. Filter rows with `isRemoved(id)` and drop
  any hand-kept hidden set; `commit` may return a promise, and a rejection restores the item.
- **Errors read from the response** (2026-11-09): `HttpError` carries `body`, `reason` and
  `fieldErrors`; `describeActionError`/`describeHttpError` now say "The request was refused:
  <reason>." for a 4xx with a reason. Tests asserting the old error sentences need updating.
  `fetchJson` treats a 204 or empty body as success.
- **`useAsyncAction`** (2026-11-07, 2026-11-09): returns `thrown`, `fieldErrors`,
  `clearFieldError`; takes `onError` and `validate`. Failures no longer disappear silently.
- **Dark mode:** wrap the app in `ThemeProvider` and delete any `matchMedia` listener; it owns
  the `.dark` class. `colorSchemeScript()` goes in `<head>`.
- **`strata-react/visual` and `strata-visual`** (2026-11-07): replaces any local Playwright
  script. Every font a screen uses must be bundled (fontsource); text in a system font fails
  the shot. Playwright must be pinned to an exact version. Both images are blurred before
  comparing, so baselines recorded with plain pixelmatch settings may be re-recorded once.
- **One filled button per view** (2026-11-09): while a `BulkBar` is up, the screen's own
  primary becomes `variant="outline"`. `expectOneFilledButton()` checks it.
- **`format`** (2026-11-08, 2026-11-09): number formatters are callable
  (`format.integer(n)`; `.format(n)` still works). Missing values print `format.missing` and
  dates accept a `Date` or ISO string. `format.share` prints `<1%` and `>99%` where it used to
  print `0%` and `100%`; `CompositionBar` and `Meter` use it.
- **Install:** `dist/strata.css` scans the built components, so an app needs no `@source`
  line. Node 26 is the floor (`engines`).
