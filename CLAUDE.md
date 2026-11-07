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
| Runtime for tooling | Node 26 (LTS) | `.nvmrc`, `engines`, every workflow; TypeScript targets ES2024 |
| UI | React 19, TypeScript strict | Function components; `React.useId` for ids |
| Build | Vite 8 | Library build in `vite.config.ts` (ESM only, all deps external); Storybook has its own `.storybook/vite.config.ts` |
| Styles | Tailwind v4 | `src/styles/strata.css` is Tailwind source an app compiles with its own theme; `type-*` utilities for type steps; `cn()` (clsx + tailwind-merge taught about `type-*`) |
| Variants | class-variance-authority | shadcn's variant names (`default`, `outline`, `ghost`…) so agents' knowledge transfers; `outline` is the default Button |
| Icons | lucide-react | Components accept any `IconComponent` |
| Server data | TanStack Query | Every remote read is `useLoad(...)` → `Load<T>` → `DataView`. `createQueryClient` sets one retry, 30 s stale time, no refetch on focus. `fetchJson` throws `HttpError` |
| Tables | TanStack Table | Behind `DataTable`'s small column API (`key`, `header`, `cell`, `numeric`, `sort`) |
| Long lists | TanStack Virtual | `DataTable` and `VirtualList` virtualise from 100 rows automatically |
| Routing | React Router | `AppShell`/`SideNav` use `NavLink`; tabs (`Tabs param=`), table sort (`sortParam`), filters and open panels live in the URL |
| Unit tests | Vitest + Testing Library + jsdom | `tests/unit/`; query by role and name, as a person would |
| Network in tests and stories | MSW | `stories/mocks/handlers.ts` serves both. **Never** `vi.mock` a module or stub `fetch`; put the server into the state with `server.use(...)` (tests) or `beforeEach: ({ msw }) => msw.use(...)` (stories) |
| Canvas | @napi-rs/canvas | Only for unit-testing code that draws to a `<canvas>` (jsdom has none). Charts here are SVG |
| Component docs | Storybook 10 (`@storybook/react-vite`) | `stories/`; every component in every state; addon-docs, addon-a11y, msw-storybook-addon |
| Visual regression | Playwright Chromium + pixelmatch (pngjs) | `scripts/visual.mjs` screenshots every story light and dark, compares with `tests/visual/baselines/` |
| API docs | TypeDoc | `typedoc.json`; every export has a TSDoc comment; `validation.notExported` keeps the reference whole |
| CI | GitHub Actions | `.github/workflows/ci.yml` (typecheck, unit + coverage, integration, visual); `pages.yml` publishes the site (`npm run site`) from main |

## Layout

```
src/
  index.ts              the public API (everything an app imports)
  components/           one file per component; each opens with the reasons it is shaped that way
  lib/                  cn, format (Intl), icon type
  query/                TanStack Query bridge: createQueryClient, StrataQueryProvider, useLoad, toLoad, fetchJson
  testing/              renderWithStrata (router + query client), exported as strata-react/testing
  styles/strata.css     token contract, namespace reset, type steps, motion utilities, base layer
stories/                Storybook stories; fixtures/ (kiln-room sample data); mocks/handlers.ts (MSW); screens/ (whole screens)
.storybook/             config, plus the FIXTURE theme (kiln room) stories render on
tests/unit/             Vitest + Testing Library + MSW (jsdom)
tests/integration/      the built package: exports, bundle externals, strata.css compiled by Tailwind as an app would
tests/utils/            setup (jest-dom, MSW server, layout shims)
tests/visual/baselines/ committed PNGs, one per story per theme
scripts/                copy-css, clean, visual.mjs, visual-compare.mjs
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
   non-breaking space; quantities right-aligned with `tabular-nums`.
7. **Motion**: `transition-state` (named properties, never `transition: all`), `press` on
   controls, `enter-moment` once for a rare moment. Reduced motion is handled in the base layer.
8. **Open the file with a comment saying why** it is shaped that way, citing the finding. Change
   the reason when you change the behaviour.
9. **Done means**: exported from `src/index.ts` with a one-line TSDoc comment (`/** ... */`, it is the API reference's summary); stories for every state; unit tests for its
   behaviour and accessibility; baselines updated; README component table and changelog updated.

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
4. One filled (`variant="default"`) button per view. Reversible removals use `useUndoable` +
   `UndoBar`; only irreversible ones get a confirm dialog.
5. Anything a person would link or reload into (tab, sort, filter, page, open item) is in the URL.
6. A rare, earned completion uses `Done` with a past-tense title and what happens next.
7. Test with `renderWithStrata` from `strata-react/testing` and MSW handlers; never module mocks.
   Render the dark scheme with `renderWithStrata(ui, { colorScheme: "dark" })`.

## Commands

| Command | What it does |
|---|---|
| `npm run build` | `dist/`: ESM, `.d.ts`, `strata.css` |
| `npm test` | typecheck + unit tests |
| `npm run test:integration` | build, then test the built package and its CSS |
| `npm run storybook` | Storybook on :6006 |
| `npm run test:visual` | build Storybook, screenshot every story light and dark, compare with baselines |
| `npm run test:visual:update` | the same, writing new baselines (removes obsolete ones) |
| `node scripts/visual.mjs --filter data-table` | one group of stories (after `npm run build-storybook`) |
| `npm run docs:api` | TypeDoc API reference into `site/api/` |
| `npm run site` | the Pages site in `site/`: Storybook at `/`, API at `/api/`, baselines gallery at `/visuals/` |

Visual tests: a story tagged `visual-wide` renders at 1440×900, `visual-phone` at 390×844,
otherwise 1024 wide (the story's own tag beats its file's); `no-visual` skips (interactive
demos). Each PNG is **clipped to what the story paints** (text, controls, SVGs, and boxes
with a background, border or shadow, cut to their scroll containers, plus 8px for focus rings
and shadows), and grows past the viewport when the component is bigger, so a baseline shows
the component and nothing else. Animations are frozen and fonts
are bundled (`@fontsource-variable`), so screenshots are deterministic. pixelmatch runs at
threshold 0.1, ignores anti-aliasing, and allows 20 stray pixels; a size change always fails.
Changed screenshots land in `tests/visual/output/` as `.actual`, `.expected` and `.diff` PNGs,
which CI uploads as the `visual-diffs` artifact. Baselines are written in the same Chromium CI
uses (Playwright is pinned to an exact version for that reason). **Look at a diff before you
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
