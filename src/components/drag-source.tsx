import * as React from "react";
import { GripVertical } from "lucide-react";
import { useDrag } from "react-aria";
import { Button as AriaButton } from "react-aria-components";
import { cn } from "../lib/utils";

// Something that can be picked up and dropped on a target elsewhere on the screen (issue #286, from
// strata-vid's library: a file dragged onto a `Timeline` lane). `Timeline`'s lanes have been React Aria
// `useDrop` targets since #121, and they take a keyboard drop, but nothing in Strata started a drag from
// outside a list. `SortableList`'s `useDragAndDrop` only moves its own items between lists of its own
// kind. So an app either used a native `draggable`, which has no keyboard path, or imported `react-aria`
// itself. Jonathan chose (2026-11-23) to have the part here instead.
//
// React Aria first, and its `useDrag` is the whole behaviour: the pointer drag, the keyboard drag (Enter
// on the grip picks it up, Tab moves between targets that accept its types, Enter drops,
// Escape cancels) and the screen-reader announcements at each step, in React Aria's own localised words.
// Checked in `useDrag.d.ts`: with `hasDragButton` the keyboard and screen-reader handlers move from
// `dragProps` to `dragButtonProps`, so they go on a real named button (the grip, "Drag <label>"), while
// the pointer can pick up the whole row. This is the same shape as `SortableList` (its `slot="drag"`
// grip), so a person who has learnt one has learnt the other. The row's own buttons still work, because
// a press on them is not a drag. No `useDraggableItem` is needed, since this is not an item in a
// collection.
//
// What is dragged is the app's: `items` returns `DragData` (React Aria's `DragItem`), a map from a type to a string
// (`{ "application/x-clip": id, "text/plain": name }`). Any `useDrop` target can read them, including
// `Timeline` through its `dropTypes`. Add a `text/plain` entry so a drop on a text field or another
// app has something to say.
//
// No motion of our own. A drag happens tens of times in a session, so the item follows the pointer
// with no lag, and the browser draws its preview (ux-character.md, by frequency). While it is being
// dragged the row is drawn faded (`data-dragging`), so the person can see what they picked up.

/** One dragged item: each drag type it offers, with its value (`{ "application/x-clip": "clip-9", "text/plain": "run.mp4" }`). React Aria's `DragItem`. */
export type DragData = Record<string, string>;

/** Props for `DragSource`. */
export type DragSourceProps = {
  /** What is dragged, as a person would say it ("GX010412.MP4"). Names the grip "Drag GX010412.MP4". */
  label: string;
  /** The data the drop receives, one entry per item: each maps a type to its value. Called when the drag starts. */
  items: () => DragData[];
  /** The drag started (pointer or keyboard). */
  onDragStart?: () => void;
  /** The drag ended. `dropped` is false when it was cancelled or let go where nothing took it. */
  onDragEnd?: (dropped: boolean) => void;
  /** Nothing can be dragged; the grip is drawn disabled. */
  disabled?: boolean;
  /** The row's own content, beside the grip. Its buttons keep working. */
  children: React.ReactNode;
  /** Layout only. */
  className?: string;
};

/** A row that can be dragged onto a drop target, such as a `Timeline` lane, by pointer or from the keyboard with its named grip. */
export function DragSource({ label, items, onDragStart, onDragEnd, disabled, children, className }: DragSourceProps) {
  const { dragProps, dragButtonProps, isDragging } = useDrag({
    getItems: items,
    hasDragButton: true,
    isDisabled: disabled,
    onDragStart: () => onDragStart?.(),
    onDragEnd: (e) => onDragEnd?.(e.dropOperation !== "cancel"),
  });
  return (
    <div
      {...dragProps}
      data-dragging={isDragging || undefined}
      className={cn("flex min-w-0 items-center gap-1 transition-state data-[dragging]:opacity-50", className)}
    >
      <AriaButton
        {...dragButtonProps}
        aria-label={`Drag ${label}`}
        isDisabled={disabled}
        className="grid size-(--control-h-sm) shrink-0 cursor-grab place-items-center rounded-control text-muted-foreground hover:bg-muted disabled:cursor-not-allowed disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-ring"
      >
        <GripVertical aria-hidden className="size-4" />
      </AriaButton>
      <div className="min-w-0 flex-1">{children}</div>
    </div>
  );
}
