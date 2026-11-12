import * as React from "react";
import { Redo2, Undo2 } from "lucide-react";
import type { Command } from "./commands";

// Undo and redo across a whole editing session (components.md §3.17; strata-react issue #81, from
// strata-vid). `useUndoable` is the other half: one removal, a few seconds to take it back, then
// it commits to a server. Use that for a row or an item that leaves a list; use this for a
// document the person keeps editing, where every change can be walked back for as long as the
// session lasts. A removal inside a document is a step here, not an `UndoBar` message.
//
// The model is the smallest one that does not care what the app's store is: a step is a name and
// two functions, `undo` and `redo`. An app on a patch store pushes patches, one on snapshots pushes
// the old and new value (`useHistoryState` does exactly that for plain React state), one on a
// command pattern pushes its commands. The history never reads or holds the document.
//
// - A step is named by the phrase that follows the verb: "move clip" gives "Undo move clip" and
//   "Redo move clip". A person can tell what Undo will do before pressing it (Photoshop and Figma
//   say it; a bare "Undo" does not).
// - A continuous change is one step. `begin(label)` returns `end`: every step pushed in between
//   becomes one, so a drag undoes in one press. For a change that arrives as many events (a slider)
//   pass the same `key` on each push: consecutive pushes with one key, with no undo between them,
//   merge into one step.
// - A new step after an undo drops what could have been redone (the usual rule); `limit` drops the
//   oldest steps, and `atLimit` says it is happening so the app can say so.
// - `commands` is Undo and Redo as `Command`s, with their label, shortcut and disabled reason, so a
//   menu, a toolbar button and the key handler (`useCommands`) all read the same object. Chords are
//   Mod+Z, and Mod+Shift+Z or Mod+Y for Redo. They do not fire in a text field, which keeps its own
//   undo: this history is the document's.
// Motion: none. Undo is used 100+ times a day, so nothing moves.
//
// Checked: React Aria has no history part and no hook for one (react-stately's `useUndo` does not
// exist; its `useControlledState` is for controlled values only), so this is our own.

/** One undoable step. `label` is the phrase after the verb ("move clip"); `undo` and `redo` must be inverses. */
export type HistoryStep = {
  label: string;
  undo: () => void;
  redo: () => void;
  /** Consecutive pushes with the same key merge into one step (a slider, a text drag). */
  key?: string;
};

/** Options for `useHistory`. */
export type HistoryOptions = {
  /** The most steps kept; the oldest is dropped past it. Default 100. */
  limit?: number;
};

/** What `useHistory` returns. */
export type History = {
  /** Records a step the app has just done. Clears what could have been redone. Inside `begin`/`end` it joins the group. */
  push: (step: HistoryStep) => void;
  /** Starts a group named `label`; every push until the returned `end()` is one step. Nested groups join the outer one. An empty group records nothing. */
  begin: (label: string) => () => void;
  /** `begin`, run a function, `end`. */
  group: <T>(label: string, run: () => T) => T;
  undo: () => void;
  redo: () => void;
  canUndo: boolean;
  canRedo: boolean;
  /** The name of the step Undo would take back, or undefined. */
  undoLabel: string | undefined;
  /** The name of the step Redo would repeat, or undefined. */
  redoLabel: string | undefined;
  /** Names of the steps that can be undone, oldest first. */
  past: string[];
  /** Names of the steps that can be redone, next first. */
  future: string[];
  /** The history holds `limit` steps, so the next push drops the oldest. */
  atLimit: boolean;
  /** Forgets every step (a document was opened or saved to a new place). */
  clear: () => void;
  /** Undo then Redo as commands: "Undo move clip", disabled with "Nothing to undo". Pass to `useCommands` and a `Menu`. */
  commands: [undo: Command, redo: Command];
};

const compose = (older: HistoryStep, newer: HistoryStep): HistoryStep => ({
  label: older.label,
  key: older.key,
  undo: () => {
    newer.undo();
    older.undo();
  },
  redo: () => {
    older.redo();
    newer.redo();
  },
});

/** A history of named, undoable steps with grouping, a limit, and Undo and Redo as commands. */
export function useHistory({ limit = 100 }: HistoryOptions = {}): History {
  const store = React.useRef({ past: [] as HistoryStep[], future: [] as HistoryStep[], open: [] as HistoryStep[][], merge: false });
  const [version, bump] = React.useReducer((n: number) => n + 1, 0);
  const max = Math.max(1, limit);

  const api = React.useMemo(() => {
    const s = store.current;
    const record = (step: HistoryStep) => {
      const last = s.past[s.past.length - 1];
      if (s.merge && step.key && last && last.key === step.key) s.past[s.past.length - 1] = compose(last, step);
      else {
        s.past.push(step);
        if (s.past.length > max) s.past.splice(0, s.past.length - max);
      }
      s.future = [];
      s.merge = Boolean(step.key);
      bump();
    };
    const push = (step: HistoryStep) => {
      const group = s.open[s.open.length - 1];
      if (group) group.push(step);
      else record(step);
    };
    const begin = (label: string) => {
      const steps: HistoryStep[] = [];
      s.open.push(steps);
      let ended = false;
      return () => {
        if (ended) return;
        ended = true;
        s.open.pop();
        if (!steps.length) return;
        const grouped: HistoryStep = {
          label,
          undo: () => [...steps].reverse().forEach((x) => x.undo()),
          redo: () => steps.forEach((x) => x.redo()),
        };
        push(grouped);
      };
    };
    return {
      push,
      begin,
      group: <T,>(label: string, run: () => T): T => {
        const end = begin(label);
        try {
          return run();
        } finally {
          end();
        }
      },
      undo: () => {
        if (s.open.length) return;
        const step = s.past.pop();
        if (!step) return;
        step.undo();
        s.future.unshift(step);
        s.merge = false;
        bump();
      },
      redo: () => {
        if (s.open.length) return;
        const step = s.future.shift();
        if (!step) return;
        step.redo();
        s.past.push(step);
        s.merge = false;
        bump();
      },
      clear: () => {
        s.past = [];
        s.future = [];
        s.merge = false;
        bump();
      },
    };
  }, [max]);

  return React.useMemo(() => {
    const { past, future } = store.current;
    const undoLabel = past[past.length - 1]?.label;
    const redoLabel = future[0]?.label;
    const commands: [Command, Command] = [
      {
        id: "history.undo",
        label: undoLabel ? `Undo ${undoLabel}` : "Undo",
        icon: Undo2,
        keys: ["Mod+Z"],
        disabled: undoLabel ? false : "Nothing to undo",
        run: api.undo,
      },
      {
        id: "history.redo",
        label: redoLabel ? `Redo ${redoLabel}` : "Redo",
        icon: Redo2,
        keys: ["Mod+Shift+Z", "Mod+Y"],
        disabled: redoLabel ? false : "Nothing to redo",
        run: api.redo,
      },
    ];
    return {
      ...api,
      canUndo: past.length > 0,
      canRedo: future.length > 0,
      undoLabel,
      redoLabel,
      past: past.map((x) => x.label),
      future: future.map((x) => x.label),
      atLimit: past.length >= max,
      commands,
    };
    // `version` is the change signal: the stacks live in a ref so a step can be pushed from an event handler or a store subscription.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [api, version, max]);
}

/** Options for `useHistoryState`. */
export type HistoryStateOptions = HistoryOptions;

/** What `setValue` takes besides the new value. */
export type SetOptions = {
  /** Merges consecutive changes with this key into one step (a slider, a drag). */
  key?: string;
};

/**
 * React state with a history: `set(next, "move clip")` changes the value and records the step; Undo
 * and Redo put the old and new values back. For an app whose document is a plain value. An app on its
 * own store uses `useHistory` and pushes steps from its actions.
 */
export function useHistoryState<S>(initial: S | (() => S), options?: HistoryStateOptions) {
  const [value, setValue] = React.useState(initial);
  const latest = React.useRef(value);
  const history = useHistory(options);
  const { push } = history;

  const write = React.useCallback((next: S) => {
    latest.current = next;
    setValue(next);
  }, []);

  const set = React.useCallback(
    (next: S | ((previous: S) => S), label: string, { key }: SetOptions = {}) => {
      const before = latest.current;
      const after = typeof next === "function" ? (next as (previous: S) => S)(before) : next;
      if (Object.is(before, after)) return;
      write(after);
      push({ label, key, undo: () => write(before), redo: () => write(after) });
    },
    [push, write],
  );

  /** Replaces the value without a step and forgets the history (a document was opened). */
  const reset = React.useCallback(
    (next: S) => {
      write(next);
      history.clear();
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [write, history.clear],
  );

  return { value, set, reset, history };
}
