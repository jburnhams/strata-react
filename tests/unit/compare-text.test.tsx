import { describe, expect, it } from "vitest";
import { fireEvent, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderWithStrata } from "../../src/testing";
import { CompareText, diffWords, type Candidate, type TextMedia } from "../../src";
import { MAX_CELLS } from "../../src/lib/text-diff";

const text = (id: string, label: string, t: string, note?: string): Candidate<TextMedia> => ({ id, label, note, media: { kind: "text", text: t } });

describe("diffWords", () => {
  it("marks the words that are in one text and not the other, keeping the spaces as written", () => {
    const r = diffWords("the cat sat  on the mat", "the cat sits on a mat")!;
    expect(r.a.filter((s) => s.changed).map((s) => s.text)).toEqual(["sat", "the"]);
    expect(r.b.filter((s) => s.changed).map((s) => s.text)).toEqual(["sits", "a"]);
    expect(r.a.map((s) => s.text).join("")).toBe("the cat sat  on the mat");
    expect([r.changedA, r.changedB]).toEqual([2, 2]);
  });

  it("finds nothing in two equal texts, and counts case and punctuation", () => {
    expect(diffWords("Hello, world", "Hello, world")).toMatchObject({ changedA: 0, changedB: 0 });
    expect(diffWords("Hello, world", "hello world")).toMatchObject({ changedA: 1, changedB: 1 }); // "Hello," is not "hello"; "world" is
  });

  it("handles an empty side, and refuses a pair too long to table", () => {
    expect(diffWords("", "one two")).toMatchObject({ changedA: 0, changedB: 2 });
    const long = Array.from({ length: Math.ceil(Math.sqrt(MAX_CELLS)) + 5 }, (_, i) => `w${i}`).join(" ");
    expect(diffWords(long, long)).toBeNull();
  });
});

describe("CompareText", () => {
  const a = text("model-x", "A", "The cat sat on the mat.", "secret-note-a");
  const b = text("model-y", "B", "The cat sits on a mat.", "secret-note-b");

  it("shows both texts under their labels and nothing that names a candidate when blind", () => {
    const { container } = renderWithStrata(<CompareText label="Transcripts" a={a} b={b} blind />);
    expect(screen.getByRole("region", { name: "Text A" })).toHaveTextContent("The cat sat on the mat.");
    expect(screen.getByRole("region", { name: "Text B" })).toHaveTextContent("The cat sits on a mat.");
    for (const secret of ["model-x", "model-y", "secret-note"]) expect(container.innerHTML).not.toContain(secret);
  });

  it("shows the notes when it is not blind", () => {
    renderWithStrata(<CompareText label="Transcripts" a={a} b={b} blind={false} />);
    expect(screen.getByText("secret-note-a")).toBeInTheDocument();
  });

  it("marks differing words only when asked, as highlights, and says how many", async () => {
    renderWithStrata(<CompareText label="Transcripts" a={a} b={b} blind />);
    expect(screen.queryAllByRole("mark")).toHaveLength(0);
    await userEvent.click(screen.getByRole("switch", { name: "Mark the words that differ" }));
    const marks = (name: string) => within(screen.getByRole("region", { name })).getAllByText(/./, { selector: "mark" }).map((m) => m.textContent);
    expect(marks("Text A")).toEqual(["sat", "the"]);
    expect(marks("Text B")).toEqual(["sits", "a"]);
    expect(screen.getByRole("status")).toHaveTextContent("A: 2 words differ. B: 2 words differ.");
  });

  it("says so when the texts are the same, and when they are too long to compare", async () => {
    const { rerender } = renderWithStrata(<CompareText label="T" a={a} b={{ ...b, media: a.media }} blind defaultDiff />);
    expect(screen.getByRole("status")).toHaveTextContent("The texts are the same word for word.");
    const long = Array.from({ length: 2000 }, (_, i) => `w${i}`).join(" ");
    rerender(<CompareText label="T" a={text("x", "A", long)} b={text("y", "B", long)} blind defaultDiff tooLong="Too long to compare." />);
    expect(screen.getByRole("status")).toHaveTextContent("Too long to compare.");
    expect(screen.getByRole("region", { name: "Text A" })).toHaveTextContent("w1999");
  });

  it("diffs against a reference when there is one", async () => {
    renderWithStrata(<CompareText label="T" a={a} b={b} blind defaultDiff reference={{ label: "What was said", text: "The cat sat on the mat." }} />);
    expect(screen.getByRole("radio", { name: "What was said" })).toBeChecked();
    expect(screen.getByRole("status")).toHaveTextContent("A: 0 words differ. B: 2 words differ.");
    await userEvent.click(screen.getByRole("radio", { name: "The other text" }));
    expect(screen.getByRole("status")).toHaveTextContent("A: 2 words differ. B: 2 words differ.");
    expect(screen.getByText("What was said", { selector: "figcaption" })).toBeInTheDocument();
  });

  it("scrolls the two panes together, to the same share of their length", () => {
    renderWithStrata(<CompareText label="T" a={a} b={b} blind />);
    const [boxA, boxB] = [screen.getByRole("region", { name: "Text A" }), screen.getByRole("region", { name: "Text B" })];
    for (const [box, height] of [[boxA, 1000], [boxB, 2000]] as const) {
      Object.defineProperty(box, "scrollHeight", { configurable: true, value: height });
      Object.defineProperty(box, "clientHeight", { configurable: true, value: 100 });
    }
    boxA.scrollTop = 450; // half of A's 900 px range
    fireEvent.scroll(boxA);
    expect(boxB.scrollTop).toBe(950); // half of B's 1900
  });

  it("can be scrolled from the keyboard: each pane is a labelled, focusable region", () => {
    renderWithStrata(<CompareText label="T" a={a} b={b} blind />);
    expect(screen.getByRole("region", { name: "Text A" })).toHaveAttribute("tabindex", "0");
  });
});
