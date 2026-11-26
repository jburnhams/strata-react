import { describe, expect, it, vi } from "vite-plus/test";
import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { FilmStrip, frameAt, pickEvenly } from "../../src";
import { renderWithStrata } from "../../src/testing";

// A row of frames from a stretch of video (strata-reels' scene browser). jsdom's box is 640 px wide
// (installLayoutShims), so six 96 px frames fit with their gaps.

const frames = Array.from({ length: 20 }, (_, i) => ({
  time: 600 + i * 10,
  src: `/api/frames/${i}.jpg`,
}));

describe("pickEvenly and frameAt", () => {
  it("picks from the first to the last, all of them when there are few, the middle one alone", () => {
    expect(pickEvenly([1, 2, 3, 4, 5, 6, 7], 3)).toEqual([1, 4, 7]);
    expect(pickEvenly([1, 2], 5)).toEqual([1, 2]);
    expect(pickEvenly([1, 2, 3, 4, 5], 1)).toEqual([3]);
    expect(pickEvenly([1, 2, 3], 0)).toEqual([]);
  });

  it("finds the last frame at or before the time, and none outside the span", () => {
    const f = [
      { time: 0, src: null },
      { time: 10, src: null },
      { time: 20, src: null },
    ];
    expect(frameAt(f, 15, [0, 30])).toBe(1);
    expect(frameAt(f, 25, [0, 30])).toBe(2);
    expect(frameAt(f, 30, [0, 30])).toBe(-1);
    expect(frameAt(f, undefined, [0, 30])).toBe(-1);
  });
});

describe("FilmStrip", () => {
  it("shows as many frames as fit, spread from the first to the last, each named by its time", () => {
    renderWithStrata(<FilmStrip label="Frames of scene 3" frames={frames} />);
    const group = screen.getByRole("group", { name: "Frames of scene 3" });
    expect(group).toBeInTheDocument();
    const names = screen.getAllByRole("img").map((img) => img.getAttribute("alt"));

    expect(names).toHaveLength(6);
    expect(names[0]).toBe("Frame at 10:00");
    expect(names[5]).toBe("Frame at 13:10");
  });

  it("keeps a frame's picture when the frames shown change, keyed by its time and not its place (#352)", () => {
    const { rerender } = renderWithStrata(<FilmStrip label="Frames" frames={frames.slice(0, 6)} />);
    const kept = screen.getByRole("img", { name: "Frame at 10:30" });
    rerender(<FilmStrip label="Frames" frames={frames.slice(1, 7)} />);
    expect(screen.getByRole("img", { name: "Frame at 10:30" })).toBe(kept);
  });

  it("seeks from a pressed frame; the frames are one tab stop moved through with the arrows", async () => {
    const user = userEvent.setup();
    const onSeek = vi.fn();
    renderWithStrata(
      <>
        <button type="button">Before</button>
        <FilmStrip label="Frames of scene 3" frames={frames} onSeek={onSeek} />
        <button type="button">After</button>
      </>,
    );
    expect(screen.getByRole("toolbar", { name: "Frames of scene 3" })).toBeInTheDocument();
    screen.getByRole("button", { name: "Before" }).focus();
    await user.tab();
    expect(screen.getByRole("button", { name: "Play from 10:00" })).toHaveFocus();
    await user.keyboard("{ArrowRight}");
    expect(document.activeElement).toHaveAccessibleName(/^Play from 10:/);
    expect(document.activeElement).not.toHaveAccessibleName("Play from 10:00");
    await user.keyboard("{End}");
    expect(screen.getByRole("button", { name: "Play from 13:10" })).toHaveFocus();
    await user.keyboard("{Enter}");
    expect(onSeek).toHaveBeenCalledWith(790);
    await user.tab();
    expect(screen.getByRole("button", { name: "After" })).toHaveFocus();
    await user.click(screen.getByRole("button", { name: "Play from 10:00" }));
    expect(onSeek).toHaveBeenLastCalledWith(600);
  });

  it("marks the frame being watched only while the time is inside the span", () => {
    const { rerender } = renderWithStrata(
      <FilmStrip label="Scene" frames={frames.slice(0, 3)} span={[600, 630]} time={615} onSeek={() => {}} />,
    );
    expect(screen.getByRole("button", { name: "Play from 10:10" })).toHaveAttribute("aria-current", "time");
    expect(screen.getByRole("button", { name: "Play from 10:00" })).not.toHaveAttribute("aria-current");
    rerender(<FilmStrip label="Scene" frames={frames.slice(0, 3)} span={[600, 630]} time={640} onSeek={() => {}} />);
    expect(screen.queryByRole("button", { current: "time" })).toBeNull();
  });

  it("says when a stretch has no frames at all, in the product's words", () => {
    renderWithStrata(<FilmStrip label="Frames of scene 9" frames={[]} missing="No thumbnails yet" />);
    expect(screen.getByRole("img", { name: "Frames of scene 9: No thumbnails yet" })).toBeInTheDocument();
  });
});
