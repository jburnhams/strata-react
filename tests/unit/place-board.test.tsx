import { describe, expect, it, vi } from "vite-plus/test";
import * as React from "react";
import { screen, within } from "@testing-library/react";
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
}: {
  onMove?: (piece: string, place: string | null) => void;
  initial?: Record<string, string>;
  states?: Record<string, PlaceState>;
  locked?: boolean;
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
    />
  );
}

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
});
