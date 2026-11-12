# Upgrading strata-react

What an app has to change when it updates, newest first. Only things that break, change
behaviour an app or its tests can see, or need an action. New components and props are not
listed; the [API reference](https://jburnhams.github.io/strata-react/api/) has them, and the
full development log, with reasons, is [`CHANGELOG.md`](./CHANGELOG.md).

Releases are cut on every merge to `main` (`v0.1.x`), so a day can span several versions.
Sections are by date; `v0.1.17` was published 2026-11-09 and the Release page gives each tag's
time. While the version is 0.x, any release may break.

Every PR that changes what an app sees adds a line here (see `CLAUDE.md`, "Changelog").

## After v0.1.17 (2026-11-11 to 2026-11-12)

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
