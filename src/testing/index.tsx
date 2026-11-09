/**
 * Test helpers: render a component, or a whole route tree, inside a router and a query client, as
 * a Strata app runs it,
 * and fill the gaps jsdom leaves (layout, ResizeObserver, IntersectionObserver). Use with MSW for
 * the network, never module mocks.
 *
 * @module strata-react/testing
 */
import * as React from "react";
import { act, render, type RenderOptions } from "@testing-library/react";
import { MemoryRouter, RouterProvider, createMemoryRouter, type RouteObject, type To } from "react-router";
import { QueryClient } from "@tanstack/react-query";
import { StrataQueryProvider, createQueryClient } from "../query";
import { ThemeProvider, type ColorSchemePreference } from "../components/theme";

export { installLayoutShims, type LayoutBox } from "./layout";
export { filledButtons, expectOneFilledButton, asyncButtonPhase } from "./buttons";
export {
  installFakeIntersectionObserver,
  type FakeIntersectionObserverControls,
  type FakeObserver,
} from "./intersection-observer";

// Render a component the way a Strata app runs it: inside a router and a query client. Tests use
// MSW for the network (see CLAUDE.md), never module mocks, so the real fetch/query/DataView path
// runs. Each call gets a fresh QueryClient with retries off, so a test that serves a 500 sees the
// error at once instead of after the retry delay. It also runs inside a ThemeProvider with
// storage off, so `useColorScheme` works and a test can render the dark scheme with
// `colorScheme: "dark"` without touching localStorage or leaking state into the next test.

/** A query client for tests: no retries, and nothing goes stale or is collected mid-test. */
export function createTestQueryClient() {
  return createQueryClient({ defaultOptions: { queries: { retry: false, staleTime: Infinity, gcTime: Infinity } } });
}

/** The options `renderWithStrata` and `renderRoutes` share, beside Testing Library's own. */
export type StrataRenderOptions = Omit<RenderOptions, "wrapper"> & {
  /** The URL the test starts at, with its search and hash (`/bookings?sort=pieces.desc`). Defaults to `/`. */
  route?: string;
  /** The query client; a fresh `createTestQueryClient()` when left out. */
  client?: QueryClient;
  /** The colour scheme to render; `light` when left out. */
  colorScheme?: ColorSchemePreference;
};

// The providers every Strata app has above its router, in the order an app nests them.
function StrataProviders({
  client,
  colorScheme,
  children,
}: {
  client: QueryClient;
  colorScheme: ColorSchemePreference;
  children: React.ReactNode;
}) {
  return (
    <ThemeProvider defaultPreference={colorScheme} storageKey={null}>
      <StrataQueryProvider client={client}>{children}</StrataQueryProvider>
    </ThemeProvider>
  );
}

/** Testing Library's `render` inside `StrataQueryProvider` and a `MemoryRouter` at `route`. */
export function renderWithStrata(
  ui: React.ReactElement,
  { route = "/", client = createTestQueryClient(), colorScheme = "light", ...options }: StrataRenderOptions = {},
) {
  const Wrapper = ({ children }: { children: React.ReactNode }) => (
    <StrataProviders client={client} colorScheme={colorScheme}>
      <MemoryRouter initialEntries={[route]}>{children}</MemoryRouter>
    </StrataProviders>
  );
  return { client, ...render(ui, { wrapper: Wrapper, ...options }) };
}

// Render an app's own route tree: its layout routes and <Outlet />s, index routes, redirects
// (<Navigate /> or a loader's redirect()), loaders, actions and error elements. Those only run in
// a data router, which <MemoryRouter> is not, so renderWithStrata cannot show them; this builds
// the memory twin of the app's createBrowserRouter from the same RouteObject[] the app exports,
// so the test and the app cannot drift. The providers and options are renderWithStrata's.
// `basename` is the app's own (the kiln app runs under /kiln), and `route` is the full URL,
// basename included, as the browser would show it. The router is returned so a test can assert
// where a redirect landed (`router.state.location`), and `navigate` moves it inside act().

/** `renderRoutes`'s options: `renderWithStrata`'s, plus the app's `basename`. */
export type RenderRoutesOptions = StrataRenderOptions & {
  /** The base path the app is served under, as passed to `createBrowserRouter`. */
  basename?: string;
};

/** Testing Library's `render` of an app's route tree in a memory data router at `route`, with Strata's providers. */
export function renderRoutes(
  routes: RouteObject[],
  {
    route,
    basename,
    client = createTestQueryClient(),
    colorScheme = "light",
    ...options
  }: RenderRoutesOptions = {},
) {
  const router = createMemoryRouter(routes, { initialEntries: [route ?? basename ?? "/"], basename });
  const result = render(
    <StrataProviders client={client} colorScheme={colorScheme}>
      <RouterProvider router={router} />
    </StrataProviders>,
    options,
  );
  const navigate = (to: To | number) =>
    act(async () => {
      await (typeof to === "number" ? router.navigate(to) : router.navigate(to));
    });
  return { client, router, navigate, ...result };
}
