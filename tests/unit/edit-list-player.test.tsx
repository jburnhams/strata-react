import { afterEach, beforeEach, describe, expect, it } from "vite-plus/test";
import { act, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import * as React from "react";
import {
  EditListPlayer,
  type EditListState,
  continues,
  editTimeOf,
  editTimes,
  locateInEdit,
  nextBreak,
  type EditClip,
} from "../../src";
import { renderWithStrata } from "../../src/testing";
import { installFakeMedia, type FakeMedia } from "../utils/media";

// Issue #397. The arithmetic alone, then the player on tests/utils/media.ts (jsdom has no decoder): the two elements, their
// events and the swap are the real ones.

const clips: EditClip[] = [
  { id: "c1", src: "/tape.mp4", start: 10, end: 14, label: "Cake" },
  { id: "c2", src: "/tape.mp4", start: 14, end: 16, label: "Candles" },
  { id: "c3", src: "/tape.mp4", start: 40, end: 43, label: "Garden" },
  { id: "c4", src: "/other.mp4", start: 0, end: 5, label: "Beach" },
];

describe("edit-list arithmetic", () => {
  const times = editTimes(clips);
  it("puts each clip after the ones before", () => {
    expect(times).toEqual({ at: [0, 4, 6, 9], duration: 14 });
  });
  it("finds the clip at a time, the later one at a cut, the last one at the end", () => {
    expect(locateInEdit(clips, times, 0)).toEqual({ index: 0, source: 10 });
    expect(locateInEdit(clips, times, 4)).toEqual({ index: 1, source: 14 });
    expect(locateInEdit(clips, times, 7.5)).toEqual({ index: 2, source: 41.5 });
    expect(locateInEdit(clips, times, 14)).toEqual({ index: 3, source: 5 });
    expect(locateInEdit(clips, times, 99)).toEqual({ index: 3, source: 5 });
    expect(locateInEdit(clips, times, -3)).toEqual({ index: 0, source: 10 });
    expect(locateInEdit([], editTimes([]), 0)).toBeNull();
  });
  it("skips an empty clip", () => {
    const withEmpty = [clips[0], { ...clips[1], end: 14 }, clips[2]];
    expect(locateInEdit(withEmpty, editTimes(withEmpty), 4)).toEqual({ index: 2, source: 40 });
  });
  it("maps file time back to edit time, held inside the clip", () => {
    expect(editTimeOf(clips, times, 2, 42)).toBe(8);
    expect(editTimeOf(clips, times, 2, 50)).toBe(9);
    expect(editTimeOf(clips, times, 2, 1)).toBe(6);
  });
  it("knows a straight carry-on and the next break", () => {
    expect(continues(clips[0], clips[1])).toBe(true);
    expect(continues(clips[1], clips[2])).toBe(false);
    expect(nextBreak(clips, 0)).toBe(2);
    expect(nextBreak(clips, 2)).toBe(3);
    expect(nextBreak(clips, 3)).toBeNull();
  });
});

describe("EditListPlayer", () => {
  let media: FakeMedia;
  beforeEach(() => void (media = installFakeMedia()));
  afterEach(() => media.uninstall());

  const videos = () => [...document.querySelectorAll("video")] as HTMLVideoElement[];
  const front = () => document.querySelector("video[data-front]") as HTMLVideoElement;
  const behind = () => document.querySelector("video:not([data-front])") as HTMLVideoElement;
  const loadAll = () => act(() => videos().forEach((v) => media.loaded(v, 600)));

  it("holds the first clip in front and the next break behind, sought to their starts", () => {
    renderWithStrata(<EditListPlayer clips={clips} label="Preview" empty="No clips" fps={25} />);
    loadAll();
    expect(front().getAttribute("src")).toBe("/tape.mp4");
    expect(front().currentTime).toBe(10);
    expect(behind().getAttribute("src")).toBe("/tape.mp4");
    expect(behind().currentTime).toBe(40);
    expect(screen.getByText(/Clip 1 of 4/)).toBeInTheDocument();
  });

  it("plays through a carry-on without a swap, and swaps at a break with the next one already waiting", async () => {
    const user = userEvent.setup();
    renderWithStrata(<EditListPlayer clips={clips} label="Preview" empty="No clips" fps={25} />);
    loadAll();
    const [first, second] = [front(), behind()];
    await user.click(screen.getByRole("button", { name: "Play" }));
    expect(first.paused).toBe(false);
    // Into the second clip, the same file carrying on: the same element keeps playing.
    act(() => media.tick(first, 14.1));
    expect(front()).toBe(first);
    expect(screen.getByText(/Clip 2 of 4/)).toBeInTheDocument();
    // Half a frame before the out-point the one behind takes over at its in-point.
    act(() => media.tick(first, 15.99));
    expect(front()).toBe(second);
    expect(second.paused).toBe(false);
    expect(second.currentTime).toBe(40);
    expect(first.paused).toBe(true);
    expect(screen.getByText(/Clip 3 of 4/)).toBeInTheDocument();
    // The old one now waits for the clip after, in the other file.
    expect(first.getAttribute("src")).toBe("/other.mp4");
    act(() => media.loaded(first, 5));
    expect(first.currentTime).toBe(0);
    act(() => media.tick(second, 43));
    expect(front()).toBe(first);
    expect(first.paused).toBe(false);
    // The end of the last clip stops the edit there.
    act(() => media.tick(first, 5));
    expect(screen.getByRole("button", { name: "Play" })).toBeInTheDocument();
    expect(first.paused).toBe(true);
  });

  it("reads edit time from the file time in front", async () => {
    const user = userEvent.setup();
    renderWithStrata(<EditListPlayer clips={clips} label="Preview" empty="No clips" />);
    loadAll();
    await user.click(screen.getByRole("button", { name: "Play" }));
    act(() => media.tick(front(), 12.5));
    const bar = screen.getByRole("slider", { name: "Seek in Preview" });
    expect(bar).toHaveAttribute("max", "14");
    expect(bar).toHaveValue("2.5");
  });

  it("seeks across the edit, using the element that has the file, and keeps playing", async () => {
    const user = userEvent.setup();
    renderWithStrata(<EditListPlayer clips={clips} label="Preview" empty="No clips" />);
    loadAll();
    await user.click(screen.getByRole("button", { name: "Play" }));
    await user.click(screen.getByRole("button", { name: "Next clip" }));
    expect(screen.getByText(/Clip 2 of 4/)).toBeInTheDocument();
    expect(front().currentTime).toBe(14);
    await user.click(screen.getByRole("button", { name: "Next clip" }));
    await user.click(screen.getByRole("button", { name: "Next clip" }));
    expect(screen.getByText(/Clip 4 of 4/)).toBeInTheDocument();
    expect(front().getAttribute("src")).toBe("/other.mp4");
    act(() => media.loaded(front(), 5));
    expect(front().currentTime).toBe(0);
    expect(front().paused).toBe(false);
    expect(screen.getByRole("button", { name: "Next clip" })).toBeDisabled();
  });

  it("steps a frame and pauses", async () => {
    const user = userEvent.setup();
    renderWithStrata(<EditListPlayer clips={clips} label="Preview" empty="No clips" fps={25} />);
    loadAll();
    await user.click(screen.getByRole("button", { name: "Forward one frame" }));
    expect(front().currentTime).toBeCloseTo(10.04);
    expect(screen.getByRole("button", { name: "Play" })).toBeInTheDocument();
  });

  it("says when the browser refused to play, and when a file will not load", async () => {
    const user = userEvent.setup();
    renderWithStrata(<EditListPlayer clips={clips} label="Preview" empty="No clips" />);
    loadAll();
    media.refuseNextPlay();
    await user.click(screen.getByRole("button", { name: "Play" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("did not let it play");
    await user.click(screen.getByRole("button", { name: "Play" }));
    act(() => media.fail(front(), 4));
    expect(screen.getByRole("alert")).toHaveTextContent("cannot play");
    await user.click(screen.getByRole("button", { name: "Try again" }));
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("shows the empty state and disables the controls with no clips", () => {
    renderWithStrata(<EditListPlayer clips={[]} label="Preview" empty="Make a reel to preview it." />);
    expect(screen.getByText("Make a reel to preview it.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Play" })).toBeDisabled();
  });

  it("stays in the clip being watched when given a new edit that still has it, else keeps the edit time", async () => {
    const user = userEvent.setup();
    const { rerender } = renderWithStrata(<EditListPlayer clips={clips} label="Preview" empty="No clips" />);
    loadAll();
    await user.click(screen.getByRole("button", { name: "Play" }));
    act(() => media.tick(front(), 15));
    // The first clip is dropped: the second (the one playing) moves to the start of the edit, and the player stays in it.
    rerender(<EditListPlayer clips={clips.slice(1)} label="Preview" empty="No clips" />);
    expect(screen.getByText(/Clip 1 of 3/)).toBeInTheDocument();
    expect(front().currentTime).toBe(15);
    expect(screen.getByRole("slider", { name: "Seek in Preview" })).toHaveValue("1");
    // Its clip gone, the same edit time (1 s) in what is left.
    rerender(<EditListPlayer clips={[clips[2], clips[3]]} label="Preview" empty="No clips" />);
    expect(screen.getByText(/Clip 1 of 2/)).toBeInTheDocument();
    expect(front().currentTime).toBe(41);
  });

  it("keeps the one behind on its in-point when Play comes before its file has loaded", async () => {
    const player = React.createRef<EditListState>();
    renderWithStrata(<EditListPlayer clips={clips} label="Preview" empty="No clips" playerRef={player} />);
    act(() => media.loaded(front(), 600));
    // Play unlocks the one behind while it still waits for its file; the file arrives before play() settles.
    act(() => {
      void player.current?.play();
      media.loaded(behind(), 600);
    });
    await act(async () => {});
    expect(behind().currentTime).toBe(40);
    expect(behind().paused).toBe(true);
  });

  it("stops and lets go of the files when the edit becomes empty", async () => {
    const user = userEvent.setup();
    const { rerender } = renderWithStrata(<EditListPlayer clips={clips} label="Preview" empty="No clips" />);
    loadAll();
    await user.click(screen.getByRole("button", { name: "Play" }));
    rerender(<EditListPlayer clips={[]} label="Preview" empty="No clips" />);
    for (const v of videos()) {
      expect(v.paused).toBe(true);
      expect(v.getAttribute("src")).toBeNull();
    }
    expect(screen.getByRole("button", { name: "Play" })).toBeDisabled();
  });
});
