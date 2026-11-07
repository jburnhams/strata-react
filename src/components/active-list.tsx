import * as React from "react";
import { cn } from "../lib/utils";
import { isTypingTarget, type Shortcut } from "./hotkeys";

// A queue someone works through from the keyboard: one item is active, j/k (or the arrow keys
// inside the list) move it, and answering an item moves straight on to the next one. Three
// decisions shape it:
//   1. The active item is the one with focus. It is a roving tab stop (only it is in the tab order)
//      and carries aria-current, so a screen reader hears which item an answer applies to. It is
//      marked by a 2px rule in ink as well as a tint, not by colour alone.
//   2. When the active item leaves the list (accepted, rejected, removed), the item that took its
//      place becomes active, or the one before it at the end of the list, and focus follows if it
//      was in the list. Otherwise focus would fall to <body> and the next key would do nothing.
//   3. The hook remembers which item the person chose, not just a position. If an Undo puts the
//      item back, it is active again (pairs with `useUndoable`).
// Moving is instant: no transition on the highlight (ux-research `ux-character.md`, 100+ a day).

/** What `useActiveItem` returns: the active item, ways to move it, and the props each item element needs. */
export type ActiveItem<T> = {
  items: readonly T[];
  getKey: (item: T) => string;
  activeKey: string | null;
  activeItem: T | null;
  /** Position of the active item, or -1 when the list is empty. */
  index: number;
  next: () => void;
  prev: () => void;
  first: () => void;
  last: () => void;
  setActive: (key: string) => void;
  /** The j/k shortcuts for `useHotkeys` and `KeysLegend`. */
  shortcuts: Shortcut[];
  /** Props for the element that represents an item: ref, tabIndex, aria-current and focus tracking. */
  itemProps: (key: string) => {
    ref: (el: HTMLElement | null) => void;
    tabIndex: number;
    "aria-current": "true" | undefined;
    "data-active": "" | undefined;
    onFocus: () => void;
    onBlur: (e: React.FocusEvent) => void;
  };
};

/** Tracks the active item in a list worked through from the keyboard: moving, roving focus, and moving on when the active item is removed. */
export function useActiveItem<T>(
  items: readonly T[],
  getKey: (item: T) => string,
  {
    initial,
    noun,
  }: {
    /** Key of the item active at first; the first item otherwise. */
    initial?: string;
    /** Names an item in the shortcut labels: "Next booking". */
    noun?: string;
  } = {},
): ActiveItem<T> {
  const [chosen, setChosen] = React.useState<string | null>(initial ?? null);
  const lastIndex = React.useRef(0);
  const elements = React.useRef(new Map<string, HTMLElement>());
  const navigated = React.useRef(false);
  const focusWithin = React.useRef(false);

  const keys = items.map(getKey);
  let index = chosen === null ? -1 : keys.indexOf(chosen);
  if (index === -1 && keys.length > 0) index = Math.min(lastIndex.current, keys.length - 1);
  const activeKey = index >= 0 ? keys[index] : null;

  React.useLayoutEffect(() => {
    if (index >= 0) lastIndex.current = index;
  });

  // Move focus to the active item when the person moved it, or when the focused item was removed
  // (focus has fallen to <body>). Never steal focus from somewhere else on the page.
  React.useLayoutEffect(() => {
    const el = activeKey === null ? undefined : elements.current.get(activeKey);
    const lost = focusWithin.current && (document.activeElement === null || document.activeElement === document.body);
    if (el && (navigated.current || lost)) {
      el.focus({ preventScroll: true });
      el.scrollIntoView?.({ block: "nearest" });
    }
    navigated.current = false;
  }, [activeKey]);

  const moveTo = (i: number) => {
    if (keys.length === 0) return;
    const to = Math.max(0, Math.min(keys.length - 1, i));
    navigated.current = true;
    if (to === index) {
      // Already there: still bring focus back to it, as the person asked to move.
      const el = elements.current.get(keys[to]);
      el?.focus({ preventScroll: true });
      el?.scrollIntoView?.({ block: "nearest" });
      navigated.current = false;
    }
    setChosen(keys[to]);
  };

  const next = () => moveTo(index + 1);
  const prev = () => moveTo(index - 1);
  const first = () => moveTo(0);
  const last = () => moveTo(keys.length - 1);
  const setActive = (key: string) => {
    const i = keys.indexOf(key);
    if (i >= 0) moveTo(i);
  };

  const name = noun ? ` ${noun}` : "";
  const shortcuts: Shortcut[] = [
    { keys: ["j"], label: `Next${name}`, run: next, repeat: true, disabled: keys.length === 0 },
    { keys: ["k"], label: `Previous${name}`, run: prev, repeat: true, disabled: keys.length === 0 },
  ];

  const itemProps: ActiveItem<T>["itemProps"] = (key) => ({
    ref: (el) => {
      if (el) elements.current.set(key, el);
      else elements.current.delete(key);
    },
    tabIndex: key === activeKey ? 0 : -1,
    "aria-current": key === activeKey ? "true" : undefined,
    "data-active": key === activeKey ? "" : undefined,
    onFocus: () => {
      focusWithin.current = true;
      // Clicking or tabbing into an item makes it active. If it already is (it took a removed
      // item's place), keep remembering the removed one so an Undo makes that active again.
      if (key !== activeKey) setChosen(key);
    },
    onBlur: (e) => {
      // Focus going nowhere (null) is what removal looks like, so only a move to a real element
      // outside the list counts as leaving it.
      const to = e.relatedTarget;
      if (to instanceof Node && ![...elements.current.values()].some((el) => el.contains(to))) focusWithin.current = false;
    },
  });

  return {
    items,
    getKey,
    activeKey,
    activeItem: index >= 0 ? items[index] : null,
    index,
    next,
    prev,
    first,
    last,
    setActive,
    shortcuts,
    itemProps,
  };
}

// The list renders the queue from `useActiveItem`. The arrow keys, Home and End move the active
// item while focus is in the list (the window-wide j/k come from `active.shortcuts` via
// `useHotkeys`, because only the screen knows whether it has one queue or two). An empty queue
// is a state the list cannot be written without: say what clearing it means and what is next.
/** A keyboard-worked queue: the active item is a roving tab stop with aria-current, and the arrow keys, Home and End move it. */
export function ActiveList<T>({
  label,
  active,
  empty,
  children,
  className,
}: {
  /** Names the list for screen readers. */
  label: string;
  active: ActiveItem<T>;
  /** Shown when the queue is clear: what that means and what to do next. */
  empty: React.ReactNode;
  children: (item: T, state: { active: boolean }) => React.ReactNode;
  className?: string;
}) {
  if (active.items.length === 0) return <>{empty}</>;

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.ctrlKey || e.metaKey || e.altKey || isTypingTarget(e.target)) return;
    const move =
      e.key === "ArrowDown" ? active.next
      : e.key === "ArrowUp" ? active.prev
      : e.key === "Home" ? active.first
      : e.key === "End" ? active.last
      : undefined;
    if (!move) return;
    e.preventDefault();
    move();
  };

  return (
    <ul aria-label={label} onKeyDown={onKeyDown} className={cn("grid gap-px", className)}>
      {active.items.map((item) => {
        const key = active.getKey(item);
        const isActive = key === active.activeKey;
        return (
          <li
            key={key}
            {...active.itemProps(key)}
            className={cn(
              "rounded-control border-l-2 px-3 py-2 -outline-offset-2",
              isActive ? "border-foreground bg-accent text-accent-foreground" : "border-transparent",
            )}
          >
            {children(item, { active: isActive })}
          </li>
        );
      })}
    </ul>
  );
}
