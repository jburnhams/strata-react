import { describe, expect, it } from "vitest";
import { marksFor, skipAction, type MediaMark } from "../../src";

// Issue #387: where the player's skip buttons go.

const tape: MediaMark[] = [
  { time: 0, label: "Christmas morning" },
  { time: 30, label: "Stockings", kind: "scene" },
  { time: 600, label: "Christmas dinner" },
  { time: 640, label: "The pudding", kind: "scene" },
  { time: 90, label: "Presents", kind: "scene" },
];

describe("marksFor", () => {
  it("gives scenes to the small level and chapters (and marks with no kind) to the large, in time order", () => {
    expect(marksFor(tape, "small")).toEqual([30, 90, 640]);
    expect(marksFor(tape, "large")).toEqual([0, 600]);
  });
});

describe("skipAction", () => {
  it("goes to the next scene and the next chapter", () => {
    expect(skipAction(tape, "small", 1, 40)).toEqual({ label: "Next scene", to: 90, by: "mark" });
    expect(skipAction(tape, "large", 1, 40)).toEqual({ label: "Next chapter", to: 600, by: "mark" });
  });

  it("goes back to the start of the part playing, or to the one before when that start was just now", () => {
    expect(skipAction(tape, "small", -1, 100).to).toBe(90);
    expect(skipAction(tape, "small", -1, 91).to).toBe(30);
    expect(skipAction(tape, "large", -1, 700)).toEqual({ label: "Previous chapter", to: 600, by: "mark" });
    expect(skipAction(tape, "large", -1, 601).to).toBe(0);
  });

  it("counts the file's start as a part, and has nowhere to go at either end", () => {
    expect(skipAction(tape, "small", -1, 20).to).toBe(0);
    expect(skipAction(tape, "small", -1, 0).to).toBeNull();
    expect(skipAction(tape, "small", 1, 640).to).toBeNull();
    expect(skipAction(tape, "large", 1, 600).to).toBeNull();
  });

  it("skips by time where a level has no marks: 10 s and 1 min by default, kept within the file", () => {
    expect(skipAction([], "small", 1, 5, { duration: 12 })).toEqual({ label: "Forward 10 s", to: 12, by: "time" });
    expect(skipAction([], "small", -1, 5)).toEqual({ label: "Back 10 s", to: 0, by: "time" });
    expect(skipAction([], "large", 1, 5)).toEqual({ label: "Forward 1 min", to: 65, by: "time" });
    expect(skipAction([], "small", -1, 0).to).toBeNull();
    expect(skipAction([], "small", 1, 12, { duration: 12 }).to).toBeNull();
  });

  it("falls back per level, and takes the app's steps", () => {
    const chaptersOnly = tape.filter((m) => !m.kind);
    expect(skipAction(chaptersOnly, "small", 1, 5, { steps: { small: 5 } }).label).toBe("Forward 5 s");
    expect(skipAction(chaptersOnly, "large", 1, 5).label).toBe("Next chapter");
    expect(skipAction([], "large", -1, 500, { steps: { large: 90 } })).toMatchObject({ label: "Back 90 s", to: 410 });
  });

  it("does not skip to a mark past the end of the file that loaded", () => {
    const long = [{ time: 0, label: "Morning" }, { time: 600, label: "Dinner" }];
    expect(skipAction(long, "large", 1, 100, { duration: 120 }).to).toBeNull();
    expect(skipAction(long, "large", -1, 100, { duration: 120 }).to).toBe(0);
  });
});
