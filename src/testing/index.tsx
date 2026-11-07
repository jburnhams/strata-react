/**
 * Test helpers: render a component inside a router and a query client, as a Strata app runs it.
 * Use with MSW for the network, never module mocks.
 *
 * @module strata-react/testing
 */
import * as React from "react";
import { render, type RenderOptions } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { QueryClient } from "@tanstack/react-query";
import { StrataQueryProvider, createQueryClient } from "../query";
import { ThemeProvider, type ColorSchemePreference } from "../components/theme";

// Render a component the way a Strata app runs it: inside a router and a query client. Tests use
// MSW for the network (see CLAUDE.md), never module mocks, so the real fetch/query/DataView path
// runs. Each call gets a fresh QueryClient with retries off, so a test that serves a 500 sees the
// error at once instead of after the retry delay. It also runs inside a ThemeProvider with
// storage off, so `useColorScheme` works and a test can render the dark scheme with
// `colorScheme: "dark"` without touching localStorage or leaking state into the next test.

export function createTestQueryClient() {
  return createQueryClient({ defaultOptions: { queries: { retry: false, staleTime: Infinity, gcTime: Infinity } } });
}

export function renderWithStrata(
  ui: React.ReactElement,
  {
    route = "/",
    client = createTestQueryClient(),
    colorScheme = "light",
    ...options
  }: RenderOptions & { route?: string; client?: QueryClient; colorScheme?: ColorSchemePreference } = {},
) {
  const Wrapper = ({ children }: { children: React.ReactNode }) => (
    <ThemeProvider defaultPreference={colorScheme} storageKey={null}>
      <StrataQueryProvider client={client}>
        <MemoryRouter initialEntries={[route]}>{children}</MemoryRouter>
      </StrataQueryProvider>
    </ThemeProvider>
  );
  return { client, ...render(ui, { wrapper: Wrapper, ...options }) };
}
