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
// The same list drives the handler and the legend, so a shortcut cannot exist without being
// shown, and the legend cannot advertise a key that does nothing.

/** One shortcut: the keys that run it (as `KeyboardEvent.key`), what it does in the product's words, and the action. */
export type Shortcut = {
  /** `KeyboardEvent.key` values, e.g. `["j", "ArrowDown"]`. The first is the one the legend leads with. */
  keys: string[];
  /** What it does, in the product's words: "Accept booking", not "Action 1". */
  label: string;
  run: () => void;
  /** Fire again while the key is held. On for moving through a list, off (the default) for answers. */
  repeat?: boolean;
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

function toShortcuts(input: Shortcut[] | Record<string, () => void>): Shortcut[] {
  return Array.isArray(input) ? input : Object.entries(input).map(([key, run]) => ({ keys: [key], label: key, run }));
}

/**
 * Binds single-key shortcuts on the window, ignoring keys typed into fields, chords with Ctrl, Meta
 * or Alt, IME composition and (unless `repeat`) held keys. Pass the same list to `KeysLegend`.
 */
export function useHotkeys(shortcuts: Shortcut[] | Record<string, () => void>, { enabled = true }: { enabled?: boolean } = {}) {
  // The listener is bound once; it reads the latest list, so handlers can close over fresh state.
  const latest = React.useRef<Shortcut[]>([]);
  latest.current = toShortcuts(shortcuts);

  React.useEffect(() => {
    if (!enabled) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.defaultPrevented || e.isComposing || e.ctrlKey || e.metaKey || e.altKey) return;
      if (isTypingTarget(e.target)) return;
      const hit = latest.current.find((s) => !s.disabled && s.keys.includes(e.key));
      if (!hit || (e.repeat && !hit.repeat)) return;
      e.preventDefault();
      hit.run();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [enabled]);
}

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
                  {KEY_NAMES[k] ?? k}
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
