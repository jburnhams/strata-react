import * as React from "react";
import { describe, expect, it, onTestFinished, vi } from "vitest";
import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { PlayWindowButton, TranscriptView, type TranscriptGroup, type TranscriptViewProps } from "../../src";
import { renderWithStrata } from "../../src/testing";

// Issue #186: timed text against a player.

const phrase = (id: string, start: number, text: string, speaker?: string, alt?: string) => {
  const words = text.split(" ").map((w, i) => ({ text: w, start: start + i * 0.5, end: start + (i + 1) * 0.5 }));
  return { id, start, end: start + words.length * 0.5, words, speaker, alt: alt ? { translated: alt } : undefined };
};
const groups: TranscriptGroup[] = [
  { id: "g1", title: "Clip one", phrases: [phrase("p1", 0, "good morning everyone", "Ada", "bonjour tout le monde"), phrase("p2", 3, "thank you for coming", "Ben", "merci d'être venus")] },
  { id: "g2", title: "Clip two", phrases: [phrase("p3", 10, "let us begin", "Ada", "commençons")] },
];

function Host(props: Partial<TranscriptViewProps>) {
  return <TranscriptView label="Transcript" groups={groups} time={0} onSeek={() => {}} {...props} />;
}
const row = (id: string) => document.querySelector<HTMLElement>(`[data-phrase="${id}"]`)!;

describe("TranscriptView", () => {
  it("lists the phrases in order under their clip headings with the clip's time range", () => {
    renderWithStrata(<Host />);
    expect(screen.getByRole("heading", { name: "Clip one" })).toBeInTheDocument();
    expect(screen.getByText("0:00–0:05")).toBeInTheDocument(); // derived from its phrases
    expect(screen.getByText("0:10–0:11")).toBeInTheDocument();
    const grid = screen.getByRole("grid", { name: "Transcript" });
    expect(within(grid).getAllByRole("row")).toHaveLength(5);
  });

  it("marks the word being heard, not by colour alone, and the phrase it is in", () => {
    renderWithStrata(<Host time={3.6} />);
    const word = within(row("p2")).getByRole("button", { name: "you" });
    expect(word).toHaveAttribute("aria-current", "true");
    expect(word.className).toMatch(/underline/);
    expect(row("p2")).toHaveAttribute("aria-current", "true");
    expect(row("p1")).not.toHaveAttribute("aria-current");
  });

  it("at the boundaries: a phrase is heard from its start, a word until the next begins, nothing in the gap", () => {
    const { rerender } = renderWithStrata(<Host time={3} />);
    expect(within(row("p2")).getByRole("button", { name: "thank" })).toHaveAttribute("aria-current", "true");
    rerender(<Host time={1.4} />);
    expect(row("p2")).not.toHaveAttribute("aria-current");
    expect(within(row("p1")).getByRole("button", { name: "everyone" })).toHaveAttribute("aria-current", "true");
    rerender(<Host time={1.5} />); // p1 has ended and p2 has not begun
    expect(document.querySelector("[data-phrase][aria-current=true]")).toBeNull();
    rerender(<Host time={5.5} />);
    expect(document.querySelector("[aria-current=true]")).toBeNull();
  });

  it("seeks to a word with a click or Enter, naming the phrase and word", async () => {
    const user = userEvent.setup();
    const onSeek = vi.fn();
    renderWithStrata(<Host onSeek={onSeek} />);
    await user.click(within(row("p1")).getByRole("button", { name: "morning" }));
    expect(onSeek).toHaveBeenLastCalledWith(0.5, { phraseId: "p1", wordIndex: 1 });
    within(row("p2")).getByRole("button", { name: "coming" }).focus();
    await user.keyboard("{Enter}");
    expect(onSeek).toHaveBeenLastCalledWith(4.5, { phraseId: "p2", wordIndex: 3 });
    await user.click(within(row("p3")).getByRole("button", { name: "Play from 0:10" }));
    expect(onSeek).toHaveBeenLastCalledWith(10, { phraseId: "p3" });
  });

  it("switches to the translated text, where the phrase is one button to play from", async () => {
    const user = userEvent.setup();
    const onSeek = vi.fn();
    renderWithStrata(<Host onSeek={onSeek} time={3.2} />);
    await user.click(screen.getByRole("radio", { name: "Translated" }));
    expect(screen.queryByRole("button", { name: "thank" })).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "merci d'être venus" }));
    expect(onSeek).toHaveBeenLastCalledWith(3, { phraseId: "p2" });
  });

  it("filters by speaker and hides a clip with nothing left", async () => {
    const user = userEvent.setup();
    renderWithStrata(<Host />);
    await user.click(screen.getByRole("radio", { name: "Ben" }));
    expect(screen.getByRole("heading", { name: "Clip one" })).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Clip two" })).not.toBeInTheDocument();
    expect(row("p1")).toBeNull();
    expect(row("p2")).not.toBeNull();
  });

  it("has a play control slot per phrase, such as PlayWindowButton", () => {
    const media = { playing: false, window: null, playWindow: vi.fn(), pause: vi.fn() };
    renderWithStrata(<Host renderPlay={(p) => <PlayWindowButton media={media} window={{ start: p.start, end: p.end }} label={`Play phrase ${p.id}`} />} />);
    expect(screen.getByRole("button", { name: "Play phrase p2" })).toBeInTheDocument();
  });

  it("does not announce words; with announce it says each phrase once", () => {
    const { rerender } = renderWithStrata(<Host time={0.2} />);
    expect(screen.getByRole("status")).toBeEmptyDOMElement();
    rerender(<Host time={0.7} announce />);
    expect(screen.getByRole("status")).toHaveTextContent("good morning everyone");
    rerender(<Host time={1.2} announce />);
    expect(screen.getByRole("status")).toHaveTextContent("good morning everyone");
    rerender(<Host time={3.1} announce />);
    expect(screen.getByRole("status")).toHaveTextContent("thank you for coming");
  });
});

describe("follow and Jump to now", () => {
  it("scrolls the heard phrase into view as it changes, until the person scrolls away; Jump to now returns", async () => {
    const user = userEvent.setup();
    const scroll = vi.fn();
    const saved = Element.prototype.scrollIntoView;
    Element.prototype.scrollIntoView = scroll;
    try {
      const { rerender } = renderWithStrata(<Host time={0.2} />);
      await waitFor(() => expect(scroll).toHaveBeenCalledTimes(1));
      rerender(<Host time={3.1} />);
      await waitFor(() => expect(scroll).toHaveBeenCalledTimes(2));
      // The person scrolls: a scroll we did not make.
      await new Promise((r) => setTimeout(r, 450));
      fireEvent.scroll(screen.getByRole("grid", { name: "Transcript" }));
      rerender(<Host time={10.1} />);
      expect(scroll).toHaveBeenCalledTimes(2);
      const jump = screen.getByRole("button", { name: /Jump to now: let us begin/ });
      await user.click(jump);
      await waitFor(() => expect(scroll).toHaveBeenCalledTimes(3));
      expect(screen.queryByRole("button", { name: /Jump to now/ })).not.toBeInTheDocument();
      rerender(<Host time={10.6} />);
    } finally {
      Element.prototype.scrollIntoView = saved;
    }
  });

  it("a seek from the transcript turns following back on", async () => {
    const user = userEvent.setup();
    renderWithStrata(<Host time={3.1} />);
    await new Promise((r) => setTimeout(r, 450));
    fireEvent.scroll(screen.getByRole("grid", { name: "Transcript" }));
    expect(screen.getByRole("button", { name: /Jump to now/ })).toBeInTheDocument();
    await user.click(within(row("p1")).getByRole("button", { name: "good" }));
    expect(screen.queryByRole("button", { name: /Jump to now/ })).not.toBeInTheDocument();
  });
});

describe("a long transcript", () => {
  it("renders only the rows near the top of 2000 phrases, and still names the heard phrase when it is far away", async () => {
    // React Aria's Virtualizer measures a row of unknown height by its scroll size, which jsdom reports as 0.
    const before = Object.getOwnPropertyDescriptor(Element.prototype, "scrollHeight");
    Object.defineProperty(Element.prototype, "scrollHeight", { configurable: true, get: () => 72 });
    onTestFinished(() => {
      if (before) Object.defineProperty(Element.prototype, "scrollHeight", before);
      else delete (Element.prototype as unknown as Record<string, unknown>).scrollHeight;
    });
    const many: TranscriptGroup[] = [{ id: "g", title: "Everything", phrases: Array.from({ length: 2000 }, (_, i) => phrase(`q${i}`, i * 3, `phrase number ${i}`)) }];
    renderWithStrata(<TranscriptView label="Transcript" groups={many} time={3000} onSeek={() => {}} follow={false} />);
    expect(document.querySelectorAll("[data-phrase]").length).toBeLessThan(60);
    expect(screen.getByRole("button", { name: /Jump to now: phrase number 1000/ })).toBeInTheDocument();
  });
});
