import { describe, expect, it, vi } from "vitest";
import { act, fireEvent, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Composer, Conversation, RichText, matchEntities, plainText, safeHref, type ConversationTurn } from "../../src";
import { renderWithStrata } from "../../src/testing";

const t0 = "2026-11-12T09:00:00Z";

describe("RichText and entity matching", () => {
  it("matches the longest id first and never inside a word", () => {
    const m = matchEntities("see f-0412-b, f-0412 and f-04123 or xf-0412.", ["f-0412", "f-0412-b"]);
    expect(m.map((x) => x.id)).toEqual(["f-0412-b", "f-0412"]);
  });

  it("accepts a matcher function", () => {
    const m = matchEntities("abc 12", (text) => [{ start: text.indexOf("12"), end: text.indexOf("12") + 2, id: "n12" }]);
    expect(m).toEqual([{ start: 4, end: 6, id: "n12" }]);
  });

  it("turns an id into a button that calls onOpen, inside bold and lists too", async () => {
    const onOpen = vi.fn();
    renderWithStrata(<RichText entities={["f-0412", "k-2"]} onOpen={onOpen}>{"Look at **firing f-0412** first.\n\n- kiln k-2 ran hot\n- nothing else"}</RichText>);
    await userEvent.click(screen.getByRole("button", { name: "f-0412" }));
    expect(onOpen).toHaveBeenCalledWith("f-0412");
    await userEvent.click(screen.getByRole("button", { name: "k-2" }));
    expect(onOpen).toHaveBeenLastCalledWith("k-2");
    expect(screen.getAllByRole("listitem")).toHaveLength(2);
    expect(screen.getByText(/firing/).tagName).toBe("STRONG");
  });

  it("never injects HTML and refuses unsafe link targets", () => {
    const { container } = renderWithStrata(<RichText>{'<img src=x onerror=alert(1)> <script>boom()</script> [bad](javascript:alert(1)) [good](https://example.com/a)'}</RichText>);
    expect(container.querySelector("img, script")).toBeNull();
    expect(container.textContent).toContain("<img src=x onerror=alert(1)>");
    expect(screen.queryByRole("link", { name: "bad" })).toBeNull();
    const good = screen.getByRole("link", { name: "good" });
    expect(good).toHaveAttribute("href", "https://example.com/a");
    expect(good).toHaveAttribute("rel", "noopener noreferrer");
    expect(safeHref("data:text/html,x")).toBeNull();
  });

  it("draws code, ordered lists and leaves unclosed marks as typed", () => {
    renderWithStrata(<RichText>{"Use `fire --slow` now **never\n\n1. one\n2. two"}</RichText>);
    expect(screen.getByText("fire --slow").tagName).toBe("CODE");
    expect(screen.getByText(/\*\*never/)).toBeInTheDocument();
    expect(screen.getByRole("list").tagName).toBe("OL");
    expect(plainText("**a** [b](https://x.y) `c`\n- d")).toBe("a b c d");
  });
});

function Thread({ turns, onRetry = () => {} }: { turns: ConversationTurn[]; onRetry?: (id: string) => void }) {
  return <Conversation label="Questions" turns={turns} answerName="Assistant" onRetry={onRetry} empty={<p>Ask anything.</p>} />;
}

describe("Conversation", () => {
  it("shows the empty invitation, then articles named by speaker and time", () => {
    const { rerender } = renderWithStrata(<Thread turns={[]} />);
    expect(screen.getByText("Ask anything.")).toBeInTheDocument();
    rerender(<Thread turns={[{ id: "1", role: "person", time: t0, text: "Which firing ran hot?" }, { id: "2", role: "answer", time: t0, text: "Firing **f-1**.", state: "done" }]} />);
    expect(screen.getAllByRole("article")).toHaveLength(2);
    expect(screen.getByRole("region", { name: "Questions" })).toBeInTheDocument();
  });

  it("announces a finished answer once and does not announce tokens while it streams", () => {
    const streaming: ConversationTurn = { id: "2", role: "answer", time: t0, text: "Fir", state: "streaming" };
    const { rerender } = renderWithStrata(<Thread turns={[streaming]} />);
    const live = screen.getByRole("status");
    expect(live).toHaveTextContent("");
    rerender(<Thread turns={[{ ...streaming, text: "Firing f-1 ran" }]} />);
    expect(live).toHaveTextContent("");
    expect(screen.getByRole("article")).toHaveAttribute("aria-busy", "true");
    rerender(<Thread turns={[{ id: "2", role: "answer", time: t0, text: "Firing **f-1** ran hot.", state: "done" }]} />);
    expect(live).toHaveTextContent("Assistant answered: Firing f-1 ran hot.");
  });

  it("puts Try again on the failed turn, in place, with the app's sentence", async () => {
    const onRetry = vi.fn();
    renderWithStrata(<Thread onRetry={onRetry} turns={[{ id: "9", role: "answer", time: t0, text: "", state: "failed", error: "The lookup timed out." }]} />);
    expect(screen.getByText("The lookup timed out.")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(onRetry).toHaveBeenCalledWith("9");
  });

  it("follows while at the bottom, stays put once scrolled up, and Jump to latest returns", () => {
    const geometry = { scrollHeight: 1000, clientHeight: 200 };
    Object.defineProperty(HTMLElement.prototype, "scrollHeight", { configurable: true, get: () => geometry.scrollHeight });
    Object.defineProperty(HTMLElement.prototype, "clientHeight", { configurable: true, get: () => geometry.clientHeight });
    try {
      const a: ConversationTurn = { id: "1", role: "answer", time: t0, text: "one", state: "streaming" };
      const { rerender } = renderWithStrata(<Thread turns={[a]} />);
      const box = screen.getByRole("region", { name: "Questions" });
      expect(box.scrollTop).toBe(1000);
      expect(screen.queryByRole("button", { name: "Jump to latest" })).toBeNull();

      box.scrollTop = 100;
      fireEvent.scroll(box);
      expect(screen.getByRole("button", { name: "Jump to latest" })).toBeInTheDocument();
      geometry.scrollHeight = 1400;
      rerender(<Thread turns={[{ ...a, text: "one two three" }]} />);
      expect(box.scrollTop).toBe(100);

      act(() => screen.getByRole("button", { name: "Jump to latest" }).click());
      expect(box.scrollTop).toBe(1400);
      expect(screen.queryByRole("button", { name: "Jump to latest" })).toBeNull();
      geometry.scrollHeight = 1800;
      rerender(<Thread turns={[{ ...a, text: "one two three four" }]} />);
      expect(box.scrollTop).toBe(1800);

      box.scrollTop = 50;
      fireEvent.scroll(box);
      geometry.scrollHeight = 2200;
      rerender(<Thread turns={[{ ...a, text: "x", state: "done" }, { id: "2", role: "person", time: t0, text: "next" }]} />);
      expect(box.scrollTop).toBe(2200);
    } finally {
      delete (HTMLElement.prototype as unknown as Record<string, unknown>).scrollHeight;
      delete (HTMLElement.prototype as unknown as Record<string, unknown>).clientHeight;
    }
  });

  it("shows what it looked up behind a disclosure once the answer is done", async () => {
    renderWithStrata(<Thread turns={[{ id: "1", role: "answer", time: t0, text: "Done.", state: "done", lookedUp: <p>Read 3 firings</p> }]} />);
    expect(screen.queryByText("Read 3 firings")).toBeNull();
    await userEvent.click(screen.getByRole("button", { name: "What it looked up" }));
    expect(screen.getByText("Read 3 firings")).toBeInTheDocument();
  });
});

describe("Composer", () => {
  const base = { label: "Ask about the kiln", onStop: () => {}, answeringReason: "Waiting for the answer." };

  it("sends on Enter, keeps Shift+Enter as a new line, ignores empty and IME input", async () => {
    const onSend = vi.fn();
    renderWithStrata(<Composer {...base} onSend={onSend} />);
    const box = screen.getByRole("textbox", { name: "Ask about the kiln" });
    expect(screen.getByRole("button", { name: "Send" })).toBeDisabled();
    await userEvent.type(box, "line one{Shift>}{Enter}{/Shift}line two");
    expect(onSend).not.toHaveBeenCalled();
    expect(box).toHaveValue("line one\nline two");
    fireEvent.keyDown(box, { key: "Enter", isComposing: true });
    expect(onSend).not.toHaveBeenCalled();
    await userEvent.type(box, "{Enter}");
    expect(onSend).toHaveBeenCalledWith("line one\nline two");
    expect(box).toHaveValue("");
    await userEvent.type(box, "   {Enter}");
    expect(onSend).toHaveBeenCalledTimes(1);
  });

  it("is disabled with its reason while answering, and Stop replaces Send", async () => {
    const onStop = vi.fn();
    renderWithStrata(<Composer {...base} onStop={onStop} onSend={() => {}} answering suggestions={["Which ran hot?"]} />);
    const box = screen.getByRole("textbox", { name: "Ask about the kiln" });
    expect(box).toBeDisabled();
    expect(box).toHaveAccessibleDescription("Waiting for the answer.");
    expect(screen.queryByRole("button", { name: "Send" })).toBeNull();
    expect(screen.queryByRole("group", { name: "Suggested questions" })).toBeNull();
    await userEvent.click(screen.getByRole("button", { name: "Stop" }));
    expect(onStop).toHaveBeenCalled();
  });

  it("sends a suggested question as a button, and Send is the one filled button", async () => {
    const onSend = vi.fn();
    renderWithStrata(<Composer {...base} onSend={onSend} suggestions={["Which ran hot?", "What is next?"]} />);
    await userEvent.click(within(screen.getByRole("group", { name: "Suggested questions" })).getByRole("button", { name: "What is next?" }));
    expect(onSend).toHaveBeenCalledWith("What is next?");
    expect(document.querySelectorAll('[data-variant="default"]')).toHaveLength(1);
  });
});
