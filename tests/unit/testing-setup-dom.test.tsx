import { afterEach, describe, expect, it } from "vite-plus/test";
import { render, screen } from "@testing-library/react";
import { toast, StrataToastRegion } from "../../src";
import { setupStrataTests } from "../../src/testing";

// Issue #363: with Testing Library's own auto-cleanup off, each render stacked on the last. The setup
// hook it registers unmounts after every test and clears the toast queue.

const hooks: Array<() => void | Promise<void>> = [];
const restore = setupStrataTests({
  afterEach: (h) => void hooks.push(h),
  layout: { width: 123, height: 45 },
});
afterEach(() => void hooks.forEach((h) => h()));

describe("setupStrataTests in jsdom", () => {
  it("installs the layout shims with the box asked for", () => {
    expect(document.body.clientWidth).toBe(123);
    restore();
    expect(document.body.clientWidth).not.toBe(123);
  });

  it("unmounts what a test rendered", () => {
    render(<p>First test</p>);
    expect(screen.getAllByText("First test")).toHaveLength(1);
    hooks.forEach((h) => h());
    expect(screen.queryByText("First test")).toBeNull();
  });

  it("clears the toast queue", () => {
    toast.show({ title: "Saved" });
    hooks.forEach((h) => h());
    render(<StrataToastRegion />);
    expect(screen.queryByText("Saved")).toBeNull();
  });
});
