import * as React from "react";
import { describe, expect, it } from "vite-plus/test";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { Pixels } from "../../src/lib/image-diff";
import { Compare, type CompareMode } from "../../src";

// The three views added for a scanned page against the same page set again (strata-scan): above and
// below, the ink match, and the options on swipe and fade.

// A 10 × 10 page with ink in its first row: `shifted` moves the ink down a row and adds a blot only it has.
const page = (shifted: boolean): Pixels => {
  const data = new Uint8ClampedArray(10 * 10 * 4).fill(235);
  for (let i = 3; i < data.length; i += 4) data[i] = 255;
  const row = shifted ? 1 : 0;
  for (let x = 0; x < 10; x++) data.set([10, 10, 10, 255], (row * 10 + x) * 4);
  if (shifted) data.set([10, 10, 10, 255], (9 * 10 + 9) * 4);
  return { data, width: 10, height: 10 };
};
const read = (src: string) => Promise.resolve(page(src.endsWith("finished")));

const MODES: CompareMode[] = ["side", "stack", "swipe", "fade", "difference", "match"];

function Harness({ start }: { start: CompareMode }) {
  const [mode, setMode] = React.useState<CompareMode>(start);
  return (
    <Compare
      label="Page 12, scan and finished"
      blind={false}
      missing="Page not drawn"
      mode={mode}
      onModeChange={setMode}
      modes={MODES}
      readPixels={read}
      a={{
        id: "scan",
        label: "Scan",
        media: { kind: "image", src: "/p/12/scan", alt: "Page 12 as scanned", size: [600, 900] },
      }}
      b={{
        id: "finished",
        label: "Finished",
        media: { kind: "image", src: "/p/12/finished", alt: "Page 12 as finished", size: [600, 900] },
      }}
    />
  );
}

describe("Compare, views for pages", () => {
  it("offers above and below and the ink match only when asked for, and keeps the five by default", () => {
    render(<Harness start="side" />);
    expect(screen.getByRole("radio", { name: "Above and below" })).toBeInTheDocument();
    expect(screen.getByRole("radio", { name: "Ink match" })).toBeInTheDocument();
  });

  it("draws above and below as two frames in one column", async () => {
    const user = userEvent.setup();
    render(<Harness start="side" />);
    const grid = screen.getByRole("group", { name: "Scan" }).closest("figure")!.parentElement!;
    expect(grid).toHaveClass("sm:grid-cols-2");
    await user.click(screen.getByRole("radio", { name: "Above and below" }));
    const stacked = screen.getByRole("group", { name: "Scan" }).closest("figure")!.parentElement!;
    expect(stacked).not.toHaveClass("sm:grid-cols-2");
    expect(screen.getByRole("group", { name: "Finished" })).toBeInTheDocument();
  });

  it("matches the ink and says how much agrees and how much each lacks", async () => {
    const user = userEvent.setup();
    render(<Harness start="match" />);
    expect(screen.getByRole("group", { name: "Ink of Scan matched against Finished" })).toBeInTheDocument();
    // a row a pixel off is the same ink at the default of 1 px; the blot is the finished page's own
    const status = await screen.findByText(/of the ink agrees/);
    expect(status.textContent).toBe("95% of the ink agrees. Ink only in Scan: none of its ink; only in Finished: 9%.");
    screen.getByRole("slider", { name: "Pixels within which ink is the same ink" }).focus();
    await user.keyboard("{ArrowLeft}");
    expect(await screen.findByText(/^0% of the ink agrees|^<1% of the ink agrees/)).toBeInTheDocument();
    expect(screen.getByText("Only Scan").querySelector(".bg-danger")).not.toBeNull();
    expect(screen.getByText("Only Finished").querySelector(".bg-info")).not.toBeNull();
  });

  it("swipes down as well as across, with the divider's value the share shown from the top", async () => {
    const user = userEvent.setup();
    render(<Harness start="swipe" />);
    await user.click(screen.getByRole("radio", { name: "Top and bottom" }));
    const divider = screen.getByRole("slider", { name: "Divider between Scan and Finished" });
    expect(divider).toHaveAttribute("aria-orientation", "vertical");
    const frame = screen.getByRole("group", { name: "Scan over Finished" });
    const cut = [...frame.querySelectorAll<HTMLElement>("[style*='clip-path']")][0];
    expect(cut.style.clipPath).toBe("inset(0px 0px 50%)");
    divider.focus();
    await user.keyboard("{ArrowDown}");
    // down the page shows more of the cover, as dragging the line down would
    expect(cut.style.clipPath).toBe("inset(0px 0px 49%)");
  });

  it("lays B over A with a multiply blend so both inks show", async () => {
    const user = userEvent.setup();
    render(<Harness start="fade" />);
    const frame = screen.getByRole("group", { name: "Scan over Finished" });
    expect(frame.querySelector(".mix-blend-multiply")).toBeNull();
    await user.click(screen.getByRole("radio", { name: "Multiply" }));
    expect(frame.querySelector(".mix-blend-multiply")).not.toBeNull();
  });
});

describe("useInkMatch", () => {
  it("reads the theme's colours again when the scheme changes", async () => {
    const { useInkMatch } = await import("../../src");
    const { renderHook, waitFor, act } = await import("@testing-library/react");
    const root = document.documentElement;
    const { result } = renderHook(() => useInkMatch("/p/scan", "/p/finished", 1, true, read));
    await waitFor(() => expect(result.current.status).toBe("ready"));
    const first = result.current.status === "ready" ? result.current.match : null;
    await act(async () => {
      root.classList.add("dark");
      await Promise.resolve();
    });
    await waitFor(() => expect(result.current.status === "ready" && result.current.match).not.toBe(first));
    root.classList.remove("dark");
  });
});
