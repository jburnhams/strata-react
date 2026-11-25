import * as React from "react";
import { cn } from "../lib/utils";
import { format } from "../lib/format";
import type { Tone } from "./status";

// A hex dump for the file or message no other viewer understands (issue #360, from the Quake 2 explorer,
// whose hand-written `<pre>` stopped at 512 bytes because a longer file would draw thousands of rows).
// Any inspector of files or packets meets such a kind eventually: an archive browser, the network message
// inspector of a demo viewer, an upload debugger.
//
// - **Rows are windowed**, so a 50 MB file scrolls: only the rows in view (and a few either side) exist.
//   Rows are one fixed height, which lets the window be arithmetic instead of measuring. A browser caps an
//   element's height (about 17 million px in Firefox), and 50 MB is 3 million rows, so past 8 million px the
//   scroll bar is scaled: the position is a fraction of the file, not a pixel count, and the rows ride a
//   sticky layer so what is drawn is still exact. `VirtualList` (React Aria's `GridList` in a `Virtualizer`)
//   was considered first and does not fit: its rows are items with their own focus, and here the thing
//   that is focused and selected is a *byte*, not a row. React Aria has no cell-range selection (its table
//   selects rows), so the control is ours, with the pieces React Aria cannot give: one tab stop, byte
//   and range keyboard, and a status in words.
// - **Keyboard by byte, row and page**: Left and Right move one byte, Up and Down one row, PageUp and
//   PageDown a screen, Home and End the row's ends, Ctrl+Home and Ctrl+End the file's. Shift extends a
//   range from where it started; Escape collapses it to the byte. The pointer selects by press and drag,
//   and Shift+click extends.
// - **The range is reported**: `onSelectionChange({ start, end })`, `end` exclusive (the length is
//   `end - start`, and `bytes.slice(start, end)` is the selection), so an app can show "these 4 bytes as
//   int32 and float" beside it. Offsets are into `bytes`; `offset` shifts what is *shown* (a window into
//   a bigger file starting at 0x4000).
// - **Said in words.** The dump itself is drawn for the eye and hidden from assistive technology (a
//   screen reader reading 3 million cells is not help); the group's name says how many bytes, and a polite
//   status says where the cursor is ("Byte 0x1a2 of 4096: 4f, 79; 4 bytes selected, 0x1a2 to 0x1a5").
// - **Highlights** colour ranges by `Status` tones (a header, a field the app has decoded) and say nothing
//   by colour alone: the status line names the highlight the cursor is in, by its `label`.
// Monospace through `font-mono` and `tabular-nums`; the column header gives the offsets across.

/** A range of bytes the app has understood, drawn tinted; `end` is exclusive, `label` is what the status says of it. */
export type ByteHighlight = { start: number; end: number; tone?: Tone; label?: string };

/** The selected bytes: `start` to `end`, `end` exclusive. */
export type ByteRange = { start: number; end: number };

export type ByteViewProps = {
  bytes: Uint8Array;
  /** Names the dump: "pak0.pak, raw bytes". The byte count is added to it. */
  label: string;
  /** The address of `bytes[0]`, shown in the offsets column. Default 0. */
  offset?: number;
  /** Ranges to tint and name. */
  highlight?: readonly ByteHighlight[];
  /** The range chosen first. Default none until the person moves or presses. */
  defaultSelection?: ByteRange;
  /** The selected range changed (a press, a drag, a key). */
  onSelectionChange?: (range: ByteRange) => void;
  /** The height of the dump in px. Default 320. */
  height?: number;
  className?: string;
};

const PER_ROW = 16;
const ROW_PX = 20;
const OVERSCAN = 4;
const MAX_PX = 8_000_000; // under every browser's element height limit

const tints: Record<Tone, string> = {
  neutral: "bg-muted",
  info: "bg-info-subtle",
  success: "bg-success-subtle",
  warning: "bg-warning-subtle",
  danger: "bg-danger-subtle",
};

// Widths in characters of the monospace face, so columns line up whatever the face or density is.
const cellStyle = (k: number): React.CSSProperties => ({ width: "2ch", marginLeft: k === 8 ? "1ch" : undefined });
const hex = (n: number, width = 2) => n.toString(16).padStart(width, "0");
const tintOf = (h: ByteHighlight | undefined) => (h ? tints[h.tone ?? "neutral"] : undefined);
const printable = (b: number) => (b >= 0x20 && b < 0x7f ? String.fromCharCode(b) : "·");

/** A virtualised hex dump: offsets, sixteen bytes a row and the printable characters, byte and range keyboard, and the selected range reported as `{ start, end }`. */
export function ByteView({ bytes, label, offset = 0, highlight, defaultSelection, onSelectionChange, height = 320, className }: ByteViewProps) {
  const total = bytes.length;
  const rows = Math.ceil(total / PER_ROW);
  const visibleRows = Math.max(1, Math.floor(height / ROW_PX));
  const fullHeight = rows * ROW_PX;
  const scale = fullHeight > MAX_PX ? MAX_PX / fullHeight : 1;
  const pxPerRow = ROW_PX * scale;

  const scroller = React.useRef<HTMLDivElement>(null);
  const [scrollTop, setScrollTop] = React.useState(0);
  const first = Math.min(Math.max(0, rows - 1), Math.floor(scrollTop / pxPerRow));
  const fraction = scrollTop / pxPerRow - first; // how far into the first row the window is

  // The range is an anchor and a cursor: moving without Shift puts both on one byte.
  const [anchor, setAnchor] = React.useState<number | null>(defaultSelection ? defaultSelection.start : null);
  const [cursor, setCursor] = React.useState<number | null>(defaultSelection ? Math.max(defaultSelection.start, defaultSelection.end - 1) : null);
  const range: ByteRange | null = anchor === null || cursor === null ? null : { start: Math.min(anchor, cursor), end: Math.max(anchor, cursor) + 1 };
  const notify = React.useRef(onSelectionChange);
  notify.current = onSelectionChange;
  const select = (nextAnchor: number, nextCursor: number) => {
    setAnchor(nextAnchor);
    setCursor(nextCursor);
    notify.current?.({ start: Math.min(nextAnchor, nextCursor), end: Math.max(nextAnchor, nextCursor) + 1 });
  };

  const reveal = (index: number) => {
    const el = scroller.current;
    if (!el) return;
    const row = Math.floor(index / PER_ROW);
    const top = row * pxPerRow;
    const firstSeen = Math.ceil(el.scrollTop / pxPerRow);
    if (row < firstSeen) el.scrollTop = top;
    else if (row >= Math.floor(el.scrollTop / pxPerRow) + visibleRows) el.scrollTop = (row - visibleRows + 1) * pxPerRow;
    setScrollTop(el.scrollTop);
  };

  const move = (to: number, extend: boolean) => {
    if (total === 0) return;
    const index = Math.min(Math.max(0, to), total - 1);
    select(extend && anchor !== null ? anchor : index, index);
    reveal(index);
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (total === 0) return;
    const at = cursor ?? 0;
    const extend = e.shiftKey;
    const rowStart = Math.floor(at / PER_ROW) * PER_ROW;
    switch (e.key) {
      case "ArrowLeft": move(cursor === null ? 0 : at - 1, extend); break;
      case "ArrowRight": move(cursor === null ? 0 : at + 1, extend); break;
      case "ArrowUp": move(cursor === null ? 0 : at - PER_ROW, extend); break;
      case "ArrowDown": move(cursor === null ? 0 : at + PER_ROW, extend); break;
      case "PageUp": move(at - visibleRows * PER_ROW, extend); break;
      case "PageDown": move(at + visibleRows * PER_ROW, extend); break;
      case "Home": move(e.ctrlKey || e.metaKey ? 0 : rowStart, extend); break;
      case "End": move(e.ctrlKey || e.metaKey ? total - 1 : rowStart + PER_ROW - 1, extend); break;
      case "Escape":
        if (cursor === null || anchor === cursor) return;
        select(cursor, cursor);
        break;
      default:
        return;
    }
    e.preventDefault();
  };

  // Pointer: press chooses a byte, dragging across bytes extends, Shift+press extends from the anchor.
  const byteAt = (target: EventTarget | null) => {
    const cell = (target as HTMLElement | null)?.closest?.("[data-i]") as HTMLElement | null;
    return cell ? Number(cell.dataset.i) : null;
  };
  const onPointerDown = (e: React.PointerEvent) => {
    if (e.button !== 0) return;
    const i = byteAt(e.target);
    (e.currentTarget as HTMLElement).focus({ preventScroll: true });
    if (i === null) return;
    select(e.shiftKey && anchor !== null ? anchor : i, i);
  };
  const onPointerMove = (e: React.PointerEvent) => {
    if (!(e.buttons & 1) || anchor === null) return;
    const i = byteAt(e.target);
    if (i !== null && i !== cursor) select(anchor, i);
  };

  // The offsets column is as wide as the largest address, but never narrower than its own heading.
  const hexWidth = Math.max(6, hex(offset + Math.max(0, total - 1), 1).length);
  const marked = (i: number): ByteHighlight | undefined => highlight?.find((h) => i >= h.start && i < h.end);

  // What is said: where the cursor is, and what it is in.
  const said = (() => {
    if (cursor === null || range === null) return "";
    const b = bytes[cursor]!;
    const inside = marked(cursor)?.label;
    const count = range.end - range.start;
    const where = `Byte 0x${hex(offset + cursor, 1)} of ${format.integer(total)}: ${hex(b)}, ${b}`;
    const picked = count > 1 ? `; ${format.integer(count)} bytes selected, 0x${hex(offset + range.start, 1)} to 0x${hex(offset + range.end - 1, 1)}` : "";
    return `${where}${picked}${inside ? `; in ${inside}` : ""}`;
  })();

  const lastRow = Math.min(rows - 1, first + visibleRows + OVERSCAN);
  const drawn: number[] = [];
  for (let r = Math.max(0, first - OVERSCAN); r <= lastRow; r++) drawn.push(r);

  return (
    <div className={cn("grid min-w-0 gap-1", className)}>
      <div
        role="group"
        aria-label={`${label}, ${format.integer(total)} ${total === 1 ? "byte" : "bytes"}`}
        tabIndex={0}
        onKeyDown={onKeyDown}
        onFocus={(e) => {
          if (e.target === e.currentTarget && cursor === null && total > 0) select(0, 0);
        }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        className="min-w-0 overflow-x-auto rounded-control border border-border bg-surface-sunken font-mono type-body-sm tabular-nums outline-offset-2 select-none"
      >
        <div aria-hidden className="w-max min-w-full">
          <div className="flex h-5 items-center gap-3 border-b border-border px-3 text-muted-foreground">
            <span style={{ width: `${hexWidth}ch` }}>Offset</span>
            <span className="flex" style={{ columnGap: "1ch" }}>
              {Array.from({ length: PER_ROW }, (_, i) => (
                <span key={i} className="text-center" style={cellStyle(i)}>{hex(i)}</span>
              ))}
            </span>
            <span>Text</span>
          </div>
          <div ref={scroller} onScroll={(e) => setScrollTop(e.currentTarget.scrollTop)} className="overflow-y-auto" style={{ height }}>
            <div style={{ height: Math.max(rows * pxPerRow, visibleRows * ROW_PX) }} className="relative">
              <div className="sticky top-0 overflow-hidden" style={{ height }}>
                <div style={{ transform: `translateY(${-fraction * ROW_PX}px)` }}>
                  {drawn.map((r) => {
                    const base = r * PER_ROW;
                    const count = Math.min(PER_ROW, total - base);
                    return (
                      <div key={r} data-row={r} className="flex items-center gap-3 px-3" style={{ height: ROW_PX, position: "absolute", top: (r - first) * ROW_PX, left: 0, right: 0 }}>
                        <span className="text-muted-foreground" style={{ width: `${hexWidth}ch` }}>{hex(offset + base, hexWidth)}</span>
                        <span className="flex" style={{ columnGap: "1ch" }}>
                          {Array.from({ length: PER_ROW }, (_, k) => {
                            const i = base + k;
                            if (k >= count) return <span key={k} style={cellStyle(k)} />;
                            const inRange = range !== null && i >= range.start && i < range.end;
                            return (
                              <span
                                key={k}
                                data-i={i}
                                data-selected={inRange || undefined}
                                data-cursor={i === cursor || undefined}
                                style={cellStyle(k)}
                                className={cn("rounded-control text-center", inRange ? "bg-primary text-primary-foreground" : tintOf(marked(i)), i === cursor && "outline-2 outline-ring")}
                              >
                                {hex(bytes[i]!)}
                              </span>
                            );
                          })}
                        </span>
                        <span className="flex">
                          {Array.from({ length: count }, (_, k) => {
                            const i = base + k;
                            const inRange = range !== null && i >= range.start && i < range.end;
                            return (
                              <span key={k} data-i={i} style={{ width: "1ch" }} className={cn("text-center", inRange ? "bg-primary text-primary-foreground" : tintOf(marked(i)))}>
                                {printable(bytes[i]!)}
                              </span>
                            );
                          })}
                        </span>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
      <p role="status" className="type-caption text-muted-foreground tabular-nums">{total === 0 ? "No bytes." : said}</p>
    </div>
  );
}
