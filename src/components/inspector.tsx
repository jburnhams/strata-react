import * as React from "react";
import { ChevronRight, RotateCcw } from "lucide-react";
import { Button as AriaButton, Disclosure, DisclosurePanel, Heading } from "react-aria-components";
import { format } from "../lib/format";
import { cn } from "../lib/utils";
import { IconButton } from "./button";
import { Field } from "./field";

// An inspector shows and edits the properties of whatever is selected (strata issue #74, from a
// video editor's metadata and clip panels). Four parts that compose, so a settings sidebar, a file
// manager's details pane and an editor's property panel are the same few pieces:
//
//   Inspector         the panel: a labelled region, a heading naming the selection, and the empty
//                     state when nothing is selected. Remembers which sections the person closed.
//   InspectorSection  a titled, collapsible group of rows, with room for its few actions.
//   PropertyRow       one editable property: a `Field` (label, hint, error) with an optional
//                     "Reset" that appears only while the value differs from its default.
//   PropertyList      read-only facts as a description list (size, duration, codec, created).
//
// React Aria first. Sections are React Aria's `Disclosure`, which gives the heading + trigger
// button + panel wiring (`aria-expanded`, `aria-controls`, the panel as a labelled region). We
// extend it two ways. React Aria keeps a closed panel in the DOM (`hidden`), so a closed section's
// controls would still be mounted, and in a long inspector that is dozens of controls and any
// request inside them; the body here renders only while the section is open, as `Disclosure`
// does, by reading `isExpanded` from the render props. And the open state is held by the
// Inspector, so it can be remembered. Checked in `Disclosure.d.ts`: no prop unmounts the panel.
// The separator-less look follows patterns.md §2: space and hairlines, never cards, never nested.
//
// Order is the caller's: the research (patterns.md §1) orders blocks by the next question a
// person asks, not by the data model, and a component cannot know that. What the component does is
// make a long panel survivable: every section but the first few can start closed (`defaultOpen`),
// and what the person opens or closes is remembered per `storageKey`.
//
// The selection changing underneath is handled here, not by each app: pass `selectionKey` (the
// selected thing's id) and the sections' bodies remount for a new selection, so no control keeps
// the last item's typed text; if the control that had focus left the DOM, focus goes to the
// panel's heading, not to the page. A deleted selection (`title` null) shows the empty state.
//
// No motion on open and close: people do it many times a session (ux-character.md, by frequency).

type Remembered = Record<string, boolean>;

function readRemembered(key: string | null | undefined): Remembered {
  if (!key) return {};
  try {
    const raw = window.localStorage.getItem(key);
    const parsed: unknown = raw ? JSON.parse(raw) : {};
    return parsed && typeof parsed === "object" ? (parsed as Remembered) : {};
  } catch {
    // Storage throws in private windows and when blocked; the panel then works for this visit.
    return {};
  }
}

type InspectorState = { isOpen: (id: string, defaultOpen: boolean) => boolean; setOpen: (id: string, open: boolean) => void };
const InspectorContext = React.createContext<InspectorState | null>(null);

export type InspectorProps = {
  /** The selection's name, as the panel's heading ("run-02.mp4", "Clip: Title card"). `null` when nothing is selected. */
  title: string | null;
  /** What kind of thing it is, under the heading ("Video", "Text clip"). */
  kind?: string;
  /** Shown when `title` is `null`: an `EmptyState` that says what to select and what appears ("Select a clip on the timeline to change how it looks"). */
  empty: React.ReactNode;
  /** The selected thing's id. A new value remounts the sections' bodies so no control shows the last item's typed text. */
  selectionKey?: string;
  /** localStorage key under which closed and opened sections are remembered. Omit to remember only for this visit. */
  storageKey?: string;
  /** The panel's few actions (a menu, a "Delete"), beside the heading. */
  actions?: React.ReactNode;
  /** A picture or summary of the selection above the sections (a `Thumbnail`). */
  summary?: React.ReactNode;
  /** `InspectorSection`s and `PropertyList`s. */
  children?: React.ReactNode;
  className?: string;
};

/** A panel of properties for the selected thing: a labelled region with a heading, an empty state when `title` is null, and sections whose open state is remembered. */
export function Inspector({ title, kind, empty, selectionKey, storageKey, actions, summary, children, className }: InspectorProps) {
  const headingId = React.useId();
  const [remembered, setRemembered] = React.useState<Remembered>(() => readRemembered(storageKey));
  const root = React.useRef<HTMLElement>(null);
  const heading = React.useRef<HTMLHeadingElement>(null);

  const state = React.useMemo<InspectorState>(
    () => ({
      isOpen: (id, defaultOpen) => remembered[id] ?? defaultOpen,
      setOpen: (id, open) =>
        setRemembered((prev) => {
          const next = { ...prev, [id]: open };
          if (storageKey) {
            try {
              window.localStorage.setItem(storageKey, JSON.stringify(next));
            } catch {
              // Not remembered; still applies to this visit.
            }
          }
          return next;
        }),
    }),
    [remembered, storageKey],
  );

  // When the selection changes and the focused control went with the old one, focus would fall to
  // the page body. Put it on the heading instead, so a keyboard user stays in the panel.
  const hadFocus = React.useRef(false);
  React.useEffect(() => {
    const el = root.current;
    const onFocus = () => (hadFocus.current = true);
    const onBlur = (e: FocusEvent) => {
      if (!e.relatedTarget) return; // focus left to nowhere: decided in the effect below
      hadFocus.current = false;
    };
    el?.addEventListener("focusin", onFocus);
    el?.addEventListener("focusout", onBlur);
    return () => {
      el?.removeEventListener("focusin", onFocus);
      el?.removeEventListener("focusout", onBlur);
    };
  }, []);
  React.useEffect(() => {
    if (hadFocus.current && (document.activeElement === document.body || !document.activeElement)) (heading.current ?? root.current)?.focus(); // the panel itself when the heading is gone (nothing selected)
  }, [selectionKey, title]);

  return (
    <InspectorContext.Provider value={state}>
      <aside ref={root} tabIndex={-1} aria-labelledby={title === null ? undefined : headingId} aria-label={title === null ? "Properties" : undefined} className={cn("min-w-0", className)}>
        {title === null ? (
          empty
        ) : (
          <div className="grid grid-cols-1 gap-4">
            <header className="flex items-start gap-3">
              <div className="min-w-0 flex-1">
                <Heading level={2} id={headingId} ref={heading} tabIndex={-1} title={title} className="truncate type-heading outline-offset-2">
                  {title}
                </Heading>
                {kind && <p className="type-body-sm text-muted-foreground">{kind}</p>}
              </div>
              {actions && <div className="flex shrink-0 items-center gap-1">{actions}</div>}
            </header>
            {summary}
            <div key={selectionKey} className="grid grid-cols-1 *:min-w-0">
              {children}
            </div>
          </div>
        )}
      </aside>
    </InspectorContext.Provider>
  );
}

export type InspectorSectionProps = {
  /** Identifies the section for remembering, stable across selections of the same kind ("audio", "text-style"). */
  id: string;
  title: string;
  /** Open when the person has not chosen. Default true; start the few that answer the next question open and the rest closed. */
  defaultOpen?: boolean;
  /** The section's few actions (add, reset all), beside its heading and outside its toggle. Name them for the section ("Add track"). */
  actions?: React.ReactNode;
  /** Mounted only while the section is open. */
  children: React.ReactNode;
  className?: string;
};

/** A titled group of rows that collapses. The body is mounted only while open; the open state is remembered by the surrounding `Inspector` (and held locally outside one). */
export function InspectorSection({ id, title, defaultOpen = true, actions, children, className }: InspectorSectionProps) {
  const inspector = React.useContext(InspectorContext);
  const [own, setOwn] = React.useState(defaultOpen);
  const expanded = inspector ? inspector.isOpen(id, defaultOpen) : own;
  const onChange = (open: boolean) => (inspector ? inspector.setOpen(id, open) : setOwn(open));
  return (
    <Disclosure isExpanded={expanded} onExpandedChange={onChange} className={cn("min-w-0 border-t border-border first:border-t-0", className)}>
      {({ isExpanded }) => (
        <>
          <div className="flex items-center gap-2">
            <Heading level={3} className="min-w-0 flex-1">
              <AriaButton
                slot="trigger"
                className="-mx-1 flex min-h-(--control-h-sm) w-full cursor-pointer items-center gap-2 rounded-control px-1 text-left type-label hover:bg-muted"
              >
                <ChevronRight aria-hidden className={cn("size-4 shrink-0 text-muted-foreground", isExpanded && "rotate-90")} />
                <span className="min-w-0 flex-1 truncate">{title}</span>
              </AriaButton>
            </Heading>
            {actions && <div className="flex shrink-0 items-center gap-1">{actions}</div>}
          </div>
          <DisclosurePanel>{isExpanded && <div className="grid grid-cols-1 gap-4 pt-2 pb-4 pl-6 *:min-w-0">{children}</div>}</DisclosurePanel>
        </>
      )}
    </Disclosure>
  );
}

export type PropertyRowProps = {
  label: string;
  hint?: React.ReactNode;
  error?: string;
  /** Whether the value differs from its default. With `onReset`, shows a "Reset" button named for the property. */
  modified?: boolean;
  /** Puts the value back to its default. */
  onReset?: () => void;
  /** The control: an `Input`, `NumberField`, `Slider`, `NativeSelect`… It picks up the label from the row. */
  children: React.ReactNode;
  className?: string;
};

/** One editable property: a `Field` (label, hint, error wired to the control) with a "Reset <label>" that shows only while `modified`. */
export function PropertyRow({ label, hint, error, modified, onReset, children, className }: PropertyRowProps) {
  const reset =
    modified && onReset ? <IconButton icon={RotateCcw} label={`Reset ${label.toLowerCase()}`} onClick={onReset} /> : undefined;
  return (
    <Field label={label} hint={hint} error={error} action={reset} className={className}>
      {children}
    </Field>
  );
}

export type Property = {
  /** The fact's name ("Frame rate"). */
  term: string;
  /** Its value. `null` or `undefined` prints the missing mark; a string is truncated with the whole value in a tooltip. */
  value: React.ReactNode | null | undefined;
  /** A unit, joined with a non-breaking space and muted. */
  unit?: string;
};

export type PropertyListProps = {
  items: readonly Property[];
  /** Names the list for a screen reader ("Video details") when a visible heading does not. */
  label?: string;
  className?: string;
};

/** Read-only facts as a description list: term left, value right, long strings truncated with the full value on hover, a missing value printed as an en dash, units muted after a non-breaking space. */
export function PropertyList({ items, label, className }: PropertyListProps) {
  return (
    <dl aria-label={label} className={cn("grid gap-y-1.5", className)}>
      {items.map(({ term, value, unit }) => {
        const missing = value === null || value === undefined || value === "";
        return (
          // A wrapping div per pair is valid inside <dl> and keeps term and value on one row.
          <div key={term} className="grid grid-cols-5 gap-x-3 type-body-sm">
            <dt className="col-span-2 min-w-0 text-muted-foreground">{term}</dt>
            <dd className="col-span-3 min-w-0 tabular-nums">
              <span className="block truncate" title={typeof value === "string" ? value : undefined}>
                {missing ? (
                  <>
                    <span aria-hidden>{format.missing}</span>
                    <span className="sr-only">Not known</span>
                  </>
                ) : (
                  value
                )}
                {!missing && unit && <span className="text-muted-foreground">{` ${unit}`}</span>}
              </span>
            </dd>
          </div>
        );
      })}
    </dl>
  );
}
