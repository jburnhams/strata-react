import { describe, expect, it } from "vitest";
import { phraseAt, wordAt } from "../../src/lib/transcript";

// Issue #186: which phrase and word is heard at a time, at every boundary.

const phrases = [
  { start: 0, end: 4 },
  { start: 5, end: 9 },
  { start: 9, end: 12 },
];
describe("phraseAt", () => {
  it("is heard from its start up to, not including, its end", () => {
    expect(phraseAt(phrases, 0)).toBe(0);
    expect(phraseAt(phrases, 3.99)).toBe(0);
    expect(phraseAt(phrases, 4)).toBe(-1);
    expect(phraseAt(phrases, 5)).toBe(1);
    expect(phraseAt(phrases, 9)).toBe(2);
    expect(phraseAt(phrases, 12)).toBe(-1);
    expect(phraseAt(phrases, -1)).toBe(-1);
    expect(phraseAt([], 3)).toBe(-1);
  });
  it("finds a phrase that still covers the time when another has started (two speakers)", () => {
    expect(phraseAt([{ start: 0, end: 10 }, { start: 2, end: 3 }], 5)).toBe(0);
  });
});

describe("wordAt", () => {
  const phrase = { end: 4, words: [{ text: "a", start: 0.5, end: 1 }, { text: "b", start: 1.2, end: 2 }, { text: "c", start: 2.5, end: 3.5 }] };
  it("is the last word that has started, until the phrase ends", () => {
    expect(wordAt(phrase, 0.2)).toBe(-1);
    expect(wordAt(phrase, 0.5)).toBe(0);
    expect(wordAt(phrase, 1.1)).toBe(0); // the gap after a word keeps it lit
    expect(wordAt(phrase, 1.2)).toBe(1);
    expect(wordAt(phrase, 3.9)).toBe(2);
    expect(wordAt(phrase, 4)).toBe(-1);
  });
});
