import * as React from "react";
import { Ban, GripVertical } from "lucide-react";
import { Button as AriaButton, DropIndicator, GridList, GridListItem, useDragAndDrop } from "react-aria-components";
import { cn } from "../lib/utils";

// A list whose items can be reordered and moved to other lists (strata issue #76, from a video
// editor's tracks and library). One component for both because they are one gesture: pick an item
// up, see where it will land, drop or cancel.
//
// React Aria first, and this is a case where it is the whole answer, so nothing else is added
// (`@dnd-kit`, which the app being moved used, is not needed). `GridList` with `useDragAndDrop` gives:
// the keyboard path (focus the grip, Enter picks up, arrows move between positions and between
// lists that accept the item, Enter drops, Escape cancels, the item goes back), screen-reader
// announcements at each step (React Aria's own words, localised; they name the item by `getLabel`),
// a drop indicator line between rows, auto-scroll near a scroll container's edge, and a drag
// preview. Checked in `useDragAndDrop.d.ts` and `GridList.d.ts`: `renderEmptyState` receives
// `isDropTarget`, so an empty list can say "Drop here". What it cannot do is say WHY a target
// refuses (a refusing target is simply not a target), so we read the dragged kinds in
// `getDropOperation` and show the reason in the list, with an icon and words, never colour alone.
//
// Click and drag are separate by construction: dragging starts from the grip (`slot="drag"`), a
// real named button, so clicking the row selects it and pressing its own actions runs them.
//
// Kinds: each item has a kind (`getKind`, default "item") carried in the drag as a type
// (`strata-kind/<kind>`). A list takes kinds listed in `accepts`; reordering within itself always
// works. That is enough to say "tracks take video and audio, not text" before the drop.
//
// The list never changes the data. `onReorder` and `onInsert` say what was asked for and the app
// applies it (and makes it undoable, patterns.md §7: a move is reversed, not confirmed). A drop on
// a refusing list changes nothing: React Aria never calls them.
//
// No motion beyond the drop indicator appearing: dragging happens tens of times a session and the
// item follows the pointer with no lag (ux-character.md, by frequency).

const KIND = "strata-kind/";
const ID = "strata-item/id";
const LIST = "strata-list/";

/** Where a drop landed, relative to the item with `key`. */
export type DropTarget = { key: string; position: "before" | "after" | "on" } | { key: null; position: "root" };

export type SortableListProps<T> = {
  /** Names the list ("Tracks"). Required. */
  label: string;
  items: readonly T[];
  getKey: (item: T) => string;
  /** The item's name for a screen reader, typeahead and announcements ("Picked up Moonbeam bowl"). */
  getLabel: (item: T) => string;
  /** The row's content, beside the grip. Plain text and marks; actions go in `renderActions`. */
  children: (item: T) => React.ReactNode;
  /** Controls for the row (a `RowAction`), outside the row's selection target. */
  renderActions?: (item: T) => React.ReactNode;
  /** Shown when the list is empty, and "Drop here" while something is dragged over it. */
  empty: React.ReactNode;
  /** The item was moved within this list: `keys` now sit at `target`. */
  onReorder: (keys: string[], target: DropTarget) => void;
  /** An item of another list was dropped here. The app finds it by id and moves it. Needs `accepts`. */
  onInsert?: (ids: string[], target: DropTarget) => void;
  /** What an item is, for deciding which lists take it. Default: every item is "item". */
  getKind?: (item: T) => string;
  /** Kinds this list takes from other lists. Default none: it only reorders. */
  accepts?: readonly string[];
  /** Why a kind is refused, in the product's words, shown while one is dragged over: `{ text: "Tracks take video and audio, not text clips." }`. React Aria cannot list what is being dragged, only ask about a kind, so name the kinds that exist. */
  refuses?: Readonly<Record<string, string>>;
  selectionMode?: "none" | "single" | "multiple";
  selectedKeys?: ReadonlySet<string>;
  onSelectionChange?: (keys: Set<string>) => void;
  className?: string;
};

/** A list that reorders by drag and by keyboard, and takes items from other lists by kind. It reports what was asked and never changes the data itself. */
export function SortableList<T>({
  label,
  items,
  getKey,
  getLabel,
  children,
  renderActions,
  empty,
  onReorder,
  onInsert,
  getKind = () => "item",
  accepts = [],
  refuses = {},
  selectionMode = "none",
  selectedKeys,
  onSelectionChange,
  className,
}: SortableListProps<T>) {
  const listId = React.useId();
  const byKey = React.useMemo(() => new Map(items.map((i) => [getKey(i), i])), [items, getKey]);
  // The reason a drag over this list is refused, while one is. Cleared when the drag ends or leaves.
  const [refused, setRefused] = React.useState<string | null>(null);
  const root = React.useRef<HTMLDivElement>(null);
  React.useEffect(() => {
    if (!refused) return;
    const clear = () => setRefused(null);
    document.addEventListener("dragend", clear);
    document.addEventListener("drop", clear);
    return () => {
      document.removeEventListener("dragend", clear);
      document.removeEventListener("drop", clear);
    };
  }, [refused]);

  const toTarget = (t: { type: string; key?: unknown; dropPosition?: string }): DropTarget =>
    t.type === "root" ? { key: null, position: "root" } : { key: String(t.key), position: t.dropPosition as "before" | "after" | "on" };

  const { dragAndDropHooks } = useDragAndDrop<T>({
    getItems: (keys) =>
      [...keys].map((k) => {
        const item = byKey.get(String(k));
        return { [`${KIND}${item ? getKind(item) : "item"}`]: "", [`${LIST}${listId}`]: "", [ID]: String(k), "text/plain": item ? getLabel(item) : String(k) };
      }),
    // React Aria filters on this before `getDropOperation`: a refused kind must still reach it, to be explained.
    acceptedDragTypes: "all",
    getDropOperation: (_target, types) => {
      // Reordering is allowed for what came from this list; anything else must be a kind in `accepts`,
      // even if this list happens to hold an item of the same kind.
      const accepted = types.has(`${LIST}${listId}`) || accepts.some((k) => types.has(`${KIND}${k}`));
      if (accepted) {
        setRefused(null);
        return "move";
      }
      const kind = Object.keys(refuses).find((k) => types.has(`${KIND}${k}`));
      if (kind) setRefused(refuses[kind]);
      return "cancel";
    },
    onReorder: (e) => onReorder([...e.keys].map(String), toTarget(e.target)),
    onInsert: async (e) => {
      const ids = (await Promise.all(e.items.filter((i) => i.kind === "text").map((i) => i.getText(ID)))).filter(Boolean);
      onInsert?.(ids, toTarget(e.target));
    },
    onRootDrop: async (e) => {
      const ids = (await Promise.all(e.items.filter((i) => i.kind === "text").map((i) => i.getText(ID)))).filter(Boolean);
      onInsert?.(ids, { key: null, position: "root" });
    },
    renderDropIndicator: (target) => (
      <DropIndicator
        target={target}
        // A line with ends, so a position is a shape and not only a tint; zero height so rows do not shift.
        className={({ isDropTarget }) =>
          cn("relative h-0 data-[drop-target]:after:absolute data-[drop-target]:after:inset-x-0 data-[drop-target]:after:-top-px data-[drop-target]:after:h-0.5 data-[drop-target]:after:rounded-pill data-[drop-target]:after:bg-primary", isDropTarget && "z-10")
        }
      />
    ),
  });

  return (
    <div ref={root} className={cn("min-w-0", className)} // Capture phase: React Aria's drop handlers stop dragleave from bubbling.
    onDragLeaveCapture={(e) => !e.currentTarget.contains(e.relatedTarget as Node | null) && setRefused(null)}>
      <GridList
        aria-label={label}
        items={items.map((item) => ({ item, id: getKey(item) }))}
        dragAndDropHooks={dragAndDropHooks}
        selectionMode={selectionMode}
        selectedKeys={selectedKeys}
        onSelectionChange={(keys) => onSelectionChange?.(keys === "all" ? new Set(items.map(getKey)) : new Set([...keys].map(String)))}
        renderEmptyState={({ isDropTarget }) => (
          <div className={cn("rounded-surface border border-dashed py-6 text-center", isDropTarget ? "border-solid border-primary bg-muted" : "border-input")}>
            {isDropTarget ? <p className="type-body">Drop here</p> : empty}
          </div>
        )}
        className={({ isDropTarget }) => cn("grid divide-y divide-border border-y border-border", isDropTarget && "outline-2 outline-offset-2 outline-primary")}
      >
        {({ item }) => (
          <GridListItem
            id={getKey(item)}
            textValue={getLabel(item)}
            className="group relative flex min-h-(--control-h) cursor-default items-center gap-2 py-1 pr-1 pl-1 outline-none data-[focus-visible]:outline-2 data-[focus-visible]:-outline-offset-2 data-[focus-visible]:outline-ring data-[selected]:bg-muted data-[selected]:before:absolute data-[selected]:before:inset-y-1 data-[selected]:before:left-0 data-[selected]:before:w-0.5 data-[selected]:before:rounded-pill data-[selected]:before:bg-primary data-[dragging]:opacity-50"
          >
            <AriaButton slot="drag" className="grid size-(--control-h-sm) shrink-0 cursor-grab place-items-center rounded-control text-muted-foreground hover:bg-muted data-[focus-visible]:outline-2 data-[focus-visible]:outline-ring">
              <GripVertical aria-hidden className="size-4" />
            </AriaButton>
            <div className="min-w-0 flex-1">{children(item)}</div>
            {renderActions && <div className="flex shrink-0 items-center gap-1">{renderActions(item)}</div>}
          </GridListItem>
        )}
      </GridList>
      {refused && (
        <p role="status" className="mt-2 flex items-start gap-1.5 type-body-sm text-danger">
          <Ban aria-hidden className="mt-0.5 size-4 shrink-0" />
          {refused}
        </p>
      )}
    </div>
  );
}
