import * as React from "react";
import { useSearchParams } from "react-router";

// "Anything a person would link or reload into (tab, sort, filter, page, open item) is in the URL."
// Tabs (`param=`), DataTable (`sortParam`) and `useExpanded({ param })` already do; a plain filter or
// choice did not, so each app wrote the same `setParams(p => { new URLSearchParams(p) … })` (#297).
// Rules fixed here once: the default is never written (the plain URL stays plain, as `Tabs` does),
// a value that does not parse reads as the default (a stale or hand-edited link must not break the
// screen), other params are kept, and a filter replaces the history entry (Back leaves the screen,
// it does not walk through every filter change; `replace: false` for a choice worth a Back step).

/** Options of `useSearchParam`. */
export type SearchParamOptions<T extends string> = {
  /** Read when the param is missing or invalid; setting it removes the param. */
  default: T;
  /** Says whether a raw value is allowed: a type guard (`isMode`), or a function that returns the typed value or `undefined`. */
  parse?: (raw: string) => T | boolean | undefined;
  /** Replace the history entry instead of adding one. Default `true`, since most params are filters. */
  replace?: boolean;
};

/** What `useSearchParam` returns: the value, and a setter that takes the next value or `null` for the default. */
export type SearchParam<T extends string> = readonly [T, (next: T | null) => void];

/**
 * One value held in a URL search parameter (React Router): `const [mode, setMode] = useSearchParam("mode", { default: "all", parse: isMode })`.
 * Reads and validates it, drops the param when set to the default or `null`, keeps the others, and replaces the history entry by default.
 */
export function useSearchParam<T extends string = string>(key: string, { default: fallback, parse, replace = true }: SearchParamOptions<T>): SearchParam<T> {
  const [params, setParams] = useSearchParams();
  const raw = params.get(key);
  let value = fallback;
  if (raw !== null) {
    const parsed = parse ? parse(raw) : (raw as T);
    if (parsed === true) value = raw as T;
    else if (typeof parsed === "string") value = parsed;
  }
  const set = React.useCallback(
    (next: T | null) =>
      setParams(
        (p) => {
          const out = new URLSearchParams(p);
          if (next === null || next === fallback) out.delete(key);
          else out.set(key, next);
          return out;
        },
        { replace },
      ),
    [key, fallback, replace, setParams],
  );
  return [value, set];
}
