import { describe, expect, it, onTestFinished, vi } from "vitest";
import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { PlayWindowButton, TranscriptView, type TranscriptGroup, type TranscriptViewProps, type TranscriptWord } from "../../src";
import { renderWithStrata } from "../../src/testing";

// Issue #186: timed text against a player.

const phrase = (id: string, start: number, text: string, speaker?: string, alt?: string) => {
  const words: TranscriptWord[] = text.split(" ").map((w, i) => ({ text: w, start: start + i * 0.5, end: start + (i + 1) * 0.5 }));
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
      fireEvent.wheel(screen.getByRole("grid", { name: "Transcript" }));
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

  it("a scroll that nothing of the person's caused does not turn following off", () => {
    renderWithStrata(<Host time={3.1} />);
    fireEvent.scroll(screen.getByRole("grid", { name: "Transcript" }));
    expect(screen.queryByRole("button", { name: /Jump to now/ })).not.toBeInTheDocument();
  });

  it("a seek from the transcript turns following back on", async () => {
    const user = userEvent.setup();
    renderWithStrata(<Host time={3.1} />);
    await new Promise((r) => setTimeout(r, 450));
    fireEvent.wheel(screen.getByRole("grid", { name: "Transcript" }));
    fireEvent.scroll(screen.getByRole("grid", { name: "Transcript" }));
    expect(screen.getByRole("button", { name: /Jump to now/ })).toBeInTheDocument();
    await user.click(within(row("p1")).getByRole("button", { name: "good" }));
    expect(screen.queryByRole("button", { name: /Jump to now/ })).not.toBeInTheDocument();
  });
});

describe("a long transcript", () => {
  it("renders only the rows near the top of 2000 phrases", async () => {
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
    // Not following (the app turned it off): the heard phrase is far away and nothing offers to go there.
    expect(screen.queryByRole("button", { name: /Jump to now/ })).not.toBeInTheDocument();
  });
});

// Issue #223: doubt, a phrase's own state, correcting text, and a hover card.
describe("TranscriptView doubt, marks, correction and card", () => {
  const doubtGroups = (): TranscriptGroup[] => {
    const p1 = phrase("p1", 0, "good morning everyone", "Ada");
    const p2 = phrase("p2", 3, "thank you for coming", "Ben");
    const p3 = phrase("p3", 10, "let us begin", "Ada");
    p1.words[1] = { ...p1.words[1], confidence: 0.3 };
    p3.words[0] = { ...p3.words[0], doubtful: true };
    p2.words[2] = { ...p2.words[2], confidence: 0.9 };
    return [{ id: "g1", title: "Clip one", phrases: [p1, p2] }, { id: "g2", title: "Clip two", phrases: [p3] }];
  };
  const notSung = { id: "not-sung", label: "Not sung", tone: "neutral" } as const;

  it("marks doubtful words by more than colour, counts them, and filters to them", async () => {
    const user = userEvent.setup();
    renderWithStrata(<Host groups={doubtGroups()} />);
    const morning = within(row("p1")).getByRole("button", { name: "morning (doubtful)" });
    expect(morning).toHaveAttribute("data-doubtful");
    expect(morning.className).toMatch(/decoration-dotted/);
    expect(within(row("p1")).getByText("Doubtful")).toBeInTheDocument();
    expect(within(row("p2")).queryByText("Doubtful")).toBeNull(); // 0.9 is sure enough
    expect(screen.getByText("2 doubtful")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Only doubtful" }));
    expect(row("p2")).toBeNull();
    expect(row("p1")).not.toBeNull();
    expect(row("p3")).not.toBeNull();
    await user.click(screen.getByRole("button", { name: "Only doubtful" }));
    expect(row("p2")).not.toBeNull();
  });

  it("a threshold is the app's: doubtfulBelow moves it", () => {
    renderWithStrata(<Host groups={doubtGroups()} doubtfulBelow={0.95} />);
    expect(screen.getByText("3 doubtful")).toBeInTheDocument(); // p2's 0.9 is now under it
  });

  it("shows a phrase's own state as a word, counts it, and sets and clears it from the row's menu", async () => {
    const user = userEvent.setup();
    const onPhraseState = vi.fn();
    const g = doubtGroups();
    const marked = { ...g[0].phrases[0], state: notSung };
    renderWithStrata(<Host groups={[{ ...g[0], phrases: [marked, g[0].phrases[1]] }, g[1]]} states={[notSung, { id: "not-lyric", label: "Not a lyric", tone: "warning" }]} onPhraseState={onPhraseState} />);
    expect(within(row("p1")).getByText("Not sung")).toBeInTheDocument();
    expect(screen.getByText(/1 not sung/)).toBeInTheDocument();
    await user.click(within(row("p2")).getByRole("button", { name: "Mark the phrase at 0:03" }));
    await user.click(await screen.findByRole("menuitem", { name: "Not a lyric" }));
    expect(onPhraseState).toHaveBeenLastCalledWith("p2", "not-lyric");
    await user.click(await within(row("p1")).findByRole("button", { name: "Mark the phrase at 0:00" }));
    expect(screen.queryByRole("menuitem", { name: "Not sung" })).toBeNull(); // it has that one
    await user.click(await screen.findByRole("menuitem", { name: "Clear mark" }));
    expect(onPhraseState).toHaveBeenLastCalledWith("p1", null);
  });

  it("Enter on a row opens its text for correction; Save sends it, Cancel and Escape do not, and it is announced", async () => {
    const user = userEvent.setup();
    const onEdit = vi.fn();
    renderWithStrata(<Host onEdit={onEdit} />);
    const rowEl = row("p2").closest<HTMLElement>('[role="row"]')!;
    rowEl.focus();
    await user.keyboard("{Enter}");
    const box = await screen.findByRole("textbox", { name: "Edit the phrase at 0:03" });
    expect(box).toHaveValue("thank you for coming");
    expect(screen.getByRole("status")).toHaveTextContent("Editing the phrase at 0:03");
    await user.clear(box);
    await user.type(box, "thanks for coming");
    await user.click(screen.getByRole("button", { name: "Save" }));
    expect(onEdit).toHaveBeenCalledWith("p2", "thanks for coming", { mode: "original" });
    expect(screen.queryByRole("textbox")).toBeNull();
    expect(screen.getByRole("status")).toHaveTextContent("Saved the phrase at 0:03");

    onEdit.mockClear();
    rowEl.focus();
    await user.keyboard("{F2}");
    await user.type(await screen.findByRole("textbox"), " extra");
    await user.keyboard("{Escape}");
    expect(onEdit).not.toHaveBeenCalled();
    expect(screen.queryByRole("textbox")).toBeNull();
    expect(screen.getByRole("status")).toHaveTextContent("Edit cancelled");
  });

  it("Ctrl+Enter saves from the box, and Enter on a word still plays from it", async () => {
    const user = userEvent.setup();
    const onEdit = vi.fn();
    const onSeek = vi.fn();
    renderWithStrata(<Host onEdit={onEdit} onSeek={onSeek} />);
    await user.click(within(row("p2")).getByRole("button", { name: "thank" }));
    within(row("p2")).getByRole("button", { name: "you" }).focus();
    await user.keyboard("{Enter}");
    expect(onSeek).toHaveBeenCalledTimes(2);
    expect(screen.queryByRole("textbox")).toBeNull();
    within(row("p2")).getByRole("button", { name: "you" }).focus();
    await user.keyboard("{F2}");
    const box = await screen.findByRole("textbox");
    await user.type(box, "!{Control>}{Enter}{/Control}");
    expect(onEdit).toHaveBeenCalledWith("p2", "thank you for coming!", { mode: "original" });
  });

  it("a read-only transcript (no onEdit) does not edit", async () => {
    const user = userEvent.setup();
    renderWithStrata(<Host />);
    row("p2").closest<HTMLElement>('[role="row"]')!.focus();
    await user.keyboard("{F2}");
    expect(screen.queryByRole("textbox")).toBeNull();
  });

  it("opens a card for the hovered phrase after the delay, only for that one, and Escape closes it", async () => {
    const user = userEvent.setup();
    const renderCard = vi.fn((p: { id: string; speaker?: string }) => <p>{`Card for ${p.id}, spoken by ${p.speaker}`}</p>);
    renderWithStrata(<Host renderCard={renderCard} cardDelay={0} />);
    expect(renderCard).not.toHaveBeenCalled();
    await user.hover(row("p2"));
    expect(await screen.findByText("Card for p2, spoken by Ben")).toBeInTheDocument();
    expect(renderCard.mock.calls.every(([p]) => p.id === "p2")).toBe(true); // never built for the rows not hovered
    await user.keyboard("{Escape}");
    await waitFor(() => expect(screen.queryByText(/Card for p2/)).toBeNull());
    await user.unhover(row("p2"));
    await user.hover(row("p3"));
    expect(await screen.findByText("Card for p3, spoken by Ada")).toBeInTheDocument();
  });

  it("opens the card on focus too, so the keyboard reaches it, and closes it on leaving", async () => {
    renderWithStrata(<Host renderCard={(p) => <p>{`Card for ${p.id}`}</p>} cardDelay={0} />);
    row("p1").closest<HTMLElement>('[role="row"]')!.focus();
    expect(await screen.findByText("Card for p1")).toBeInTheDocument();
    document.body.focus();
    (document.activeElement as HTMLElement | null)?.blur();
    await waitFor(() => expect(screen.queryByText("Card for p1")).toBeNull());
  });
});
