import { KeyText } from "./key-glyphs";
import * as React from "react";
import { cn } from "../lib/utils";

// Single-key shortcuts for Operate screens that clear a queue (accept, reject, next). A person
// doing the same answer a hundred times a day wants one key, no pointer and no motion
// (ux-research `ux-character.md`: 100+ a day gets nothing but an instant change). Three rules
// keep single keys from hurting anyone:
//   1. They never fire while the person is typing: not in an input, textarea, select or
//      contenteditable (WCAG 2.1.4 Character Key Shortcuts), and not mid-composition (IME).
//   2. They never take a chord: with Ctrl, Meta or Alt held the browser and the OS keep the key.
//      Shift is part of the key itself, so "?" works and "A" is not "a".
//   3. Holding a key does not repeat an answer; only shortcuts marked `repeat` (moving) repeat.
//   4. They are also heard in the capture phase for a key pressed on a control inside a grid or
//      table row (a tile's checkbox, a row's button). React Aria's `useGridListItem` calls
//      `stopPropagation` for every key but Tab pressed on such a child ("we don't want to trigger
//      grid level interactions"), which also stops the native event bubbling to `window`, so after
//      a click on a tile's checkbox `a` never arrived (issue #328). Only that case is taken early:
//      the grid does nothing with those keys, so nothing is done twice. Every other key keeps the
//      bubble phase, which lets a part that handles a key itself (a slider's arrows and Space, a
//      menu's typeahead) call `preventDefault` or stop it first, as it always could.
// The same list drives the handler and the legend, so a shortcut cannot exist without being
// shown, and the legend cannot advertise a key that does nothing.

/** One shortcut: the keys that run it (as `KeyboardEvent.key`), what it does in the product's words, and the action. */
export type Shortcut = {
  /** `KeyboardEvent.key` values, e.g. `["j", "ArrowDown"]`. The first is the one the legend leads with. */
  keys: string[];
  /** What it does, in the product's words: "Accept booking", not "Action 1". */
  label: string;
  /** What names it when keys are rebound (`ShortcutEditor`): stable across releases, so a person's saved keys still mean the same action. Default: the label. */
  id?: string;
  run: () => void;
  /** Fire again while the key is held. On for moving through a list, off (the default) for answers. */
  repeat?: boolean;
  /** With `useHotkeys`' `within`: keep this key page-wide (Space to play, say) while the others only count with focus inside the region. */
  anywhere?: boolean;
  /** Ignore the key for now, and show it muted in the legend (nothing is active, say). */
  disabled?: boolean;
};

const TEXT_INPUTS_EXEMPT = new Set(["checkbox", "radio", "button", "submit", "reset", "range", "color", "file"]);

/** True when a key pressed on this element is the person typing, so single-key shortcuts must leave it alone. */
export function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  if (target.isContentEditable || target.closest("[contenteditable=''],[contenteditable='true']")) return true;
  if (target instanceof HTMLTextAreaElement || target instanceof HTMLSelectElement) return true;
  if (target instanceof HTMLInputElement) return !TEXT_INPUTS_EXEMPT.has(target.type);
  return false;
}

// A control inside a row of a grid or table: React Aria's row hooks stop the keys pressed on it.
function isRowChild(target: EventTarget | null): boolean {
  if (!(target instanceof Element)) return false;
  const row = target.closest("[role=row]");
  return row !== null && row !== target;
}

function toShortcuts(input: Shortcut[] | Record<string, () => void>): Shortcut[] {
  return Array.isArray(input) ? input : Object.entries(input).map(([key, run]) => ({ keys: [key], label: key, run }));
}

export type HotkeysOptions = {
  enabled?: boolean;
  /**
   * Only count keys while focus is inside this region (strata-react issue #385): a player's own region, so a stage beside it keeps
   * its arrow keys. A shortcut with `anywhere` stays page-wide. A key whose target is outside the region goes to whoever else wants it.
   */
  within?: React.RefObject<Element | null>;
};

/**
 * Binds single-key shortcuts on the window (also for a key pressed on a control inside a grid row, whose React Aria hooks stop propagation), ignoring keys typed into fields, chords with Ctrl, Meta
 * or Alt, IME composition and (unless `repeat`) held keys. Pass the same list to `KeysLegend`: better, pass it `live`, which is what answers a key
 * right now (nothing while `enabled` is off; with `within`, only the `anywhere` keys until focus is inside the region).
 */
export function useHotkeys(shortcuts: Shortcut[] | Record<string, () => void>, { enabled = true, within }: HotkeysOptions = {}): { live: Shortcut[] } {
  // The listener is bound once; it reads the latest list, so handlers can close over fresh state.
  const latest = React.useRef<Shortcut[]>([]);
  const list = toShortcuts(shortcuts);
  latest.current = list;
  // Focus inside the region, as state, so the legend can follow it.
  const [inside, setInside] = React.useState(false);
  React.useEffect(() => {
    const region = within?.current;
    if (!region || !enabled) return setInside(false);
    const sync = () => setInside(region.contains(document.activeElement));
    sync();
    const leave = () => queueMicrotask(sync);
    region.addEventListener("focusin", sync);
    region.addEventListener("focusout", leave);
    return () => {
      region.removeEventListener("focusin", sync);
      region.removeEventListener("focusout", leave);
      setInside(false);
    };
  }, [enabled, within]);

  React.useEffect(() => {
    if (!enabled) return;
    // One press may be seen twice (capture, then bubble): it runs once.
    const seen = new WeakSet<Event>();
    const onKeyDown = (e: KeyboardEvent) => {
      if (seen.has(e)) return;
      seen.add(e);
      if (e.defaultPrevented || e.isComposing || e.ctrlKey || e.metaKey || e.altKey) return;
      if (isTypingTarget(e.target)) return;
      const region = within?.current;
      const here = !region || (e.target instanceof Node && region.contains(e.target));
      const hit = latest.current.find((s) => !s.disabled && (here || s.anywhere) && s.keys.includes(e.key));
      if (!hit || (e.repeat && !hit.repeat)) return;
      e.preventDefault();
      hit.run();
    };
    const early = (e: KeyboardEvent) => {
      if (isRowChild(e.target)) onKeyDown(e);
    };
    window.addEventListener("keydown", early, true);
    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener("keydown", early, true);
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [enabled, within]);
  const live = enabled ? list.filter((s) => !s.disabled && (!within || inside || s.anywhere)) : [];
  return { live };
}

/** How a `KeyboardEvent.key` is drawn in a legend and an editor: arrows as arrows, the rest by name. */
export const keyName = (key: string) => KEY_NAMES[key] ?? key;

const KEY_NAMES: Record<string, string> = {
  ArrowDown: "↓",
  ArrowUp: "↑",
  ArrowLeft: "←",
  ArrowRight: "→",
  Escape: "Esc",
  Enter: "Enter",
  Backspace: "Backspace",
  Delete: "Delete",
  " ": "Space",
};

// The legend is quiet, caption-sized and muted: it is there to be found, not read every time.
// It hides on coarse pointers (phones, tablets without a keyboard), where the keys do not exist.
// Each key is a <kbd>; alternatives are read as "j or down arrow".
/** A quiet legend of the screen's shortcuts, from the same list `useHotkeys` binds. Hidden on touch screens. */
export function KeysLegend({
  shortcuts,
  label = "Keyboard shortcuts",
  className,
}: {
  shortcuts: Pick<Shortcut, "keys" | "label" | "disabled">[];
  /** Names the legend for screen readers. */
  label?: string;
  className?: string;
}) {
  return (
    <dl aria-label={label} className={cn("flex flex-wrap gap-x-4 gap-y-1 type-caption text-muted-foreground pointer-coarse:hidden", className)}>
      {shortcuts.map((s) => (
        <div key={s.keys.join(" ")} className={cn("flex items-center gap-1.5", s.disabled && "opacity-50")}>
          <dt className="flex items-center gap-1">
            {s.keys.map((k, i) => (
              <React.Fragment key={k}>
                {i > 0 && <span className="sr-only"> or </span>}
                <kbd className="min-w-5 rounded-control border border-border bg-surface-sunken px-1 text-center font-mono text-foreground">
                  <KeyText>{KEY_NAMES[k] ?? k}</KeyText>
                </kbd>
              </React.Fragment>
            ))}
          </dt>
          <dd>{s.label}</dd>
        </div>
      ))}
    </dl>
  );
}
