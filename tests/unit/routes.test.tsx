import { describe, expect, it } from "vitest";
import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { Navigate, Outlet, redirect, useLoaderData, useRouteError, type RouteObject } from "react-router";
import { AppShell, PageHeader, fetchJson, useColorScheme } from "../../src";
import { renderRoutes } from "../../src/testing";
import { bookingsServerError } from "../../stories/mocks/handlers";
import { basename, routes as kilnRoutes } from "../../examples/kiln-app/src/routes";
import { server } from "../utils/server";

// renderRoutes renders an app's route tree the way the app's createBrowserRouter does, so the
// parts only a data router runs (layout routes, redirects, loaders, error elements) are tested
// too. Issue #35: the Bright Horizons port hand-built createMemoryRouter and the providers.

function Shell() {
  const { scheme } = useColorScheme();
  return (
    <AppShell
      product="Back Lane Clay"
      nav={[
        { to: "/", label: "Kiln room", end: true },
        { to: "/members", label: "Members" },
      ]}
      topBar={<span>Scheme: {scheme}</span>}
    >
      <Outlet />
    </AppShell>
  );
}

function Members() {
  const members = useLoaderData() as { name: string }[];
  return (
    <>
      <PageHeader title="Members" />
      <ul>
        {members.map((m) => (
          <li key={m.name}>{m.name}</li>
        ))}
      </ul>
    </>
  );
}

function LoadFailed() {
  const error = useRouteError() as Error;
  return <p role="alert">The members list did not load: {error.message}</p>;
}

const routes: RouteObject[] = [
  {
    path: "/",
    element: <Shell />,
    // What shows while the first URL's loaders run; without one React Router warns.
    hydrateFallbackElement: <p>Loading</p>,
    children: [
      { index: true, element: <PageHeader title="Kiln room" /> },
      {
        path: "members",
        loader: () => fetchJson<{ name: string }[]>("/api/members"),
        element: <Members />,
        errorElement: <LoadFailed />,
      },
      { path: "people", element: <Navigate to="/members" replace /> },
      { path: "account", loader: () => redirect("/members") },
    ],
  },
];


describe("renderRoutes", () => {
  it("renders the layout route around the index route", async () => {
    renderRoutes(routes);
    expect(await screen.findByRole("heading", { name: "Kiln room" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Kiln room" })).toHaveAttribute("aria-current", "page");
  });

  it("runs a loader against the MSW server", async () => {
    server.use(http.get("/api/members", () => HttpResponse.json([{ name: "Tom Ellery" }, { name: "Asha Patel" }])));
    renderRoutes(routes, { route: "/members" });
    expect(await screen.findByRole("heading", { name: "Members" })).toBeInTheDocument();
    const main = screen.getByRole("main");
    expect(within(main).getAllByRole("listitem").map((li) => li.textContent)).toEqual(["Tom Ellery", "Asha Patel"]);
  });

  it("shows the route's error element when the loader fails", async () => {
    server.use(http.get("/api/members", () => HttpResponse.json({}, { status: 503, statusText: "Service Unavailable" })));
    renderRoutes(routes, { route: "/members" });
    expect(await screen.findByRole("alert")).toHaveTextContent("The members list did not load");
  });

  it("follows a <Navigate> and a loader redirect, and says where it landed", async () => {
    server.use(http.get("/api/members", () => HttpResponse.json([])));
    const first = renderRoutes(routes, { route: "/people" });
    expect(await screen.findByRole("heading", { name: "Members" })).toBeInTheDocument();
    expect(first.router.state.location.pathname).toBe("/members");
    first.unmount();

    const second = renderRoutes(routes, { route: "/account" });
    expect(await screen.findByRole("heading", { name: "Members" })).toBeInTheDocument();
    expect(second.router.state.location.pathname).toBe("/members");
  });

  it("moves between routes by a link click or by navigate, and back", async () => {
    server.use(http.get("/api/members", () => HttpResponse.json([])));
    const { router, navigate } = renderRoutes(routes);
    await userEvent.click(await screen.findByRole("link", { name: "Members" }));
    expect(await screen.findByRole("heading", { name: "Members" })).toBeInTheDocument();
    await navigate(-1);
    expect(screen.getByRole("heading", { name: "Kiln room" })).toBeInTheDocument();
    await navigate("/members?tab=active");
    expect(router.state.location.search).toBe("?tab=active");
  });

  it("gives the tree the same theme and query client as renderWithStrata", async () => {
    const { client } = renderRoutes(routes, { colorScheme: "dark" });
    expect(await screen.findByText("Scheme: dark")).toBeInTheDocument();
    expect(document.documentElement).toHaveClass("dark");
    expect(client.getDefaultOptions().queries?.retry).toBe(false);
  });
});

describe("renderRoutes on the kiln app's own routes", () => {
  // The same RouteObject[] and basename main.tsx gives createBrowserRouter.
  it("starts at the basename and loads the bookings through MSW", async () => {
    const { router } = renderRoutes(kilnRoutes, { basename });
    expect(router.state.location.pathname).toBe("/kiln");
    const table = await screen.findByRole("table", { name: /Work in the kilns/ });
    expect(within(table).getAllByRole("row").length).toBeGreaterThan(1);
  });

  it("reads the sort from the URL under the basename", async () => {
    renderRoutes(kilnRoutes, { basename, route: "/kiln/?sort=pieces.desc" });
    const table = await screen.findByRole("table", { name: /Work in the kilns/ });
    expect(within(table).getByRole("columnheader", { name: /Pieces/ })).toHaveAttribute("aria-sort", "descending");
  });

  it("shows the app's error when the bookings fail", async () => {
    server.use(bookingsServerError);
    renderRoutes(kilnRoutes, { basename });
    expect(await screen.findByRole("alert")).toBeInTheDocument();
  });
});
