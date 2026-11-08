import * as React from "react";
import { ChevronRight } from "lucide-react";
import { useSearchParams } from "react-router";
import { cn } from "../lib/utils";

// Show more of one thing in place: a batch's faces under its row in a history list, a firing's
// pieces under its line in the log. Strata issue #34, from an app that wrote its own <details>.
//
// Not <details>. A closed <details> still mounts its content, so every row's detail component
// runs, and a list of forty batches makes forty requests on load for bodies nobody opened. Here
// the body is mounted only while it is open: a `useLoad` inside it runs on the first open, and on
// a later open the query cache answers at once. Closed, nothing of the body is in the DOM.
//
// The trigger is a native button (Enter and Space, focus outline from the base layer) with
// `aria-expanded`, and `aria-controls` naming the body while it exists (the WAI-ARIA disclosure
// pattern). Focus stays on the button through open and close, so a keyboard user walks a list of
// rows with Tab and opens each in place. The summary is the button's name, so it holds text and
// marks (a Status, a count), never controls; actions for the row go in `actions`, beside it.
//
// No height animation: people open rows in a list many times a session, and character by
// frequency (ux-research ux-character.md) gives frequent actions no motion. The chevron turns
// with the state, which is the only signal besides the body itself.
//
// Many disclosures over one list share their state through `useExpanded`, which can keep it in
// the URL (`?open=f-0412`), so an opened row survives a reload and can be linked. `DataTable`'s
// `expansion` prop draws the same thing as a detail row under a table row.

/** Open and closed disclosure state: controlled with `open` and `onOpenChange`, or uncontrolled from `defaultOpen`. */
export type DisclosureOpenProps =
  | { open: boolean; onOpenChange: (open: boolean) => void; defaultOpen?: never }
  | { open?: never; onOpenChange?: (open: boolean) => void; defaultOpen?: boolean };

export type DisclosureProps = DisclosureOpenProps & {
  /** The always-visible line, and the button's accessible name: text and marks, no controls. */
  summary: React.ReactNode;
  /** Mounted only while open, so a request inside runs when the person opens it. */
  children: React.ReactNode;
  /** Controls for the row (a `RowAction`), beside the summary and outside its button. */
  actions?: React.ReactNode;
  className?: string;
};

/** Shows more of one thing in place: a button with `aria-expanded` around `summary`, and a body mounted only while open (so a request inside it runs on first open). Controlled with `open`/`onOpenChange` or `useExpanded`, or uncontrolled with `defaultOpen`. */
export function Disclosure({ summary, children, actions, open, defaultOpen = false, onOpenChange, className }: DisclosureProps) {
  const [own, setOwn] = React.useState(defaultOpen);
  const isOpen = open ?? own;
  const bodyId = React.useId();
  const toggle = () => {
    if (open === undefined) setOwn(!isOpen);
    onOpenChange?.(!isOpen);
  };
  return (
    <div className={cn("min-w-0", className)}>
      <div className="flex items-center gap-3">
        <button
          type="button"
          aria-expanded={isOpen}
          aria-controls={isOpen ? bodyId : undefined}
          onClick={toggle}
          className="-mx-1 flex min-h-(--control-h-sm) min-w-0 flex-1 cursor-pointer items-center gap-2 rounded-control px-1 text-left hover:bg-muted"
        >
          <Chevron open={isOpen} />
          <span className="min-w-0 flex-1">{summary}</span>
        </button>
        {actions && <div className="flex shrink-0 items-center gap-2">{actions}</div>}
      </div>
      {isOpen && (
        <div id={bodyId} className="pt-2 pb-3 pl-6">
          {children}
        </div>
      )}
    </div>
  );
}

/** The disclosure chevron: points right when closed, down when open. Shared with `DataTable`'s row toggle. */
export function Chevron({ open, className }: { open: boolean; className?: string }) {
  return <ChevronRight aria-hidden className={cn("size-4 shrink-0 text-muted-foreground", open && "rotate-90", className)} />;
}

/** Which of many disclosures are open, by key: spread into `DataTable`'s `expansion`, or read with `isOpen`/`setOpen` for a list of `Disclosure`s. */
export type Expanded = {
  /** Keys of the open items. */
  expanded: ReadonlySet<string>;
  /** Replaces the open set. `DataTable` calls this. */
  onChange: (next: Set<string>) => void;
  isOpen: (key: string) => boolean;
  setOpen: (key: string, open: boolean) => void;
  collapseAll: () => void;
};

export type ExpandedOptions = {
  /** Keep the open keys in this URL search parameter (`?open=a&open=b`), so an opened row can be linked and survives a reload. Needs a React Router context. */
  param?: string;
  /** Keys open at first. Ignored with `param`: there the URL says what is open, so a link that opens a row carries it. */
  initial?: Iterable<string>;
  /** Opening one closes the others (an accordion). Default false: people compare two rows. */
  single?: boolean;
};

/** Shared open state for the disclosures of one list or table, optionally kept in the URL (`param`). */
export function useExpanded(options: ExpandedOptions = {}): Expanded {
  // One of two hooks, chosen by whether `param` is given; a screen does not switch between the two
  // while mounted (as with DataTable's `sortParam`), so the hook order is stable.
  return options.param ? useUrlExpanded(options.param, options) : useLocalExpanded(options);
}

function api(expanded: ReadonlySet<string>, set: (next: Set<string>) => void, single?: boolean): Expanded {
  return {
    expanded,
    // With `single`, a change that opens a key keeps only that key, so `DataTable` (which calls
    // onChange with the whole set) gets the accordion too, not only `setOpen`.
    onChange: (next) => {
      const opened = single ? [...next].filter((k) => !expanded.has(k)) : [];
      set(opened.length ? new Set([opened[opened.length - 1]]) : next);
    },
    isOpen: (key) => expanded.has(key),
    setOpen: (key, open) => {
      const next = single ? new Set<string>() : new Set(expanded);
      if (open) next.add(key);
      else next.delete(key);
      set(next);
    },
    collapseAll: () => set(new Set()),
  };
}

function useLocalExpanded({ initial = [], single }: ExpandedOptions): Expanded {
  const [expanded, setExpanded] = React.useState<ReadonlySet<string>>(() => new Set(initial));
  return React.useMemo(() => api(expanded, setExpanded, single), [expanded, single]);
}

function useUrlExpanded(param: string, { single }: ExpandedOptions): Expanded {
  const [params, setParams] = useSearchParams();
  const fromUrl = params.getAll(param);
  const joined = fromUrl.join("\u0000");
  // `fromUrl` is a new array each render; its joined form is the dependency.
  const expanded = React.useMemo<ReadonlySet<string>>(() => new Set(fromUrl), [joined]);
  const set = React.useCallback(
    (next: Set<string>) =>
      setParams(
        (p) => {
          const out = new URLSearchParams(p);
          out.delete(param);
          for (const k of next) out.append(param, k);
          return out;
        },
        { replace: true },
      ),
    [param, setParams],
  );
  return React.useMemo(() => api(expanded, set, single), [expanded, set, single]);
}
