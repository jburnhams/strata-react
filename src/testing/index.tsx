import * as React from "react";
import { render, type RenderOptions } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { QueryClient } from "@tanstack/react-query";
import { StrataQueryProvider, createQueryClient } from "../query";

// Render a component the way a Strata app runs it: inside a router and a query client. Tests use
// MSW for the network (see CLAUDE.md), never module mocks, so the real fetch/query/DataView path
// runs. Each call gets a fresh QueryClient with retries off, so a test that serves a 500 sees the
// error at once instead of after the retry delay.

export function createTestQueryClient() {
  return createQueryClient({ defaultOptions: { queries: { retry: false, staleTime: Infinity, gcTime: Infinity } } });
}

export function renderWithStrata(
  ui: React.ReactElement,
  { route = "/", client = createTestQueryClient(), ...options }: RenderOptions & { route?: string; client?: QueryClient } = {},
) {
  const Wrapper = ({ children }: { children: React.ReactNode }) => (
    <StrataQueryProvider client={client}>
      <MemoryRouter initialEntries={[route]}>{children}</MemoryRouter>
    </StrataQueryProvider>
  );
  return { client, ...render(ui, { wrapper: Wrapper, ...options }) };
}
