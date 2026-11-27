import * as React from "react";

// One of a few things to press pulses at a time, in a random order, to show a young learner what to press
// (ChoiceGrid's tiles and PlaceBoard's pile, `beckon`; Flashtap's owner, 2026-11-27). A random order, never the same
// one twice running, so it reads as "any of these" rather than pointing at one; the first pulse waits one beat, so
// a spoken prompt is heard first. The pulse itself is the `beckon` utility (strata.bare.css), which starts and ends at
// rest and is collapsed by reduced motion.

/** The thing to pulse next: any of `open` but `last`, at random (or the only one). */
export function nextBeckon(open: readonly string[], last: string | null): string | null {
  const others = open.length > 1 ? open.filter((k) => k !== last) : open;
  return others[Math.floor(Math.random() * others.length)] ?? null;
}

const SEP = "\u0000";

/** Which of `open` pulses now, moving every `ms` while `on`; null when off or none is open. */
export function useBeckon(on: boolean, open: readonly string[], ms: number): string | null {
  const [lit, setLit] = React.useState<string | null>(null);
  const openKey = open.join(SEP); // by value, so a new array each render does not restart the beat
  React.useEffect(() => {
    if (!on || openKey === "") return;
    const keys = openKey.split(SEP);
    let last: string | null = null;
    const t = setInterval(() => {
      last = nextBeckon(keys, last);
      setLit(last);
    }, ms);
    return () => {
      clearInterval(t);
      setLit(null);
    };
  }, [on, openKey, ms]);
  return lit !== null && open.includes(lit) ? lit : null;
}

/** A tile's picture: the `type-picture` step, but never more than 75% of the tile it sits in (the tile is a size
 * container), so an app that grows the step on a wide screen does not push a picture out of a small tile. */
export const pictureInTile = { fontSize: "min(var(--type-picture-size, 4.5rem), 75cqi)" } as const;
