import { describe, expect, it } from "vitest";
import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useLocation } from "react-router";
import { AppShell, Breadcrumb, Tabs } from "../../src";
import { renderWithStrata } from "../../src/testing";

const nav = [
  { to: "/", label: "Kiln room", end: true },
  { to: "/bookings", label: "Bookings" },
];

function Search() {
  return <output data-testid="search">{useLocation().search}</output>;
}

describe("AppShell", () => {
  it("marks the current route with aria-current", () => {
    renderWithStrata(
      <AppShell product="Back Lane Clay" nav={nav}>
        <p>Page</p>
      </AppShell>,
      { route: "/bookings" },
    );
    const navEl = screen.getByRole("navigation", { name: "Main" });
    expect(navEl).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Bookings" })).toHaveAttribute("aria-current", "page");
    expect(screen.getByRole("link", { name: "Kiln room" })).not.toHaveAttribute("aria-current");
    expect(screen.getByRole("main")).toHaveTextContent("Page");
  });
});

describe("Breadcrumb", () => {
  it("links every crumb but the last, which is the current page", () => {
    renderWithStrata(<Breadcrumb items={[{ label: "Kiln room", to: "/" }, { label: "Bookings" }]} />);
    expect(screen.getByRole("link", { name: "Kiln room" })).toBeInTheDocument();
    expect(screen.getByText("Bookings")).toHaveAttribute("aria-current", "page");
  });
});

describe("Tabs", () => {
  const items = [
    { value: "work", label: "Work inside" },
    { value: "readings", label: "Readings" },
    { value: "program", label: "Program" },
  ];
  const renderTabs = (route = "/") =>
    renderWithStrata(
      <>
        <Tabs param="view" items={items} label="Kiln 2">
          {(v) => <p>Panel {v}</p>}
        </Tabs>
        <Search />
      </>,
      { route },
    );

  it("reads the selected tab from the URL", () => {
    renderTabs("/kilns/2?view=readings");
    expect(screen.getByRole("tab", { name: "Readings" })).toHaveAttribute("aria-selected", "true");
    expect(screen.getByRole("tabpanel")).toHaveTextContent("Panel readings");
  });

  it("moves with the arrow keys, writes the URL, and leaves the default tab out of it", async () => {
    renderTabs();
    const first = screen.getByRole("tab", { name: "Work inside" });
    expect(first).toHaveAttribute("tabindex", "0");
    first.focus();
    await userEvent.keyboard("{ArrowRight}");
    expect(screen.getByRole("tab", { name: "Readings" })).toHaveFocus();
    expect(screen.getByTestId("search")).toHaveTextContent("?view=readings");
    await userEvent.keyboard("{End}");
    expect(screen.getByTestId("search")).toHaveTextContent("?view=program");
    await userEvent.keyboard("{ArrowRight}");
    expect(screen.getByRole("tab", { name: "Work inside" })).toHaveFocus();
    expect(screen.getByTestId("search")).toBeEmptyDOMElement();
  });
});
