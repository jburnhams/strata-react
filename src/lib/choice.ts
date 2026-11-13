// The rules for a choice that implies others (strata-react issue #222, from strata-360's "redo"
// dialog: choose a stage and the stages that depend on it are chosen too, and a person must see why
// something is ticked that they did not tick). Pure, so the rules are tested without a DOM and
// `useSelection` (rows) and `useChoices` (a lazy tree, with no rows to prune to) share one set.
//
// Two sets, never one:
// - **explicit**: what the person (or `initial`) chose. This is the only state kept.
// - **all**: explicit plus everything reachable through `implies`, followed transitively with a
//   guard for cycles. Derived on every read, so clearing what implied a key lets it go, and an
//   `implies` that changes with the data is always applied to the current choice.
//
// A key some chosen key implies is **locked**: it cannot be cleared on its own, only by clearing
// what implied it. A change that asks for it is refused (the key stays chosen) and reported, so the
// screen can say so. A key that is implied but was not itself chosen is a **dependent**: it is what
// "4 that depend on them" counts.

/** What a chosen key brings with it: keys, or nothing. */
export type Implies = (key: string) => Iterable<string> | null | undefined;

/** The derived sets for one explicit choice. */
export type Resolved = {
  /** Explicit and implied keys. */
  all: Set<string>;
  /** Keys some chosen key implies: cannot be cleared on their own. */
  locked: Set<string>;
  /** Implied keys that were not chosen themselves. */
  dependents: Set<string>;
  /** For each locked key, the chosen keys that bring it (directly or through others). */
  because: Map<string, string[]>;
};

export function resolve(explicit: ReadonlySet<string>, implies?: Implies): Resolved {
  const all = new Set(explicit);
  const because = new Map<string, string[]>();
  if (implies) {
    for (const root of explicit) {
      const seen = new Set<string>([root]);
      const queue = [root];
      while (queue.length) {
        const key = queue.shift()!;
        for (const next of implies(key) ?? []) {
          if (seen.has(next)) continue;
          seen.add(next);
          queue.push(next);
          all.add(next);
          because.set(next, [...(because.get(next) ?? []), root]);
        }
      }
    }
  }
  const locked = new Set(because.keys());
  const dependents = new Set([...locked].filter((k) => !explicit.has(k)));
  return { all, locked, dependents, because };
}

/** What a change did, for the sentence that announces it. */
export type ChoiceChange = { explicit: Set<string>; added: number; dropped: number; refused: number };

/**
 * Apply a surface's request for the set it wants shown chosen (`next`, what a tree or table gives
 * back) to the explicit choice. A dependent (implied, not chosen) in `next` is not made explicit
 * (it is already in), and one missing from `next` is put back, not cleared.
 */
export function applyChange(explicit: ReadonlySet<string>, next: ReadonlySet<string>, implies?: Implies): ChoiceChange {
  const before = resolve(explicit, implies);
  const wanted = new Set([...next].filter((k) => !before.dependents.has(k)));
  const after = resolve(wanted, implies);
  // Asked to be cleared and still in: something chosen depends on it.
  const refused = [...before.all].filter((k) => !next.has(k) && after.all.has(k)).length;
  const added = [...after.dependents].filter((k) => !before.all.has(k)).length;
  const dropped = [...before.all].filter((k) => !after.all.has(k)).length;
  return { explicit: wanted, added, dropped, refused };
}

/** The sentence a screen reader hears for a change, or "" when nothing worth saying happened. */
export function noteFor({ added, dropped, refused }: Pick<ChoiceChange, "added" | "dropped" | "refused">): string {
  const parts: string[] = [];
  if (added > 0) parts.push(added === 1 ? "1 more chosen because it depends on it" : `${added} more chosen because they depend on it`);
  if (dropped > 0 && added === 0) parts.push(dropped === 1 ? "1 fewer chosen" : `${dropped} fewer chosen`);
  if (refused > 0) parts.push(refused === 1 ? "1 stays chosen because something chosen depends on it" : `${refused} stay chosen because something chosen depends on them`);
  return parts.join(". ");
}
