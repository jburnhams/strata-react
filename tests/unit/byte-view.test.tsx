import { describe, expect, it, vi } from "vitest";
import { fireEvent, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ByteView } from "../../src";
import { renderWithStrata } from "../../src/testing";

// Issue #360: a windowed hex dump with byte and range keyboard and the range reported.

const bytes = (n: number) => Uint8Array.from({ length: n }, (_, i) => i % 256);
const group = () => screen.getByRole("group", { name: /bytes?$/ });
const cell = (i: number) => document.querySelector(`[data-i="${i}"]`) as HTMLElement;

describe("ByteView", () => {
  it("is named with its label and byte count, and draws offsets, hex and printable characters", () => {
    renderWithStrata(<ByteView bytes={new TextEncoder().encode("IDPAK\0\0\0")} label="pak0.pak" />);
    expect(screen.getByRole("group", { name: "pak0.pak, 8 bytes" })).toBeInTheDocument();
    const text = document.body.textContent!;
    expect(text).toContain("494450414b"); // I D P A K
    expect(text).toContain("IDPAK···");
  });

  it("shows the offset the buffer starts at", () => {
    renderWithStrata(<ByteView bytes={bytes(20)} label="part" offset={0x4000} />);
    expect(document.body.textContent).toContain("4000");
    expect(document.body.textContent).toContain("4010");
  });

  it("draws only the rows in view, so a 50 MB file is not 3 million rows", () => {
    renderWithStrata(<ByteView bytes={bytes(50 * 1024 * 1024)} label="big" height={200} />);
    expect(document.querySelectorAll("[data-row]").length).toBeLessThan(30);
    expect(screen.getByRole("group", { name: "big, 52,428,800 bytes" })).toBeInTheDocument();
  });

  it("moves by byte, row and page from the keyboard, and says where it is", async () => {
    const onSelectionChange = vi.fn();
    renderWithStrata(<ByteView bytes={bytes(512)} label="file" height={100} onSelectionChange={onSelectionChange} />);
    await userEvent.tab();
    expect(group()).toHaveFocus();
    expect(onSelectionChange).toHaveBeenLastCalledWith({ start: 0, end: 1 });
    await userEvent.keyboard("{ArrowRight}{ArrowRight}");
    expect(onSelectionChange).toHaveBeenLastCalledWith({ start: 2, end: 3 });
    expect(screen.getByRole("status")).toHaveTextContent("Byte 0x2 of 512: 02, 2");
    await userEvent.keyboard("{ArrowDown}");
    expect(onSelectionChange).toHaveBeenLastCalledWith({ start: 18, end: 19 });
    await userEvent.keyboard("{ArrowLeft}");
    expect(onSelectionChange).toHaveBeenLastCalledWith({ start: 17, end: 18 });
    await userEvent.keyboard("{PageDown}"); // 100px / 20px = 5 rows of 16
    expect(onSelectionChange).toHaveBeenLastCalledWith({ start: 97, end: 98 });
    await userEvent.keyboard("{End}");
    expect(onSelectionChange).toHaveBeenLastCalledWith({ start: 111, end: 112 });
    await userEvent.keyboard("{Home}");
    expect(onSelectionChange).toHaveBeenLastCalledWith({ start: 96, end: 97 });
    await userEvent.keyboard("{Control>}{End}{/Control}");
    expect(onSelectionChange).toHaveBeenLastCalledWith({ start: 511, end: 512 });
    await userEvent.keyboard("{Control>}{Home}{/Control}");
    expect(onSelectionChange).toHaveBeenLastCalledWith({ start: 0, end: 1 });
  });

  it("stays inside the file", async () => {
    const onSelectionChange = vi.fn();
    renderWithStrata(<ByteView bytes={bytes(3)} label="tiny" onSelectionChange={onSelectionChange} />);
    await userEvent.tab();
    await userEvent.keyboard("{ArrowLeft}{ArrowUp}");
    expect(onSelectionChange).toHaveBeenLastCalledWith({ start: 0, end: 1 });
    await userEvent.keyboard("{ArrowRight}{ArrowRight}{ArrowRight}{ArrowRight}");
    expect(onSelectionChange).toHaveBeenLastCalledWith({ start: 2, end: 3 });
  });

  it("extends a range with Shift and collapses it with Escape", async () => {
    const onSelectionChange = vi.fn();
    renderWithStrata(<ByteView bytes={bytes(64)} label="file" onSelectionChange={onSelectionChange} />);
    await userEvent.tab();
    await userEvent.keyboard("{ArrowRight}{Shift>}{ArrowRight}{ArrowRight}{ArrowRight}{/Shift}");
    expect(onSelectionChange).toHaveBeenLastCalledWith({ start: 1, end: 5 });
    expect(screen.getByRole("status")).toHaveTextContent("4 bytes selected, 0x1 to 0x4");
    await userEvent.keyboard("{Shift>}{ArrowLeft}{ArrowLeft}{ArrowLeft}{ArrowLeft}{/Shift}");
    expect(onSelectionChange).toHaveBeenLastCalledWith({ start: 0, end: 2 });
    await userEvent.keyboard("{Escape}");
    expect(onSelectionChange).toHaveBeenLastCalledWith({ start: 0, end: 1 });
  });

  it("selects with the pointer: press, drag across bytes, and Shift+press", () => {
    const onSelectionChange = vi.fn();
    renderWithStrata(<ByteView bytes={bytes(64)} label="file" onSelectionChange={onSelectionChange} />);
    fireEvent.pointerDown(cell(2), { button: 0, buttons: 1 });
    expect(onSelectionChange).toHaveBeenLastCalledWith({ start: 2, end: 3 });
    fireEvent.pointerMove(cell(5), { buttons: 1 });
    expect(onSelectionChange).toHaveBeenLastCalledWith({ start: 2, end: 6 });
    fireEvent.pointerMove(cell(9), { buttons: 0 }); // not pressed: no change
    expect(onSelectionChange).toHaveBeenLastCalledWith({ start: 2, end: 6 });
    fireEvent.pointerDown(cell(20), { button: 0, buttons: 1, shiftKey: true });
    expect(onSelectionChange).toHaveBeenLastCalledWith({ start: 2, end: 21 });
    expect(cell(3)).toHaveAttribute("data-selected");
  });

  it("starts with a chosen range", () => {
    renderWithStrata(<ByteView bytes={bytes(64)} label="file" defaultSelection={{ start: 4, end: 8 }} />);
    expect(cell(4)).toHaveAttribute("data-selected");
    expect(cell(7)).toHaveAttribute("data-selected");
    expect(cell(8)).not.toHaveAttribute("data-selected");
  });

  it("names the highlight the cursor is in, in words", async () => {
    renderWithStrata(<ByteView bytes={bytes(64)} label="file" highlight={[{ start: 4, end: 8, tone: "info", label: "version field" }]} defaultSelection={{ start: 5, end: 6 }} />);
    expect(screen.getByRole("status")).toHaveTextContent("in version field");
  });

  it("says when there is nothing to show", () => {
    renderWithStrata(<ByteView bytes={new Uint8Array()} label="empty" />);
    expect(screen.getByRole("status")).toHaveTextContent("No bytes.");
  });
});

describe("ByteView edge cases", () => {
  it("survives a shorter buffer after a byte past its end was chosen", async () => {
    const { rerender } = renderWithStrata(<ByteView bytes={bytes(512)} label="file" defaultSelection={{ start: 400, end: 401 }} />);
    rerender(<ByteView bytes={bytes(16)} label="file" />);
    expect(screen.getByRole("status")).toHaveTextContent("Byte 0xf of 16");
    rerender(<ByteView bytes={new Uint8Array()} label="file" />);
    expect(screen.getByRole("status")).toHaveTextContent("No bytes.");
  });

  it("reaches the last byte of a file too big for one element (Ctrl+End)", async () => {
    const onSelectionChange = vi.fn();
    renderWithStrata(<ByteView bytes={bytes(50 * 1024 * 1024)} label="big" height={200} onSelectionChange={onSelectionChange} />);
    await userEvent.tab();
    await userEvent.keyboard("{Control>}{End}{/Control}");
    const last = 50 * 1024 * 1024 - 1;
    expect(onSelectionChange).toHaveBeenLastCalledWith({ start: last, end: last + 1 });
    expect(document.querySelector(`[data-i="${last}"]`)).not.toBeNull();
  });
});
