import * as React from "react";
import { isDev } from "../lib/dev";

// Which player the page's keys belong to (strata-react issues #147 and #385). A page with one player binds them
// for it, as ever. With several, binding Space once per player played and paused every one of them at once, so the
// keys go to the player last used (played, focused or pressed) and the others leave them alone (#147, from
// strata-models' blind A/B of two voices). The store was inside `MediaPlayer`; it is its own piece so a transport
// the app owns (`useTimeline`, a `Transport` over a stage) joins the same rule and a `MediaPlayer` beside it and
// the stage's own keys are not three owners of the arrow keys (#385). It is a tiny store outside React so the
// players on a page can see each other without a provider the app would have to add.
const members = new Set<string>();
let active: string | null = null;
let warned = false;
let snapshot = { count: 0, active: null as string | null };
const listeners = new Set<() => void>();
const emit = () => {
  snapshot = { count: members.size, active };
  listeners.forEach((l) => l());
};
const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => void listeners.delete(l);
};
const get = () => snapshot;

export type KeyOwner = {
  /** Whether this player's keys are live: it is the only one on the page, or the one last used. */
  owns: boolean;
  /** Take the keys (the player was focused or pressed). */
  claim: () => void;
};

/**
 * Joins the page's key owners while `enabled`, and takes the keys whenever `playing` turns true. Spread nothing: call
 * `claim` from the region's focus and pointer-down handlers, and bind the player's `useHotkeys` with `enabled: owner.owns`.
 */
export function useKeyOwner(enabled: boolean, playing = false): KeyOwner {
  const id = React.useId();
  React.useEffect(() => {
    if (!enabled) return;
    members.add(id);
    if (members.size === 2 && !warned && isDev()) {
      warned = true;
      console.warn("strata-react: several players are on this page, so Space, K, J, L and M go to the one last played or focused. Pass shortcuts={false} to one you bind your own keys for.");
    }
    emit();
    return () => {
      members.delete(id);
      if (active === id) active = null;
      emit();
    };
  }, [id, enabled]);
  const page = React.useSyncExternalStore(subscribe, get, get);
  const claim = React.useCallback(() => {
    // A player with its keys off is not registered and must not take them from the others.
    if (active === id || !members.has(id)) return;
    active = id;
    emit();
  }, [id]);
  React.useEffect(() => {
    if (playing && enabled) claim();
  }, [playing, enabled, claim]);
  // A player with its keys off never owns them, even when it is alone on the page.
  return { owns: enabled && (page.count <= 1 || page.active === id), claim };
}
