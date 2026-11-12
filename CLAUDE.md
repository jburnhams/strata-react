# Working in strata-react

strata-react is Jonathan's **opinionated React + Tailwind framework for building product
frontends**: components, UX patterns, styles and the tooling to check them, in one package.
It is the implementation of the component-library design in
[`jburnhams/ux-research`](https://github.com/jburnhams/ux-research) (`ui-library/`, there
called by the placeholder name Plinth), and every rule below comes from that research. When a
rule here and the research disagree, the research's reasons win; fix this file.

First use: the live demos and examples in ux-research. Then other products.

## The stance

- **Opinionated about structure, behaviour and stack; silent about the look.** Strata ships no
  colours and no theme. A product generates its own palette from its subject
  (`ux-design/skill/scripts/palette.mjs` in ux-research) and supplies status roles and faces.
  Shipping a look would make every product built on it the same product, which is how "AI
  slop" forms (ux-research `ux-slop-taxonomy.md` §1).
- **Tailwind's stock namespaces are removed** (`--color-*`, `--text-*`, `--radius-*`,
  `--shadow-*`, `--font-*`), so `bg-indigo-500`, `text-sm`, `rounded-xl` and `shadow-lg` do not
  compile in a Strata app. Only the roles the theme names exist.
- **States are in the types.** Loading, empty, error, pending and done are props a component
  cannot be written without (`DataView` needs `skeleton` and `empty`, `AsyncButton` needs a
  `done` label, `IconButton` needs `label`, `Status` needs its word).
- **Operate first.** Tuned for app screens (dashboards, tables, forms). No hero, feature grid,
  pricing or testimonial blocks.
- **Character by frequency** (ux-research `ux-character.md`): nothing on actions done 100+ times
  a day, `press` on buttons, ordinary 150–350ms on overlays, one `Done` moment at the end of a
  rare flow; most character lives in words and in how the data is drawn.

## The stack (fixed; do not swap pieces without changing this file and the changelog)

| Concern | Choice | How it is used |
|---|---|---|
| Runtime for tooling | Node 26 (LTS) | `.nvmrc`, `engines`, every workflow; TypeScript targets ES2024. Apps need it too (`engines` is published): it is the floor, and apps upgrade rather than Strata carrying an older Node |
| UI | React 19, TypeScript 7 strict | Function components; `React.useId` for ids. `npm run typecheck` runs TypeScript 7's `tsc` (devDependency `typescript7`); `typescript` is `@typescript/typescript6`, the TypeScript 6 API that TypeDoc, Storybook's docgen, MSW and the `.d.ts` build still need (TS 7 ships no JS API) |
| Build | Vite 8 | Library build in `vite.config.ts` (ESM only, all deps external); Storybook has its own `.storybook/vite.config.ts` |
| Styles | Tailwind v4 | `src/styles/strata.css` is Tailwind source an app compiles with its own theme; `type-*` utilities for type steps; `cn()` (clsx + tailwind-merge taught about `type-*`) |
| Variants | class-variance-authority | shadcn's variant names (`default`, `outline`, `ghost`…) so agents' knowledge transfers; `outline` is the default Button |
| Primitives | React Aria Components | Jonathan's choice (2026-11-12): behaviour and accessibility of every interactive control come from `react-aria-components` (press, focus, keyboard models, overlays, menus, number and colour fields, drag and drop), styled with our tokens through its `data-*` state attributes (`data-[selected]:`, `data-[focus-visible]:`). Not Radix; `@radix-ui/react-slot` and `asChild` are gone. Native elements stay where the platform does it better (`Input`, `Textarea`, `NativeSelect`); `DataTable` stays on TanStack Table and long lists on TanStack Virtual. When a component needs behaviour, look for the React Aria part first |
| Icons | lucide-react | Components accept any `IconComponent` |
| Server data | TanStack Query | Every remote read is `useLoad(...)` → `Load<T>` → `DataView`; a cursor-paged read is `useInfiniteLoad(...)` → `InfiniteLoad<T>` → `InfiniteList`, with the cursor after the last item held, never an offset; a long-running server job is `useJob(...)` → `JobStatus`. `createQueryClient` sets one retry, 30 s stale time, no refetch on focus. `fetchJson` throws `HttpError` with the response body and the server's reason |
| Tables | TanStack Table | Behind `DataTable`'s small column API (`key`, `header`, `cell`, `numeric`, `sort`) |
| Long lists | TanStack Virtual | `DataTable`, `VirtualList` and `InfiniteList` virtualise from 100 rows automatically |
| Routing | React Router | `AppShell`/`SideNav` use `NavLink`; tabs (`Tabs param=`), table sort (`sortParam`), filters and open panels live in the URL |
| Unit tests | Vitest + Testing Library + jsdom | `tests/unit/`; query by role and name, as a person would |
| Network in tests and stories | MSW | `stories/mocks/handlers.ts` serves both. **Never** `vi.mock` a module or stub `fetch`; put the server into the state with `server.use(...)` (tests) or `beforeEach: ({ msw }) => msw.use(...)` (stories) |
| Canvas | @napi-rs/canvas | Only for unit-testing code that draws to a `<canvas>` (jsdom has none). Charts here are SVG |
| Component docs | Storybook 10 (`@storybook/react-vite`) | `stories/`; every component in every state; addon-docs, addon-a11y, msw-storybook-addon |
| Visual regression | Playwright Chromium + pixelmatch (pngjs) | Shipped as `strata-react/visual` and the `strata-visual` command, so apps use the same runner. `strata-visual.config.ts` names two targets: every story light and dark, and the example app's routes in each MSW state; baselines in `tests/visual/baselines/` |
| API docs | TypeDoc | `typedoc.json`; every export has a TSDoc comment; `validation.notExported` keeps the reference whole |
| CI | GitHub Actions | `.github/workflows/ci.yml` (typecheck, unit + coverage, integration, visual); `pages.yml` publishes the site (`npm run site`) from main |

## Layout

```
src/
  index.ts              the public API (everything an app imports)
  components/           one file per component; each opens with the reasons it is shaped that way
  lib/                  cn, format (Intl), icon type
  query/                TanStack Query bridge: createQueryClient, StrataQueryProvider, useLoad, toLoad, fetchJson
  testing/              renderWithStrata (router + query client), renderRoutes (the app's route tree), installLayoutShims, installFakeIntersectionObserver; exported as strata-react/testing
  visual/               the visual regression runner, exported as strata-react/visual; cli.ts is the strata-visual command
  styles/strata.css     token contract, namespace reset, type steps, motion utilities, base layer
stories/                Storybook stories; fixtures/ (kiln-room sample data); mocks/handlers.ts (MSW); screens/ (whole screens)
.storybook/             config, plus the FIXTURE theme (kiln room) stories render on
tests/unit/             Vitest + Testing Library + MSW (jsdom)
tests/integration/      the built package: exports, bundle externals, strata.css compiled by Tailwind as an app would
tests/utils/            setup (jest-dom, MSW server, layout shims)
tests/visual/baselines/ committed PNGs, one per story per theme and per route state per viewport per theme
examples/kiln-app/      the kiln-room screen run as an app (router, base path, no stories): route mode's test bed; src/routes.tsx is its route tree, shared with its tests
bin/                    strata-visual, a thin wrapper over dist/visual-cli.js
scripts/                copy-css, clean, build-site
```

## Writing a component

1. **Tokens only.** No raw palette colours, arbitrary values (`p-[17px]`, `bg-[#…]`) or `dark:`
   colour overrides. Colours are roles (`bg-primary`, `text-muted-foreground`, `bg-danger-subtle`),
   radii are roles (`rounded-control`, `-surface`, `-overlay`, `-pill`), type is `type-caption`,
   `type-label`, `type-body-sm`, `type-body`, `type-heading`, `type-title`, `type-figure`,
   (`type-display` on Persuade pages only). Heights come from `--control-h`.
2. **Make the missing states impossible** in the props type, as above.
3. **Accessibility inside the component**: labels, `aria-describedby`, `aria-invalid`,
   `aria-sort`, live regions, focus moves. The base layer gives everything a focus outline.
4. **`className` is for layout at the call site**, merged with `cn()`. Never a styling escape hatch.
5. **Copy is specific** ("Book firing", "Booking…", "Booked", "Try again"), sentence case, the
   same verb through every state. No "Oops", "Something went wrong", "You're all set!".
6. **Numbers and dates through `format`** (`createFormat(locale)`); units joined with a
   non-breaking space; quantities right-aligned with `tabular-nums`. Dates by use: `clock`,
   `day`, `shortDay`, `date`, `dateTime` (a log or history row), each called with a Date or
   the API's ISO string. Ages are `format.ago`, media durations `format.runningTime`, big counts
   `format.compact`, a part of a whole `format.share` (never "0%" for a part that is there). A
   value that is not known is `null` and prints `format.missing` (an en dash); in a `DataTable`
   give the column `value` (sorted last both ways) and `missing` only where a word says more
   ("Never"). A missing style is added to `format`, never built in a screen.
7. **Motion**: `transition-state` (named properties, never `transition: all`), `press` on
   controls, `enter-moment` once for a rare moment. Reduced motion is handled in the base layer.
8. **Open the file with a comment saying why** it is shaped that way, citing the finding. Change
   the reason when you change the behaviour.
9. **Done means**: exported from `src/index.ts` with a one-line TSDoc comment (`/** ... */`, it is the API reference's summary); stories for every state; unit tests for its
   behaviour and accessibility; baselines updated; README component table and changelog updated.
10. **Imports decide the peers.** The main entry may import only `dependencies` and the required
   peers (React, React Router, TanStack Query); anything else (msw, Testing Library, Playwright,
   Vite) stays behind `strata-react/testing` or `strata-react/visual` as an optional peer. The
   peer-contract test in `tests/integration/package.test.ts` walks the built chunks and fails
   otherwise. Never add an app-side install step (such as an `@source` line) a component needs:
   `dist/strata.css` already scans the built components.

## Building an app on Strata

```css
/* app.css */
@import "tailwindcss";
@import "strata-react/strata.css";
@import "./theme.generated.css";  /* palette.mjs output, never hand-edited */
@import "./theme.css";            /* status roles, faces, subject colours, each with its reason */
```

1. Wrap the app in `ThemeProvider`, `StrataQueryProvider` and a React Router router; lay screens
   out in `AppShell`. Never write a matchMedia listener for dark mode: `ThemeProvider` owns the
   `.dark` class (Storybook's decorator and `renderWithStrata` use it too), `ColorSchemeChoice`
   goes on the settings page, and `colorSchemeScript()` is inlined in `<head>` to avoid a flash.
2. Every screen: write its one question and its finding in a comment at the top; `PageHeader`
   with the finding; blocks in the order a person asks the next questions.
3. Every remote read: `useLoad` → `DataView` with a skeleton that mirrors the layout and an
   `EmptyState` that teaches the next action. Errors say what happened in the product's words.
   A refresh that fails after a good read keeps the data and shows a `StaleNotice` (`Load`'s
   `stale`); a screen with readings says what is old in its words through `staleNotice`. An app
   with a second look changes only the failed panel, through `error` (DataView, InfiniteList),
   never by copying DataView. A server's reason for a 4xx reaches the person through `fetchJson`
   (`HttpError.reason`); per-field messages go under their `Field` through `useAsyncAction`'s
   `fieldErrors` (its `validate`, or the server's 422), never a hand-kept problem state. A
   one-field form ("Invite by email") puts its button in `Field action=`.
4. One filled (`variant="default"`) button per view at a time (while rows are chosen, see 5). Reversible removals use `useUndoable` +
   `UndoBar`; only irreversible ones get a confirm dialog. Filter rows with `isRemoved(id)`
   (never a second hidden set), give each removal a `failure` sentence, make `commit` the request
   plus a query invalidation, and `await flush()` before anything that depends on the removal.
5. A row action is a `RowAction` (named "Withdraw Tom Ellery", not "Withdraw" eight times) in a
   column whose header is hidden, not empty (`hideHeader`), shown only on rows where it applies.
   Checkboxes only where a bulk action exists: `useSelection` → `DataTable selection=` (with
   `rowLabel`, and `isSelectable` for rows that cannot be chosen) → `BulkBar` with the actions, one
   filled and named with its count. While the bar is up its action is the view's one filled
   button, so the screen's own primary steps down: `variant={selection.count ? "outline" :
   "default"}` (ux-research `patterns.md` §2). A bulk removal goes through `useUndoable` like a single one.
   Choosing among pictures is the same selection drawn as `SelectableGrid` (`renderImage`,
   `rowLabel`). Rows that start chosen are `useSelection`'s `initial` (keys, or a test on the
   row), never an effect that writes the selection once data arrives. Shift-click ranges come
   with both; never hand-write them.
6. Anything a person would link or reload into (tab, sort, filter, page, open item) is in the URL.
   A row that shows more of itself in place is a `Disclosure` (in a list) or `DataTable
   expansion=` (in a table), with `useExpanded({ param })` holding the open keys; the detail's
   `useLoad` lives in the detail's own component, so it runs when the row opens. Never a raw
   `<details>`: it mounts every closed body, and each one's request runs on load. A paged grid
   that scrolls with the page is `InfiniteList scroll="page" listClassName=…`; a list or grid the
   screen draws itself ends with `LoadMore` (items marked `data-index`), never a hand-written
   IntersectionObserver (`useInView` is exported for anything else that waits to be near the screen).
7. A screen that clears a queue (approve, reject, next) is worked from the keyboard:
   `useActiveItem` + `ActiveList`, one `Shortcut[]` list passed to both `useHotkeys` and
   `KeysLegend`, answers through `useUndoable`. Never bind single keys with a hand-written
   `keydown` listener.
8. A status dashboard: a level with limits is a `Meter` with named `thresholds` (one shared set
   for like things, as shares of `max`), what a whole is made of is a `CompositionBar`, a way
   to another app or area is a `LinkCard` in a `LinkCardList`, and sizes go through
   `format.bytes`. An app with no settings page puts `ColorSchemeChoice compact` in the header.
   A job the server runs for a while is `useJob({ isRunning, invalidates })` → `JobStatus` with
   its three words, its sentence and each failure named; never a hand-written `refetchInterval`
   plus an effect watching it end.
9. A rare, earned completion uses `Done` with a past-tense title and what happens next.
10. Test with `renderWithStrata` from `strata-react/testing` and MSW handlers; never module mocks.
   Render the dark scheme with `renderWithStrata(ui, { colorScheme: "dark" })`. Export the app's
   `RouteObject[]` from its own module (as `examples/kiln-app/src/routes.tsx` does), give the same
   array to `createBrowserRouter` and to `renderRoutes(routes, { route, basename })` in tests, and
   test shells, redirects and loaders that way, never with a hand-built `createMemoryRouter`.
   Call `installLayoutShims()` in the Vitest setup file so measuring components render, and
   `installFakeIntersectionObserver()` (with `uninstall()` after each test) to scroll a list to
   its end. Copy from `format` keeps its non-breaking space in role names: query
   `{ name: format.count(6, "piece") }` or `/6\spieces/`, not a typed `"6 pieces"`. Check the
   one-filled-button rule with `expectOneFilledButton()` (after an interaction too), and read an
   `AsyncButton`'s phase with `asyncButtonPhase(el)`, never with class names or its text.
11. Guard the screens visually with `strata-visual` (`strata-react/visual`): a
   `strata-visual.config.ts` lists each route and its states as MSW handlers (the same ones the
   unit tests use), plus the Storybook build if the app has one. Pin `playwright` to an exact
   version and commit `tests/visual/baselines/`. See the README for the config and the CI job.

## Commands

| Command | What it does |
|---|---|
| `npm run build` | `dist/`: ESM, `.d.ts`, `strata.css` |
| `npm test` | typecheck + unit tests |
| `npm run test:integration` | build, then test the built package and its CSS |
| `npm run storybook` | Storybook on :6006 |
| `npm run test:visual` | build the package, Storybook and the example app, then `strata-visual`: every story and every example route state, light and dark, against the baselines |
| `npm run test:visual:update` | the same, writing new baselines (removes obsolete ones) |
| `node bin/strata-visual.js --filter data-table` | only shots whose name contains the text (after the builds) |
| `npm run docs:api` | TypeDoc API reference into `site/api/` |
| `npm run site` | the Pages site in `site/`: Storybook at `/`, API at `/api/`, baselines gallery at `/visuals/` |

Visual tests run through `strata-visual`, the same command apps use, so a change to
`src/visual/` is tested on this repo's own 316 shots before an app sees it. A story tagged `visual-wide` renders at 1440×900, `visual-phone` at 390×844,
otherwise 1024 wide (the story's own tag beats its file's); `no-visual` skips (interactive
demos). Each PNG is **clipped to what the story paints** (text, controls, SVGs, and boxes
with a background, border or shadow, cut to their scroll containers, plus 8px for focus rings
and shadows), and grows past the viewport when the component is bigger, so a baseline shows
the component and nothing else. Route shots (the example app) are whole pages, named
`route--state--viewport--theme`, with every request answered by the MSW handlers in Node; a
request no handler answers fails the shot. Animations are frozen, fonts are bundled
(`@fontsource-variable`), and pages run in UTC and `en-US`, so screenshots are deterministic. Text
drawn in a system font fails the shot (`systemFonts`), so every face a story or the example app
uses is a bundled `@fontsource-variable` package imported in `.storybook/preview.tsx` and
`examples/kiln-app/src/main.tsx`. Both images are box-blurred 3×3 before pixelmatch (threshold
0.1, anti-aliasing ignored, 4 pixels allowed), which absorbs another machine's anti-aliasing and
still fails a changed letter (evidence in the CHANGELOG, 2026-11-07); a size change always fails.
Changed screenshots land in `tests/visual/output/` as `.actual`, `.expected` and `.diff` PNGs,
which CI uploads as the `visual-diffs` artifact. Baselines are written in the same Chromium CI
uses (Playwright is pinned to an exact version for that reason); `--update` records that
Chromium and platform in `tests/visual/baselines/.strata-visual.json`, and a later run that
differs says so beside its failures. **Look at a diff before you
update a baseline**, and say in the PR which baselines changed and why.

## Before finishing any change

1. `npm run build`, `npm test`, `npm run test:integration`, `npm run test:visual` all pass.
   Report the commands and results.
2. [`CHANGELOG.md`](./CHANGELOG.md) has an entry in the same commit or PR (format below).
3. If the change follows from or contradicts the research, say so in the ux-research changelog
   too.

## Changelog

Group entries by day under `## YYYY-MM-DD`, newest first. Each entry: a bold one-line title
naming the work and its branch (and PR number once known), one or two sentences on what was
asked and what changed the plan, then bullets naming each file or folder touched and what
changed. Say **new** for new files; call out corrections to earlier claims. Plain prose, no
marketing words. Do not rewrite older entries except to fix a factual error.
