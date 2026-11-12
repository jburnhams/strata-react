import * as React from "react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { StrataToastRegion, format, toast } from "../../src";
import { installFakeIntersectionObserver, installLayoutShims, renderRoutes, renderWithStrata, type FakeIntersectionObserverControls } from "../../src/testing";

// The helpers strata-react/testing gives an app's suite, tested the way an app would use them.

// A list that shows one more page each time its end sentinel comes into view: the shape of an
// infinite list, without depending on the component.
function Pages() {
  const [pages, setPages] = React.useState(1);
  const sentinel = React.useRef<HTMLDivElement>(null);
  React.useEffect(() => {
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) setPages((p) => p + 1);
      },
      { rootMargin: "0px 0px 400px 0px" },
    );
    if (sentinel.current) io.observe(sentinel.current);
    return () => io.disconnect();
  }, [pages]);
  return (
    <>
      <h2>{format.count(pages, "page")}</h2>
      <div ref={sentinel} data-testid="sentinel" />
    </>
  );
}

describe("installFakeIntersectionObserver", () => {
  let io: FakeIntersectionObserverControls;
  const original = globalThis.IntersectionObserver;
  beforeEach(() => {
    io = installFakeIntersectionObserver();
  });
  afterEach(() => io.uninstall());

  it("fires the sentinel when the test scrolls to the end", () => {
    render(<Pages />);
    expect(screen.getByRole("heading", { name: format.count(1, "page") })).toBeInTheDocument();
    expect(io.scrollToEnd()).toBe(1);
    expect(screen.getByRole("heading", { name: format.count(2, "page") })).toBeInTheDocument();
    io.scrollToEnd();
    expect(screen.getByRole("heading", { name: /3\spages/ })).toBeInTheDocument();
  });

  it("waits for the next scroll before firing a sentinel observed during this one, on any observer", () => {
    const later = document.createElement("div");
    const second = new IntersectionObserver(() => {});
    const first = new IntersectionObserver(() => second.observe(later));
    first.observe(document.createElement("div"));
    second.observe(document.createElement("div"));
    expect(io.scrollToEnd()).toBe(2);
    expect(io.scrollToEnd()).toBe(3);
  });

  it("keeps the options the component passed, and forgets disconnected targets", () => {
    render(<Pages />);
    io.scrollToEnd();
    expect(io.observers).toHaveLength(2);
    expect(io.observers[0].options.rootMargin).toBe("0px 0px 400px 0px");
    expect(io.observers[0].targets.size).toBe(0);
    expect(io.observers[1].targets.size).toBe(1);
  });

  it("intersects one element, in or out of view", () => {
    render(<Pages />);
    const sentinel = screen.getByTestId("sentinel");
    expect(io.intersect(sentinel, false)).toBe(1);
    expect(screen.getByRole("heading", { name: format.count(1, "page") })).toBeInTheDocument();
    expect(io.intersect(sentinel)).toBe(1);
    expect(screen.getByRole("heading", { name: format.count(2, "page") })).toBeInTheDocument();
    expect(io.intersect(document.body)).toBe(0);
  });

  it("puts the previous global back on uninstall", () => {
    expect(globalThis.IntersectionObserver).not.toBe(original);
    io.uninstall();
    expect(globalThis.IntersectionObserver).toBe(original);
  });
});

describe("format.count in queries", () => {
  // Documents the trap from issue #12: the non-breaking space survives into the accessible name.
  it("matches text loosely but a role name only with the same character", () => {
    render(<h2>{format.count(6, "piece")}</h2>);
    expect(screen.getByText("6 pieces")).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "6 pieces" })).toBeNull();
    expect(screen.getByRole("heading", { name: format.count(6, "piece") })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: /6\spieces/ })).toBeInTheDocument();
  });
});

describe("installLayoutShims", () => {
  it("gives every element the box asked for, and restores the one before", () => {
    const el = document.createElement("div");
    const restore = installLayoutShims({ width: 390, height: 844 });
    expect(el.getBoundingClientRect()).toMatchObject({ width: 390, height: 844, right: 390, bottom: 844 });
    expect(el.clientWidth).toBe(390);
    restore();
    expect(el.getBoundingClientRect().width).toBe(640);
    expect(el.clientWidth).toBe(640);
  });
});

describe("toasts in renderWithStrata and renderRoutes", () => {
  const Show = () => <button onClick={() => toast.show({ title: "Vote undone" })}>Undo</button>;

  it("has a region, so a toast shown by the app can be found", async () => {
    renderWithStrata(<Show />);
    await userEvent.click(screen.getByRole("button", { name: "Undo" }));
    expect(await screen.findByText("Vote undone")).toBeInTheDocument();
  });

  it("does the same for an app's route tree", async () => {
    renderRoutes([{ path: "/", element: <Show /> }]);
    await userEvent.click(screen.getByRole("button", { name: "Undo" }));
    expect(await screen.findByText("Vote undone")).toBeInTheDocument();
  });

  it("starts each render with no toast left from the last test", () => {
    renderWithStrata(<Show />);
    expect(screen.queryByText("Vote undone")).toBeNull();
  });

  it("leaves the region to an app whose tree already has one, so a toast is not seen twice", async () => {
    renderRoutes([{ path: "/", element: <><Show /><StrataToastRegion /></> }], { toasts: false });
    await userEvent.click(screen.getByRole("button", { name: "Undo" }));
    expect(await screen.findAllByText("Vote undone")).toHaveLength(1);
  });
});
