import { describe, expect, it, vi } from "vite-plus/test";
import * as React from "react";
import { fireEvent, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { PlaceBoard, type PlaceState } from "../../src";
import { renderWithStrata } from "../../src/testing";

// Pictures put into places with two taps (Flashtap's give-N, order, match and sort rounds).

type Piece = { id: string; picture: string; word: string };
type Place = { id: string; name: string };
const numbers: Piece[] = [5, 2, 9].map((n) => ({
  id: `n${n}`,
  picture: String(n),
  word: String(n),
}));
const slots: Place[] = [
  { id: "first", name: "first" },
  { id: "second", name: "second" },
  { id: "third", name: "third" },
];
const marks = { held: "Picked up", right: "Right", wrong: "Not yet" };

// The app's side: it keeps the placement, applies moves, and checks.
function Order({
  onMove = () => {},
  initial = {},
  states = {},
  locked,
  beckon,
  stretch,
  check,
  limit,
}: {
  limit?: number;
  check?: { label: string; onCheck: () => void; disabled?: boolean };
  stretch?: boolean;
  onMove?: (piece: string, place: string | null) => void;
  initial?: Record<string, string>;
  states?: Record<string, PlaceState>;
  locked?: boolean;
  beckon?: boolean;
}) {
  const [placement, setPlacement] = React.useState<Record<string, string | undefined>>(initial);
  return (
    <PlaceBoard
      label="Put the numbers in order"
      pieces={numbers}
      pieceKey={(p) => p.id}
      pieceLabel={(p) => p.word}
      renderPiece={(p) => p.picture}
      places={slots}
      placeKey={(s) => s.id}
      placeLabel={(s) => s.name}
      placement={placement}
      onMove={(piece, place) => {
        onMove(piece, place);
        setPlacement((m) => ({ ...m, [piece]: place ?? undefined }));
      }}
      pileLabel="Numbers"
      placeState={(s) => states[s.id] ?? "open"}
      marks={marks}
      locked={locked}
      beckon={beckon}
      beckonMs={100}
      stretch={stretch}
      check={check}
      limit={limit === undefined ? undefined : () => limit}
    />
  );
}

const apples = [0, 1, 2].map((i) => ({ id: `a${i}` }));
// One place: a tap puts an apple in, a tap on one in the basket takes it out.
function Basket({
  onMove = () => {},
  initial = {},
}: {
  onMove?: (piece: string, place: string | null) => void;
  initial?: Record<string, string>;
}) {
  const [placement, setPlacement] = React.useState<Record<string, string | undefined>>(initial);
  return (
    <PlaceBoard
      label="Put 2 apples in the basket"
      pieces={apples}
      pieceKey={(p) => p.id}
      pieceLabel={() => "apple"}
      renderPiece={() => "🍎"}
      places={[{ id: "basket" }]}
      placeKey={(s) => s.id}
      placeLabel={() => "the basket"}
      placement={placement}
      onMove={(piece, place) => {
        onMove(piece, place);
        setPlacement((m) => ({ ...m, [piece]: place ?? undefined }));
      }}
      pileLabel="Apples"
      marks={marks}
    />
  );
}

// jsdom lays nothing out, so a drop zone's rectangle is given by hand, as a browser would measure it.
const at = (el: Element, left: number, top: number, side = 100) => {
  el.getBoundingClientRect = () =>
    ({
      left,
      top,
      right: left + side,
      bottom: top + side,
      width: side,
      height: side,
      x: left,
      y: top,
      toJSON: () => ({}),
    }) as DOMRect;
};
const dragTo = (from: Element, x: number, y: number) => {
  fireEvent.pointerDown(from, { pointerId: 1, isPrimary: true, button: 0, clientX: 5, clientY: 5 });
  fireEvent.pointerMove(window, { pointerId: 1, clientX: 30, clientY: 30 });
  fireEvent.pointerMove(window, { pointerId: 1, clientX: x, clientY: y });
};
const drop = (x: number, y: number) => fireEvent.pointerUp(window, { pointerId: 1, clientX: x, clientY: y });

const board = () => screen.getByRole("region", { name: "Put the numbers in order" });
const pile = () => within(board()).getByRole("group", { name: "Numbers" });
const piece = (name: string | RegExp) => within(board()).getByRole("button", { name });
const place = (name: string | RegExp) => within(board()).getByRole("button", { name });

describe("PlaceBoard", () => {
  it("is a named region with the pieces in a named pile and the places waiting, disabled until a piece is picked up", () => {
    renderWithStrata(<Order />);
    expect(within(pile()).getAllByRole("button")).toHaveLength(3);
    expect(piece("5")).toHaveAttribute("aria-pressed", "false");
    expect(piece("5")).toHaveTextContent("5");
    expect(place("first")).toBeDisabled();
  });

  it("picks a piece up with one tap and puts it in a place with another, naming the move", async () => {
    const user = userEvent.setup();
    const onMove = vi.fn();
    renderWithStrata(<Order onMove={onMove} />);
    await user.click(piece("2"));
    expect(piece("2, picked up")).toHaveAttribute("aria-pressed", "true");
    expect(piece("2, picked up")).toHaveTextContent("Picked up");
    await user.click(place("Put 2 in first"));
    expect(onMove).toHaveBeenCalledWith("n2", "first");
    expect(within(board()).getByRole("group", { name: "In first" })).toHaveTextContent("2");
    expect(within(pile()).getAllByRole("button")).toHaveLength(2);
    // Focus followed the piece to its place; nothing is held, so the places are closed again.
    expect(piece("2")).toHaveFocus();
    expect(place("second")).toBeDisabled();
  });

  it("puts a piece down again when it is tapped a second time", async () => {
    const user = userEvent.setup();
    const onMove = vi.fn();
    renderWithStrata(<Order onMove={onMove} />);
    await user.click(piece("9"));
    await user.click(piece("9, picked up"));
    expect(piece("9")).toHaveAttribute("aria-pressed", "false");
    expect(place("first")).toBeDisabled();
    expect(onMove).not.toHaveBeenCalled();
  });

  it("holds one piece at a time: picking up another puts the first down", async () => {
    const user = userEvent.setup();
    renderWithStrata(<Order />);
    await user.click(piece("9"));
    await user.click(piece("5"));
    expect(piece("9")).toHaveAttribute("aria-pressed", "false");
    expect(place("Put 5 in first")).toBeEnabled();
  });

  it("moves a placed piece to another place, or back to the pile", async () => {
    const user = userEvent.setup();
    const onMove = vi.fn();
    renderWithStrata(<Order onMove={onMove} initial={{ n5: "first" }} />);
    await user.click(piece("5"));
    // The place it is in does not take it again; the others do, and so does the pile.
    expect(place("first")).toBeDisabled();
    await user.click(place("Put 5 in third"));
    expect(onMove).toHaveBeenLastCalledWith("n5", "third");
    await user.click(piece("5"));
    await user.click(screen.getByRole("button", { name: "Put 5 back" }));
    expect(onMove).toHaveBeenLastCalledWith("n5", null);
    expect(within(pile()).getAllByRole("button")).toHaveLength(3);
    expect(screen.queryByRole("button", { name: /back$/ })).toBeNull();
  });

  it("offers no Put back for a piece still in the pile", async () => {
    const user = userEvent.setup();
    renderWithStrata(<Order />);
    await user.click(piece("5"));
    expect(screen.queryByRole("button", { name: "Put 5 back" })).toBeNull();
  });

  it("works from the keyboard: Tab to a piece, Space picks it up, Tab to a place, Enter puts it there", async () => {
    const user = userEvent.setup();
    const onMove = vi.fn();
    renderWithStrata(<Order onMove={onMove} />);
    await user.tab();
    expect(piece("5")).toHaveFocus();
    await user.keyboard(" ");
    await user.tab(); // 2
    await user.tab(); // 9
    await user.tab(); // first, now that something is held
    expect(place("Put 5 in first")).toHaveFocus();
    await user.keyboard("{Enter}");
    expect(onMove).toHaveBeenCalledWith("n5", "first");
  });

  it("marks checked places with their word, and a locked board moves nothing", async () => {
    const user = userEvent.setup();
    const onMove = vi.fn();
    renderWithStrata(
      <Order
        onMove={onMove}
        initial={{ n2: "first", n9: "second" }}
        states={{ first: "right", second: "wrong" }}
        locked
      />,
    );
    // The checked word is in each place's name, not only drawn inside it.
    expect(place("first, right")).toHaveTextContent("Right");
    expect(place("second, not yet")).toHaveTextContent("Not yet");
    expect(place("third")).not.toHaveTextContent(/Right|Not yet/);
    expect(piece("5")).toBeDisabled();
    await user.click(piece("5"));
    expect(onMove).not.toHaveBeenCalled();
  });

  it("names the move and the checked word together while a piece is held", async () => {
    const user = userEvent.setup();
    renderWithStrata(<Order initial={{ n9: "second" }} states={{ second: "wrong" }} />);
    await user.click(piece("5"));
    expect(place("Put 5 in second, not yet")).toBeEnabled();
  });

  it("shows a piece placed in a place it does not list in the pile, and draws a place's own picture", () => {
    renderWithStrata(
      <PlaceBoard
        label="Put 2 apples in the basket"
        pieces={[{ id: "a1" }, { id: "a2" }]}
        pieceKey={(p) => p.id}
        pieceLabel={() => "apple"}
        renderPiece={() => "🍎"}
        places={[{ id: "basket" }]}
        placeKey={(s) => s.id}
        placeLabel={() => "the basket"}
        renderPlace={() => "🧺"}
        placement={{ a1: "gone" }}
        onMove={() => {}}
        pileLabel="Apples"
        marks={marks}
      />,
    );
    expect(within(screen.getByRole("group", { name: "Apples" })).getAllByRole("button")).toHaveLength(2);
    expect(screen.getByRole("button", { name: "the basket" })).toHaveTextContent("🧺");
  });

  it("beckons the pieces in the pile one at a time, never while one is held, a placed one or a locked board", async () => {
    const user = userEvent.setup();
    const lit = () => board().querySelectorAll("[data-beckon]");
    const { unmount } = renderWithStrata(<Order beckon initial={{ n2: "first" }} />);
    await vi.waitFor(() => expect(lit()).toHaveLength(1));
    expect(within(pile()).getAllByRole("button")).toContain(lit()[0]); // the pile, not the placed 1
    expect(lit()[0]?.className).toMatch(/\bbeckon(-again)?\b/);
    await user.click(within(pile()).getAllByRole("button")[0] as HTMLElement);
    expect(lit()).toHaveLength(0);
    await new Promise((r) => setTimeout(r, 250));
    expect(lit()).toHaveLength(0);
    unmount();
    renderWithStrata(<Order beckon locked />);
    await new Promise((r) => setTimeout(r, 250));
    expect(lit()).toHaveLength(0);
  });

  it("stretches the pile and the places to share their rows only when asked, never the pieces in a place", () => {
    const cols = (el: Element | null | undefined) => (el as HTMLElement | null)?.style.gridTemplateColumns ?? "";
    const { unmount } = renderWithStrata(<Order initial={{ n2: "first" }} />);
    expect(cols(pile())).toContain("auto-fill");
    unmount();
    renderWithStrata(<Order stretch initial={{ n2: "first" }} />);
    expect(cols(pile())).toContain("auto-fit");
    expect(cols(board().querySelector("[data-place]")?.parentElement)).toContain("auto-fit");
    expect(cols(board().querySelector('[aria-label="In first"]'))).toContain("auto-fill");
  });

  it("caps each picture at its tile, so a large picture step cannot push it out", () => {
    renderWithStrata(<Order initial={{ n2: "first" }} />);
    for (const span of board().querySelectorAll("[aria-pressed] > span[aria-hidden]"))
      expect((span as HTMLElement).style.fontSize).toContain("75cqi");
  });

  it("keeps a slot for every piece in the pile: a placed piece leaves a gap of its size, in its place in the order", () => {
    renderWithStrata(<Order initial={{ n2: "first" }} />);
    const slots = [...pile().children];
    expect(slots).toHaveLength(3);
    expect(slots[1]).toHaveAttribute("data-gap");
    expect(slots[1]).toHaveAttribute("aria-hidden", "true");
    expect(slots[0]).toHaveTextContent("5");
    expect(slots[2]).toHaveTextContent("9");
  });

  it("puts a held placed piece back through its gap, which is outlined like the places that take it", async () => {
    const user = userEvent.setup();
    const onMove = vi.fn();
    renderWithStrata(<Order onMove={onMove} initial={{ n2: "first" }} />);
    await user.click(piece("2"));
    const back = within(pile()).getByRole("button", { name: "Put 2 back" });
    expect(back.className).toMatch(/\bring-info\b/);
    expect(place("Put 2 in second").closest("[data-place]")?.className).toMatch(/\bring-info\b/);
    expect(piece("2, picked up").className).toMatch(/selected:ring-info/);
    await user.click(back);
    expect(onMove).toHaveBeenLastCalledWith("n2", null);
    expect(pile().children[1]).not.toHaveAttribute("data-gap");
  });

  it("keeps room for a row of placed pieces in every place, filled or not", () => {
    renderWithStrata(<Order initial={{ n2: "first" }} />);
    for (const p of board().querySelectorAll("[data-place]"))
      expect(p.lastElementChild?.className).toMatch(/\bmin-h-18\b/);
    expect(within(board()).getAllByRole("group", { name: /^In / })).toHaveLength(1);
  });

  it("with one place, a tap puts a piece in and a tap on a placed one takes it out, each named for what it does", async () => {
    const user = userEvent.setup();
    const onMove = vi.fn();
    renderWithStrata(<Basket onMove={onMove} />);
    const ins = within(screen.getByRole("group", { name: "Apples" })).getAllByRole("button", {
      name: "Put apple in the basket",
    });
    expect(ins).toHaveLength(3);
    expect(ins[0]).not.toHaveAttribute("aria-pressed");
    await user.click(ins[1] as HTMLElement);
    expect(onMove).toHaveBeenLastCalledWith("a1", "basket");
    const out = within(screen.getByRole("group", { name: "In the basket" })).getByRole("button", {
      name: "Take apple out of the basket",
    });
    expect(out).toHaveFocus(); // focus followed it in
    expect(out.querySelector("[data-remove]")).toHaveAttribute("aria-hidden", "true"); // the big X, drawn on hover
    expect(screen.getByRole("button", { name: "the basket" })).toBeDisabled();
    await user.click(out);
    expect(onMove).toHaveBeenLastCalledWith("a1", null);
    expect(screen.getByRole("group", { name: "Apples" }).querySelectorAll("[data-gap]")).toHaveLength(0);
  });

  it("drags a piece to a place: it is held and the places outlined while it moves, and let go it moves there", () => {
    const onMove = vi.fn();
    renderWithStrata(<Order onMove={onMove} />);
    const [first, second] = [...board().querySelectorAll("[data-place]")] as HTMLElement[];
    at(first as HTMLElement, 0, 300);
    at(second as HTMLElement, 200, 300);
    at(pile(), 0, 0, 150);
    dragTo(piece("9"), 250, 350);
    expect(piece("9, picked up")).toHaveAttribute("aria-pressed", "true");
    expect(document.querySelector("[data-dragging]")).toHaveTextContent("9");
    expect(second?.className).toMatch(/\bbg-info-subtle\b/); // the place under it
    expect(first?.className).not.toMatch(/\bbg-info-subtle\b/);
    drop(250, 350);
    expect(onMove).toHaveBeenCalledWith("n9", "second");
    expect(document.querySelector("[data-dragging]")).toBeNull();
    expect(within(board()).getByRole("group", { name: "In second" })).toHaveTextContent("9");
  });

  it("drags a placed piece back to the pile, and a drag let go over nowhere moves nothing", () => {
    const onMove = vi.fn();
    renderWithStrata(<Order onMove={onMove} initial={{ n5: "first" }} />);
    at(pile(), 0, 0, 150);
    dragTo(piece("5"), 50, 50);
    drop(50, 50);
    expect(onMove).toHaveBeenLastCalledWith("n5", null);
    onMove.mockClear();
    dragTo(piece("2"), 900, 900);
    drop(900, 900);
    expect(onMove).not.toHaveBeenCalled();
    expect(piece("2")).toHaveAttribute("aria-pressed", "false");
  });

  it("drags into the one place too, and a press that hardly moves is still a tap", async () => {
    const onMove = vi.fn();
    renderWithStrata(<Basket onMove={onMove} />);
    at(document.querySelector("[data-place]") as HTMLElement, 0, 300, 200);
    const first = within(screen.getByRole("group", { name: "Apples" })).getAllByRole("button")[0] as HTMLElement;
    fireEvent.pointerDown(first, { pointerId: 1, isPrimary: true, button: 0, clientX: 5, clientY: 5 });
    fireEvent.pointerMove(window, { pointerId: 1, clientX: 8, clientY: 7 });
    expect(document.querySelector("[data-dragging]")).toBeNull();
    fireEvent.pointerUp(window, { pointerId: 1, clientX: 8, clientY: 7 });
    dragTo(first, 100, 400);
    drop(100, 400);
    expect(onMove).toHaveBeenCalledWith("a0", "basket");
  });

  it("drops a drag that is cancelled, and starts none on a locked board", () => {
    const onMove = vi.fn();
    const { unmount } = renderWithStrata(<Order onMove={onMove} />);
    at(board().querySelector("[data-place]") as HTMLElement, 0, 300);
    dragTo(piece("5"), 50, 350);
    fireEvent.pointerCancel(window, { pointerId: 1 });
    expect(onMove).not.toHaveBeenCalled();
    expect(document.querySelector("[data-dragging]")).toBeNull();
    unmount();
    renderWithStrata(<Order onMove={onMove} locked />);
    dragTo(piece("5"), 50, 350);
    expect(document.querySelector("[data-dragging]")).toBeNull();
  });

  it("draws the app's check as one big filled button with a tick either side, gone once locked", async () => {
    const user = userEvent.setup();
    const onCheck = vi.fn();
    const { unmount } = renderWithStrata(<Order check={{ label: "Check", onCheck }} />);
    const button = screen.getByRole("button", { name: "Check" });
    expect(button).toHaveAttribute("data-variant", "default");
    expect(button.className).toMatch(/h-\(--control-h-lg\)/);
    expect(button.querySelectorAll("svg[aria-hidden]")).toHaveLength(2);
    await user.click(button);
    expect(onCheck).toHaveBeenCalledTimes(1);
    unmount();
    const again = renderWithStrata(<Order check={{ label: "Check", onCheck, disabled: true }} />);
    expect(screen.getByRole("button", { name: "Check" })).toBeDisabled();
    again.unmount();
    renderWithStrata(<Order check={{ label: "Check", onCheck }} locked />);
    expect(screen.queryByRole("button", { name: "Check" })).toBeNull();
  });

  it("puts a piece on top of another in a full place, sending that one back to the pile, by tap or by drag", async () => {
    const user = userEvent.setup();
    const onMove = vi.fn();
    renderWithStrata(<Order onMove={onMove} limit={1} initial={{ n5: "first", n2: "second" }} />);
    await user.click(piece("9"));
    await user.click(place("Put 9 in first in place of 5"));
    expect(onMove.mock.calls).toEqual([
      ["n5", null],
      ["n9", "first"],
    ]);
    expect(within(board()).getByRole("group", { name: "In first" })).toHaveTextContent("9");
    expect(within(pile()).getByRole("button", { name: "5" })).toBeInTheDocument();
    // An empty place is named as before; a place's own piece moving within it bumps nothing.
    await user.click(piece("9"));
    expect(place("Put 9 in third")).toBeEnabled();
    onMove.mockClear();
    at(board().querySelectorAll("[data-place]")[1] as HTMLElement, 200, 300);
    dragTo(piece("9, picked up"), 250, 350);
    drop(250, 350);
    expect(onMove.mock.calls).toEqual([
      ["n2", null],
      ["n9", "second"],
    ]);
  });

  it("fills a place without a limit with as many as are put there", async () => {
    const user = userEvent.setup();
    const onMove = vi.fn();
    renderWithStrata(<Order onMove={onMove} initial={{ n5: "first" }} />);
    await user.click(piece("9"));
    await user.click(place("Put 9 in first"));
    expect(onMove.mock.calls).toEqual([["n9", "first"]]);
  });

  it("lets go of a drag when the board locks, so taps work again once it unlocks (Codex on #409)", async () => {
    const user = userEvent.setup();
    const onMove = vi.fn();
    const { rerender } = renderWithStrata(<Order onMove={onMove} />);
    dragTo(piece("5"), 50, 350);
    rerender(<Order onMove={onMove} locked />);
    expect(document.querySelector("[data-dragging]")).toBeNull();
    drop(50, 350);
    rerender(<Order onMove={onMove} />);
    await user.click(piece("2"));
    expect(piece("2, picked up")).toHaveAttribute("aria-pressed", "true");
  });
});
