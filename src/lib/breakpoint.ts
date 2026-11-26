import * as React from "react";

// "Is the screen narrower than Tailwind's `sm`/`md`/`lg`?", for the one place CSS cannot do it: a
// virtualised table lays its columns out in JavaScript, so a column hidden with `max-sm:hidden`
// would leave its width behind (`DataTable`'s `hideBelow`, issue #339). Everything else hides
// with the `max-*:` variants and no script. The width is read from the theme's `--breakpoint-*`
// when Tailwind emitted it, so an app that moves a breakpoint is followed, else Tailwind's default.

/** A Tailwind breakpoint a column can be hidden below. */
export type Breakpoint = "sm" | "md" | "lg";

const DEFAULTS: Record<Breakpoint, string> = { sm: "40rem", md: "48rem", lg: "64rem" };

function width(name: Breakpoint): string {
  if (typeof document === "undefined") return DEFAULTS[name];
  const v = getComputedStyle(document.documentElement).getPropertyValue(`--breakpoint-${name}`).trim();
  return v || DEFAULTS[name];
}

/** The breakpoints the screen is currently narrower than. Empty on the server and where `matchMedia` is missing (jsdom), so nothing is hidden there. */
export function useNarrowerThan(active: boolean): Set<Breakpoint> {
  const [below, setBelow] = React.useState<Set<Breakpoint>>(() => new Set());
  React.useEffect(() => {
    if (!active || typeof matchMedia !== "function") return;
    const queries = (["sm", "md", "lg"] as const).map(
      (name) => [name, matchMedia(`(width < ${width(name)})`)] as const,
    );
    const read = () => setBelow(new Set(queries.filter(([, q]) => q.matches).map(([name]) => name)));
    read();
    for (const [, q] of queries) q.addEventListener("change", read);
    return () => {
      for (const [, q] of queries) q.removeEventListener("change", read);
    };
  }, [active]);
  return below;
}
