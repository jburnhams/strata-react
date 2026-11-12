import * as React from "react";

// A shared cursor: one position that a map, several charts and a seek bar all show at once (strata-react
// issue #184, from strata-360, where the cursor on the elevation and pace charts is the marker on the
// route). Each of those components already draws one position well; what an app lacked was the wiring.
//
// One position in a canonical unit the app chooses (metres along a route, or seconds), and every member
// says how its own x maps to it (`CursorMapping`; the identity when they already agree). The rules:
//
// - **A writer never reacts to its own writes.** Every member has a `source` id, and a position whose
//   source is its own is not drawn back at it (a chart's own pointer already draws its own rule).
// - **Two owners, and the pointer wins.** Playback sets the cursor (sixty times a second); a pointer or
//   key over any member sets it too, and holds it until it leaves, and then playback's position is
//   still there. Stored as two entries, not one value, so "pointer left" has something to fall back to.
// - **It is not announced as it moves.** The scope has one polite live region, written at most once a
//   second and only for a pointer or key (never playback): sixty announcements a second are worse than
//   silence (§3.22).
// - **A store, not state in the scope.** Members subscribe to it; the scope's children do not render
//   when the cursor moves, only the members that read it.
//
// Checked: React Aria has no shared-pointer part; `useSyncExternalStore` is React's own.

/** Who set the cursor: a pointer or key over a member, or playback (a player's clock). */
export type CursorOwner = "pointer" | "playback";

/** How a member's own x relates to the scope's unit. Both default to the identity. */
export type CursorMapping = {
  /** From this member's x to the scope's unit (a chart in seconds in a scope in metres: look it up in the series). */
  toCursor?: (x: number) => number;
  /** From the scope's unit to this member's x. */
  fromCursor?: (at: number) => number;
};

type Entry = { at: number; source: string };
type Snapshot = {
  /** The position now: the pointer's while there is one, else playback's; null when neither is set. */
  at: number | null;
  /** Who wrote `at`; a member ignores a position it wrote. */
  source: string | null;
  owner: CursorOwner | null;
};

const EMPTY: Snapshot = { at: null, source: null, owner: null };

class CursorStore {
  private pointer: Entry | null = null;
  private playback: Entry | null = null;
  private listeners = new Set<() => void>();
  snapshot: Snapshot = EMPTY;
  subscribe = (fn: () => void) => {
    this.listeners.add(fn);
    return () => void this.listeners.delete(fn);
  };
  private publish() {
    const e = this.pointer ?? this.playback;
    const owner: CursorOwner | null = this.pointer ? "pointer" : this.playback ? "playback" : null;
    if (e?.at === this.snapshot.at && e?.source === this.snapshot.source && owner === this.snapshot.owner) return;
    this.snapshot = e ? { at: e.at, source: e.source, owner } : EMPTY;
    for (const l of this.listeners) l();
  }
  /** A pointer or key over a member. `null` means it left: it clears only if the pointer was this member's, so a stale leave cannot remove another member's position. */
  setPointer(at: number | null, source: string) {
    if (at === null) {
      if (this.pointer?.source !== source) return;
      this.pointer = null;
    } else this.pointer = { at, source };
    this.publish();
  }
  setPlayback(at: number | null, source: string) {
    this.playback = at === null ? null : { at, source };
    this.publish();
  }
}

const Scope = React.createContext<CursorStore | null>(null);

export type CursorScopeProps = {
  children: React.ReactNode;
  /** Words for the position in the scope's unit ("12.4 km along", "1:23"), for the polite announcement. Without it nothing is announced. */
  format?: (at: number) => string;
  /** Milliseconds between announcements. Default 1000. */
  announceEvery?: number;
};

/** Holds one cursor position for the charts, map and seek bar inside it, with a throttled polite announcement of where a pointer or key has put it. */
export function CursorScope({ children, format, announceEvery = 1000 }: CursorScopeProps) {
  const store = React.useRef<CursorStore | null>(null);
  store.current ??= new CursorStore();
  return (
    <Scope.Provider value={store.current}>
      {children}
      {format && <CursorAnnouncer store={store.current} format={format} every={announceEvery} />}
    </Scope.Provider>
  );
}

/** The live region: the latest pointer position, at most once per `every` ms (a throttle, so a pointer that never rests is still announced). */
function CursorAnnouncer({ store, format, every }: { store: CursorStore; format: (at: number) => string; every: number }) {
  const snap = React.useSyncExternalStore(store.subscribe, () => store.snapshot, () => EMPTY);
  const [text, setText] = React.useState("");
  const latest = React.useRef({ snap, format });
  latest.current = { snap, format };
  const last = React.useRef(0);
  const timer = React.useRef<number | undefined>(undefined);
  React.useEffect(() => {
    // Playback moves the cursor every frame and is never spoken; a pointer leaving says nothing.
    if (snap.owner !== "pointer" || snap.at === null) return;
    const speak = () => {
      timer.current = undefined;
      last.current = Date.now();
      const { snap: s, format: f } = latest.current;
      if (s.owner === "pointer" && s.at !== null) setText(f(s.at));
    };
    const wait = last.current + every - Date.now();
    if (wait <= 0) speak();
    else timer.current ??= window.setTimeout(speak, wait);
  }, [snap, every]);
  React.useEffect(() => () => window.clearTimeout(timer.current), []);
  return (
    <p role="status" aria-live="polite" className="sr-only">
      {text}
    </p>
  );
}

/** What a member reads and writes. */
export type SharedCursor = Snapshot & {
  /** This member's own id: positions it writes are not drawn back at it. */
  source: string;
  /** The position another member (or playback) put there, in the scope's unit; null when none or when this member wrote it. */
  other: number | null;
  /** The pointer or keyboard is at `at` over this member (the scope's unit). `null`: it left. */
  setPointer: (at: number | null) => void;
  /** Playback is at `at` (the scope's unit). Call it from the player's clock; `null` when it stops. */
  setPlayback: (at: number | null) => void;
};

/**
 * Join the nearest `CursorScope` as one member. Returns null outside a scope, so a component can take a
 * `cursor` prop and do nothing when the app has not set one up. `source` is this member's id; the
 * default is a unique one.
 */
export function useSharedCursor(source?: string): SharedCursor | null {
  const store = React.useContext(Scope);
  const own = React.useId();
  const id = source ?? own;
  const subscribe = React.useCallback((fn: () => void) => (store ? store.subscribe(fn) : () => {}), [store]);
  const snap = React.useSyncExternalStore(subscribe, () => store?.snapshot ?? EMPTY, () => EMPTY);
  const setPointer = React.useCallback((at: number | null) => store?.setPointer(at, id), [store, id]);
  const setPlayback = React.useCallback((at: number | null) => store?.setPlayback(at, id), [store, id]);
  return React.useMemo(
    () => (store ? { ...snap, source: id, other: snap.at !== null && snap.source !== id ? snap.at : null, setPointer, setPlayback } : null),
    [store, snap, id, setPointer, setPlayback],
  );
}
