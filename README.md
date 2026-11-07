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

Not on npm yet. Install from GitHub (the `prepare` script builds it):

```bash
npm install github:jburnhams/strata-react react react-dom react-router @tanstack/react-query tailwindcss @tailwindcss/vite
```

## Set up an app

```css
/* src/app.css */
@import "tailwindcss";
@import "strata-react/strata.css";   /* token contract, namespace reset, type steps, base layer */
@import "./theme.generated.css";     /* your palette: ux-research ux-design/skill/scripts/palette.mjs */
@import "./theme.css";               /* your status roles, faces and subject colours, with reasons */
```

`theme.css` supplies what Strata names but does not choose: `--success`, `--success-subtle`,
`--warning…`, `--danger…`, `--info…` (pale tint + dark ink of one hue, ink at least 6:1),
`--font-sans` / `--font-display` in an `@theme` block, and optionally `--title-weight`,
`--title-stretch`, `--title-tracking`. See `.storybook/theme.css` for a complete example (the
kiln-room fixture).

```tsx
import { createBrowserRouter, RouterProvider } from "react-router";
import { StrataQueryProvider } from "strata-react";
import "./app.css";

const router = createBrowserRouter([{ path: "/", element: <KilnRoom /> }]);

createRoot(document.getElementById("root")!).render(
  <StrataQueryProvider>
    <RouterProvider router={router} />
  </StrataQueryProvider>,
);
```

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
| Actions | `Button`, `IconButton`, `AsyncButton`, `useAsyncAction` | Default is `outline`; one filled button per view; `IconButton` requires `label`; `AsyncButton` keeps one width through idle, pending, done and error, and announces `error` with its retry label; `useAsyncAction` returns `{ phase, run, error }` with a stable `run`, and describes an `HttpError` in a sentence (`describeActionError`, or the product's own `describeError`) |
| Form | `Field`, `Input`, `Textarea`, `NativeSelect`, `ChoiceGroup` | `Field` wires label, hint, error, `aria-describedby`, `aria-invalid` |
| Status and figures | `Status`, `Metric`, `MetricStrip` | A status is always a word; figures have no icons or sparklines |
| Data | `DataView`, `Load<T>`, `EmptyState`, `Skeleton`, `DataTable`, `TableSkeleton`, `VirtualList`, `LineChart` | `DataView` requires skeleton and empty; tables and lists virtualise from 100 rows; charts label values directly |
| Data loading | `StrataQueryProvider`, `createQueryClient`, `useLoad`, `toLoad`, `fetchJson`, `HttpError` | TanStack Query in, `Load<T>` out |
| Page and navigation | `AppShell`, `SideNav`, `Breadcrumb`, `Tabs`, `PageHeader` | React Router; tab and sort state in the URL |
| Feedback | `UndoBar`, `useUndoable`, `Done` | Undo before confirm; `Done` is the one celebration, and it must say what happens next |
| Helpers | `cn`, `format`, `createFormat` | `cn` knows `type-*`; all numbers and dates through `Intl` |
| Testing | `strata-react/testing`: `renderWithStrata`, `createTestQueryClient` | Router + query client around Testing Library's `render` |

Specs for the components not built yet (dialogs, sheets, menus, toasts, command menu, prose)
are in ux-research `ui-library/components.md`.

## Develop

```bash
npm install
npm run storybook           # http://localhost:6006
npm test                    # typecheck + unit tests
npm run test:integration    # build, then check the package and its CSS as an app sees them
npm run test:visual         # screenshot every story (light, dark) and compare with baselines
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
