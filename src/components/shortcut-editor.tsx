import * as React from "react";
import { RotateCcw } from "lucide-react";
import { formatChord, isReservedChord } from "../lib/chords";
import { cn } from "../lib/utils";
import { Button } from "./button";
import { KeyText } from "./key-glyphs";
import { keyName, type Shortcut } from "./hotkeys";

// Letting a person change the keys `useHotkeys` runs and `KeysLegend` shows (issue #361, moved from the
// Quake 2 explorer's `KeybindingEditor.tsx`). A game wants rebinding, and so does any screen worked
// from the keyboard, such as a review queue. Three parts over ONE list, so the handler, the legend and
// the editor cannot disagree:
//
//   useRebindableShortcuts(defaults, { storageKey?, onChange? })
//        holds the person's overrides (kept under `storageKey`, in try/catch, or handed to `onChange`
//        for the app to persist) and returns `shortcuts`: the defaults with their keys replaced.
//   useHotkeys(rebinding.shortcuts)   and   <KeysLegend shortcuts={rebinding.shortcuts} />
//        read that list, so a rebound key runs, and shows, as soon as it is chosen.
//   <ShortcutEditor rebinding={rebinding} />
//        each action with its current keys; "Change <action>" records the next key pressed.
//
// Rules, each said in words where it bites:
// - **A key, not a chord.** `useHotkeys` never takes Ctrl, Cmd or Alt (the browser and the system keep
//   them), so a chord is refused with that reason, and one the browser uses for itself (`Ctrl+W`) says
//   so. Shift is part of the key (`?`, `A`), so it is kept. Modifier keys alone are not a choice: the
//   recording waits for the key they go with.
// - **Escape cancels** and **Tab moves on**: neither can be bound, since the first leaves the recording
//   and the second leaves the field.
// - **A conflict is named, not overwritten**: "Already "Jump": swap?" gives the other action the key this
//   one is giving up, or keeps things as they were. A disabled shortcut does not conflict.
// - **Change replaces the first key** (the one the legend leads with); the alternatives stay (`j` and
//   `ArrowDown`: change `j`, keep the arrow). Reset puts one action, or all, back to the defaults.
// - Said, not only drawn: the recording state is a button's name ("Press a key for Jump"), every
//   refusal, conflict and result is in a polite status, and Escape works wherever focus is in the row.
// Checked for React Aria first: it has no key-recording control (`Keyboard` only labels text), so the
// recording is a `Button` that takes `keydown` while it has focus, and ends on blur, so a key typed
// elsewhere never rebinds anything. A pressed key does not reach the page's own `useHotkeys`: the button
// stops it.

const idOf = (s: Pick<Shortcut, "id" | "label">) => s.id ?? s.label;
const MODIFIER_KEYS = new Set(["Shift", "Control", "Alt", "Meta", "AltGraph", "CapsLock", "Fn", "OS"]);

/** The keys a person has chosen, by shortcut id; an action absent here keeps its default keys. */
export type ShortcutOverrides = Record<string, string[]>;

/** What `useRebindableShortcuts` returns: the list to hand to `useHotkeys` and `KeysLegend`, and what `ShortcutEditor` edits. */
export type Rebinding = {
  /** The defaults with the person's keys: give this to `useHotkeys` and `KeysLegend`. */
  shortcuts: Shortcut[];
  /** The defaults the editor resets to. */
  defaults: readonly Shortcut[];
  overrides: ShortcutOverrides;
  /** Whether an action has other keys than its default. */
  isChanged: (id: string) => boolean;
  /** Sets an action's keys (or `null` to go back to its default). */
  setKeys: (id: string, keys: string[] | null) => void;
  /** Back to the defaults, every action. */
  resetAll: () => void;
};

/** Holds a person's rebound keys over a default `Shortcut[]`, remembered under `storageKey` and handed to `onChange`. The result's `shortcuts` is what `useHotkeys` and `KeysLegend` take. */
export function useRebindableShortcuts(
  defaults: readonly Shortcut[],
  { storageKey, initial, onChange }: { storageKey?: string; initial?: ShortcutOverrides; onChange?: (overrides: ShortcutOverrides) => void } = {},
): Rebinding {
  const [overrides, setOverrides] = React.useState<ShortcutOverrides>(() => {
    if (initial) return initial;
    if (!storageKey) return {};
    try {
      const parsed: unknown = JSON.parse(window.localStorage.getItem(storageKey) ?? "{}");
      if (!parsed || typeof parsed !== "object") return {};
      const out: ShortcutOverrides = {};
      for (const [id, keys] of Object.entries(parsed)) if (Array.isArray(keys) && keys.every((k) => typeof k === "string") && keys.length > 0) out[id] = keys as string[];
      return out;
    } catch {
      return {}; // storage throws in private windows and when blocked: the defaults apply
    }
  });
  const latest = React.useRef({ onChange, storageKey });
  latest.current = { onChange, storageKey };
  // Two changes in one event (a swap) must build on each other, not on the render's copy.
  const current = React.useRef(overrides);
  const commit = React.useCallback((next: ShortcutOverrides) => {
    current.current = next;
    setOverrides(next);
    const { onChange: notify, storageKey: key } = latest.current;
    if (key) {
      try {
        window.localStorage.setItem(key, JSON.stringify(next));
      } catch {
        // Not remembered; applies for this visit.
      }
    }
    notify?.(next);
  }, []);
  return React.useMemo<Rebinding>(
    () => ({
      shortcuts: defaults.map((s) => (overrides[idOf(s)] ? { ...s, keys: overrides[idOf(s)]! } : { ...s })),
      defaults,
      overrides,
      isChanged: (id) => id in overrides,
      setKeys: (id, keys) => {
        const next = { ...current.current };
        if (keys === null) delete next[id];
        else next[id] = keys;
        commit(next);
      },
      resetAll: () => commit({}),
    }),
    [defaults, overrides, commit],
  );
}

/** What a pressed key means for one action: take it, refuse it with a reason, or ask about the action that already has it. */
export type KeyCheck = { ok: true; key: string } | { ok: false; reason: string } | { ok: "conflict"; key: string; other: Shortcut };

/** Judges a key pressed while recording for the shortcut `id`, against the current list. */
export function checkKey(e: Pick<KeyboardEvent, "key" | "ctrlKey" | "metaKey" | "altKey" | "shiftKey">, id: string, shortcuts: readonly Shortcut[]): KeyCheck {
  if (e.ctrlKey || e.metaKey || e.altKey) {
    const chord = [e.ctrlKey && "Ctrl", e.metaKey && "Meta", e.altKey && "Alt", e.shiftKey && "Shift", e.key.length === 1 ? e.key.toUpperCase() : e.key].filter(Boolean).join("+");
    return { ok: false, reason: isReservedChord(chord) ? `${formatChord(chord)} belongs to the browser.` : `${formatChord(chord)} is a chord, and shortcuts here are single keys: Ctrl, Cmd and Alt belong to the browser and the system.` };
  }
  if (e.key === "Tab") return { ok: false, reason: "Tab moves between controls, so it cannot be a shortcut." };
  const other = shortcuts.find((s) => idOf(s) !== id && !s.disabled && s.keys.includes(e.key));
  return other ? { ok: "conflict", key: e.key, other } : { ok: true, key: e.key };
}

/** Each shortcut with its keys and a "Change" that records the next key pressed; refuses keys that cannot be bound, names a conflict and offers a swap, and resets one or all. Edits the list a `useRebindableShortcuts` holds. */
export function ShortcutEditor({ rebinding, label = "Keyboard shortcuts", className }: { rebinding: Rebinding; label?: string; className?: string }) {
  const { shortcuts, defaults, setKeys, isChanged, resetAll, overrides } = rebinding;
  const [recording, setRecording] = React.useState<string | null>(null);
  const [conflict, setConflict] = React.useState<{ id: string; key: string; other: Shortcut } | null>(null);
  const [said, setSaid] = React.useState("");

  const keysOf = (id: string) => shortcuts.find((s) => idOf(s) === id)!.keys;
  const apply = (id: string, key: string, swapWith?: Shortcut) => {
    const own = keysOf(id);
    const old = own[0];
    setKeys(id, [key, ...own.slice(1).filter((k) => k !== key)]);
    if (swapWith) {
      const theirs = keysOf(idOf(swapWith)).map((k) => (k === key ? old! : k));
      setKeys(idOf(swapWith), [...new Set(theirs)]);
    }
  };

  const onKeyDown = (e: React.KeyboardEvent, shortcut: Shortcut) => {
    const id = idOf(shortcut);
    if (e.nativeEvent.isComposing) return;
    if (e.key === "Tab") {
      // Tab cannot be bound and must still leave: end the recording and let focus move.
      setRecording(null);
      setSaid("Tab moves between controls, so it cannot be a shortcut. Kept " + keyName(shortcut.keys[0] ?? "") + " for " + shortcut.label + ".");
      return;
    }
    e.stopPropagation(); // the page's own `useHotkeys` must not hear the key being chosen
    if (e.key === "Escape") {
      e.preventDefault();
      setRecording(null);
      setSaid(`Kept ${keyName(shortcut.keys[0] ?? "")} for ${shortcut.label}.`);
      return;
    }
    if (MODIFIER_KEYS.has(e.key)) return; // waiting for the key they go with
    e.preventDefault();
    const found = checkKey(e.nativeEvent, id, shortcuts);
    if (found.ok === false) {
      setSaid(found.reason);
      return;
    }
    setRecording(null);
    if (found.ok === "conflict") {
      setConflict({ id, key: found.key, other: found.other });
      setSaid(`${keyName(found.key)} is already ${found.other.label}. Swap?`);
      return;
    }
    apply(id, found.key);
    setSaid(`${shortcut.label} is now ${keyName(found.key)}.`);
  };

  const anyChanged = Object.keys(overrides).length > 0;
  return (
    <section aria-label={label} className={cn("grid min-w-0 gap-3", className)}>
      <ul className="grid min-w-0 divide-y divide-border rounded-surface border border-border">
        {shortcuts.map((shortcut) => {
          const id = idOf(shortcut);
          const mine = conflict?.id === id ? conflict : null;
          const isRecording = recording === id;
          return (
            <li key={id} className={cn("flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1 px-3 py-2", shortcut.disabled && "opacity-50")}>
              <span className="min-w-0 flex-1 type-body-sm">{shortcut.label}</span>
              <span className="flex items-center gap-1">
                {shortcut.keys.map((k, i) => (
                  <React.Fragment key={k}>
                    {i > 0 && <span className="sr-only"> or </span>}
                    <kbd className="min-w-5 rounded-control border border-border bg-surface-sunken px-1 text-center font-mono type-caption text-foreground">
                      <KeyText>{keyName(k)}</KeyText>
                    </kbd>
                  </React.Fragment>
                ))}
              </span>
              {isRecording ? (
                <Button
                  size="sm"
                  variant="default"
                  autoFocus
                  aria-label={`Press a key for ${shortcut.label}. Escape cancels.`}
                  onKeyDown={(e) => onKeyDown(e, shortcut)}
                  onBlur={() => setRecording((now) => (now === id ? null : now))}
                >
                  Press a key…
                </Button>
              ) : (
                <Button
                  size="sm"
                  aria-label={`Change ${shortcut.label}`}
                  disabled={shortcut.disabled}
                  onPress={() => {
                    setConflict(null);
                    setRecording(id);
                    setSaid(`Press the new key for ${shortcut.label}. Escape cancels.`);
                  }}
                >
                  Change
                </Button>
              )}
              {isChanged(id) && !isRecording && (
                <Button
                  size="sm"
                  variant="ghost"
                  aria-label={`Reset ${shortcut.label}`}
                  onPress={() => {
                    setKeys(id, null);
                    setConflict(null);
                    const original = defaults.find((s) => idOf(s) === id);
                    setSaid(`${shortcut.label} is back to ${keyName(original?.keys[0] ?? "")}.`);
                  }}
                >
                  <RotateCcw aria-hidden /> Reset
                </Button>
              )}
              {mine && (
                <p className="flex basis-full flex-wrap items-center gap-2 type-body-sm text-warning">
                  <span>
                    Already “{mine.other.label}”: swap?
                  </span>
                  <Button
                    size="sm"
                    onPress={() => {
                      const given = keysOf(id)[0] ?? "";
                      apply(id, mine.key, mine.other);
                      setConflict(null);
                      setSaid(`${shortcut.label} is now ${keyName(mine.key)}, and ${mine.other.label} has ${keyName(given)}.`);
                    }}
                  >
                    Swap
                  </Button>
                  <Button size="sm" variant="ghost" onPress={() => { setConflict(null); setSaid("Nothing changed."); }}>
                    Keep as it was
                  </Button>
                </p>
              )}
            </li>
          );
        })}
      </ul>
      <div className="flex items-center gap-3">
        {anyChanged && <Button size="sm" onPress={() => { resetAll(); setConflict(null); setSaid("Every shortcut is back to its default."); }}>Reset all</Button>}
        <p role="status" className="min-w-0 flex-1 type-body-sm text-muted-foreground">
          {said}
        </p>
      </div>
    </section>
  );
}
