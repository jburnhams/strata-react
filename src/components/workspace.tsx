import * as React from "react";
import { useMove, mergeProps } from "react-aria";
import {
  PanelBottomClose,
  PanelBottomOpen,
  PanelLeftClose,
  PanelLeftOpen,
  PanelRightClose,
  PanelRightOpen,
  PanelTopClose,
  PanelTopOpen,
} from "lucide-react";
import { IconButton } from "./button";
import { cn } from "../lib/utils";

// A screen that is a workspace of panes: a stage in the middle, side panels, a bottom panel, a bar
// across the top (strata-react issue #68, from strata-vid; ux-research components.md §3.20). It is
// for tools (editors, IDE-style screens, mail with a reading pane), where the person sizes the
// screen to the job and the same screen stays on view together. `AppShell` is for moving between
// screens; this is for one screen with many regions.
//
// Shape: `<Workspace label state>` holds `<Split direction>`s, which hold `<Pane>`s and other
// `<Split>`s. A pane with `grow` takes what is left; any other pane has a size the person sets.
// Between a fixed pane and its neighbour sits a separator that controls the fixed one.
//
// - Panes are regions. Each is a `section` named by its own header, so a screen-reader user can
//   move between them by landmark, and every pane in an app has the same header: its name, the
//   few `actions` it owns, and a collapse button. A pane is a region, never a card (patterns.md §2).
// - The separator is the window-splitter pattern: `role="separator"` with `aria-valuenow`, `-min`
//   and `-max`, in the tab order. Arrow keys move it by 10px (Shift: 50), Home and End go to the
//   limits, Enter or a double-click restores the default size. Pointer drag, touch and the arrow
//   keys are React Aria's `useMove`.
// - Limits: a pane never goes under its `min` or over its `max`, and the window shrinking takes
//   from the panes only down to their `min` (flex shrink with `min-width`), while the central pane
//   keeps its own minimum, so the stage never disappears. A drag stops where the central pane would
//   fall under its minimum.
// - Collapse. A collapsible pane folds to a rail one control wide (beside the stage) or to its
//   header bar (above or below it), with a visible "Show Library" button, so there is always a way
//   back. `state.toggle(id)` does it from outside (a View menu, a shortcut). A collapsed pane's
//   body stays mounted but hidden, so what is in it (a timeline's scroll, a form) is kept.
// - Remembered: `useWorkspaceState("editor")` keeps sizes and collapsed panes in localStorage, in
//   try/catch (storage throws in private windows and with blocked site data), so the app writes no
//   storage code and a failure falls back to the defaults.
// - Narrow: below `narrowBelow` (720px of the workspace's own width) side-by-side splits stack, and
//   their collapsible panes start folded to their header bars, one tap to open. That is a rule of the
//   component so every app does the same thing; it is not remembered, since it is the width and not
//   a choice.
// - Density comes from the tokens: header and rail sizes are `--control-h`.
// Motion: none. Resizing and folding are done many times a session (character.md §3).
//
// Checked for React Aria first: react-aria-components 1.22 has no splitter or panel part (its
// `Separator` is a static rule, and `useSeparator` is for a non-focusable one), and the table's column
// resizing is its own. So the layout is ours, on `useMove` for the interaction.

type Persisted = { sizes: Record<string, number>; collapsed: Record<string, boolean> };

const readPersisted = (key: string | undefined): Persisted => {
  const empty: Persisted = { sizes: {}, collapsed: {} };
  if (!key) return empty;
  try {
    const raw = JSON.parse(window.localStorage.getItem(`strata:workspace:${key}`) ?? "null") as Partial<Persisted> | null;
    if (!raw || typeof raw !== "object") return empty;
    const sizes: Record<string, number> = {};
    for (const [k, v] of Object.entries(raw.sizes ?? {})) if (typeof v === "number" && Number.isFinite(v)) sizes[k] = v;
    const collapsed: Record<string, boolean> = {};
    for (const [k, v] of Object.entries(raw.collapsed ?? {})) if (typeof v === "boolean") collapsed[k] = v;
    return { sizes, collapsed };
  } catch {
    return empty;
  }
};

/** What `useWorkspaceState` returns: pass it to `Workspace`, and use it from outside (a menu, a shortcut) to fold or reset panes. */
export type WorkspaceState = {
  /** Whether a pane is folded now. `fallback` is the pane's `defaultCollapsed`. */
  isCollapsed: (id: string, fallback?: boolean) => boolean;
  setCollapsed: (id: string, collapsed: boolean) => void;
  /** Folds an open pane, opens a folded one. */
  toggle: (id: string) => void;
  /** Forgets every size and fold, back to the defaults. */
  reset: () => void;
  /** @internal */
  sizeOf: (id: string) => number | undefined;
  /** @internal */
  setSize: (id: string, size: number | null) => void;
  /** @internal */
  narrow: boolean;
  /** @internal */
  setNarrow: (narrow: boolean) => void;
};

/** The sizes and folded panes of a `Workspace`; with `persist`, remembered in localStorage under that name. */
export function useWorkspaceState(persist?: string): WorkspaceState {
  const [saved, setSaved] = React.useState<Persisted>(() => readPersisted(persist));
  const [narrow, setNarrow] = React.useState(false);
  const [narrowOpen, setNarrowOpen] = React.useState<Record<string, boolean>>({});

  React.useEffect(() => {
    if (!persist) return;
    try {
      window.localStorage.setItem(`strata:workspace:${persist}`, JSON.stringify(saved));
    } catch {
      // Storage is a convenience; a workspace that cannot remember still works.
    }
  }, [persist, saved]);

  return React.useMemo<WorkspaceState>(() => {
    const isCollapsed = (id: string, fallback = false) => (narrow ? !narrowOpen[id] : (saved.collapsed[id] ?? fallback));
    const setCollapsed = (id: string, collapsed: boolean) => {
      if (narrow) setNarrowOpen((o) => ({ ...o, [id]: !collapsed }));
      else setSaved((s) => ({ ...s, collapsed: { ...s.collapsed, [id]: collapsed } }));
    };
    return {
      isCollapsed,
      setCollapsed,
      toggle: (id) => setCollapsed(id, !isCollapsed(id, undefined)),
      reset: () => setSaved({ sizes: {}, collapsed: {} }),
      sizeOf: (id) => saved.sizes[id],
      setSize: (id, size) =>
        setSaved((s) => {
          const sizes = { ...s.sizes };
          if (size === null) delete sizes[id];
          else sizes[id] = Math.round(size);
          return { ...s, sizes };
        }),
      narrow,
      setNarrow,
    };
  }, [saved, narrow, narrowOpen]);
}

const StateContext = React.createContext<WorkspaceState | null>(null);
const useState_ = () => {
  const state = React.useContext(StateContext);
  if (!state) throw new Error("strata-react: a Pane or Split must be inside a Workspace.");
  return state;
};

type Slot = { direction: "row" | "column"; edge: "start" | "end" | "only"; stacked: boolean };
const SlotContext = React.createContext<Slot>({ direction: "row", edge: "only", stacked: false });

/** The workspace: a labelled region that holds the splits and panes, and stacks them when narrow. */
export function Workspace({
  label,
  state,
  narrowBelow = 720,
  className,
  children,
}: {
  label: string;
  state: WorkspaceState;
  /** Stack side-by-side splits when the workspace is narrower than this many pixels. Default 720. */
  narrowBelow?: number;
  className?: string;
  children: React.ReactNode;
}) {
  const ref = React.useRef<HTMLDivElement>(null);
  const { setNarrow } = state;
  React.useLayoutEffect(() => {
    const el = ref.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    const measure = () => {
      const width = el.getBoundingClientRect().width;
      setNarrow(width > 0 && width < narrowBelow);
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => observer.disconnect();
  }, [narrowBelow, setNarrow]);

  return (
    <StateContext.Provider value={state}>
      <div ref={ref} role="group" aria-label={label} className={cn("flex h-full min-h-0 min-w-0 flex-col overflow-hidden bg-background", className)}>
        {children}
      </div>
    </StateContext.Provider>
  );
}

/** What a `Pane` is, for the split that lays it out. */
export type PaneProps = {
  /** Identifies the pane in the remembered state: unique in the workspace. */
  id: string;
  /** The pane's name, in its header and as its landmark: "Library", "Inspector". */
  name: string;
  /** Takes the space the fixed panes leave. One per split (a nested `Split` always does). */
  grow?: boolean;
  /** Starting size in pixels (width beside the stage, height above or below it). Default 280. */
  size?: number;
  /** Smallest size in pixels. Default 160; for a growing pane, the least it keeps (default 240 wide, 120 high). */
  min?: number;
  /** Largest size in pixels. Default none. */
  max?: number;
  /** Shows a collapse button in the header and lets the pane fold to a rail or its header. */
  collapsible?: boolean;
  /** Starts folded until the person opens it. */
  defaultCollapsed?: boolean;
  /** The pane's few actions, drawn in its header before the collapse button. */
  actions?: React.ReactNode;
  className?: string;
  children?: React.ReactNode;
};

const iconsFor = (direction: "row" | "column", edge: Slot["edge"], stacked: boolean) => {
  if (stacked || direction === "column") return edge === "start" ? [PanelTopClose, PanelTopOpen] : [PanelBottomClose, PanelBottomOpen];
  return edge === "end" ? [PanelRightClose, PanelRightOpen] : [PanelLeftClose, PanelLeftOpen];
};

/** A region of a workspace with a consistent header (name, actions, fold button) and a body that scrolls. */
export function Pane({ id, name, grow, size = 280, min, max, collapsible, defaultCollapsed, actions, className, children }: PaneProps) {
  const state = useState_();
  const { direction, edge, stacked } = React.useContext(SlotContext);
  const headingId = React.useId();
  const folded = Boolean(collapsible) && state.isCollapsed(id, defaultCollapsed);
  const rail = folded && direction === "row" && !stacked;
  const least = min ?? (grow ? (direction === "row" ? 240 : 120) : 160);
  const current = state.sizeOf(id) ?? size;
  const [closeIcon, openIcon] = iconsFor(direction, edge, stacked);

  const style: React.CSSProperties = grow
    ? { flex: "1 1 0%", [direction === "row" ? "minWidth" : "minHeight"]: least }
    : folded
      ? { flex: "0 0 auto" }
      : stacked
        ? { flex: "0 1 auto", maxHeight: "50%" }
        : {
            flex: `0 1 ${Math.max(least, Math.min(current, max ?? Infinity))}px`,
            [direction === "row" ? "minWidth" : "minHeight"]: least,
            ...(max ? { [direction === "row" ? "maxWidth" : "maxHeight"]: max } : {}),
          };

  return (
    <section
      id={`pane-${id}`}
      aria-labelledby={headingId}
      data-pane={id}
      data-collapsed={folded || undefined}
      data-grow={grow || undefined}
      data-min={grow ? least : undefined}
      data-size={grow || folded ? undefined : current}
      style={style}
      className={cn("flex min-h-0 min-w-0 flex-col overflow-hidden bg-background", rail && cn("w-(--control-h) items-center", edge === "end" ? "border-l border-border" : "border-r border-border"), className)}
    >
      <header className={cn("flex shrink-0 items-center gap-1 pl-3 pr-1", rail ? "h-auto flex-col py-1 pl-1" : "h-(--control-h) border-b border-border")}>
        <h2 id={headingId} className={cn("type-label min-w-0 flex-1 truncate", rail && "sr-only")}>
          {name}
        </h2>
        {!folded && actions}
        {collapsible && (
          <IconButton
            size="sm"
            icon={folded ? openIcon : closeIcon}
            label={folded ? `Show ${name}` : `Hide ${name}`}
            aria-expanded={!folded}
            aria-controls={`pane-body-${id}`}
            onPress={() => state.toggle(id)}
          />
        )}
      </header>
      <div id={`pane-body-${id}`} hidden={folded} className="min-h-0 min-w-0 flex-1 overflow-auto">
        {children}
      </div>
    </section>
  );
}

type PaneElement = React.ReactElement<PaneProps>;
const isPane = (c: React.ReactNode): c is PaneElement => React.isValidElement(c) && c.type === Pane;

const clamp = (n: number, lo: number, hi: number) => Math.min(Math.max(n, lo), hi);

function Separator({
  pane,
  direction,
  sign,
  container,
}: {
  pane: PaneProps;
  direction: "row" | "column";
  /** +1 when the controlled pane is before the separator, -1 when after. */
  sign: 1 | -1;
  container: React.RefObject<HTMLDivElement | null>;
}) {
  const state = useState_();
  const [moving, setMoving] = React.useState(false);
  const min = pane.min ?? 160;
  const start = pane.size ?? 280;
  const size = state.sizeOf(pane.id) ?? start;
  const latest = React.useRef(size);
  latest.current = size;

  // How far the controlled pane can grow before the stage falls under its own minimum. Only when the
  // layout has been measured (jsdom has none), and never under `min`.
  const room = () => {
    const root = container.current;
    const kids = Array.from(root?.children ?? []) as HTMLElement[];
    const own = kids.find((el) => el.dataset.pane === pane.id);
    const stage = kids.find((el) => el.dataset.grow !== undefined || el.dataset.split !== undefined);
    if (!own || !stage) return Infinity;
    const dim = direction === "row" ? "width" : "height";
    const stageSize = stage.getBoundingClientRect()[dim];
    if (stageSize <= 0) return Infinity;
    const stageMin = Number(stage.dataset.min ?? 0);
    return own.getBoundingClientRect()[dim] + stageSize - stageMin;
  };
  const upper = () => Math.max(min, Math.min(pane.max ?? Infinity, room()));
  const apply = (next: number) => state.setSize(pane.id, clamp(next, min, upper()));

  const { moveProps } = useMove({
    onMoveStart: () => setMoving(true),
    onMove: ({ deltaX, deltaY, pointerType, shiftKey }) => {
      const delta = (direction === "row" ? deltaX : deltaY) * (pointerType === "keyboard" ? (shiftKey ? 50 : 10) : 1);
      if (!delta) return;
      const next = clamp(latest.current + sign * delta, min, upper());
      latest.current = next;
      apply(next);
    },
    onMoveEnd: () => setMoving(false),
  });

  const restore = () => state.setSize(pane.id, null);
  const keys = {
    onKeyDown: (e: React.KeyboardEvent) => {
      if (e.key === "Home") apply(min);
      else if (e.key === "End") apply(upper());
      else if (e.key === "Enter") restore();
      else return;
      e.preventDefault();
    },
    onDoubleClick: restore,
  };

  const vertical = direction === "row";
  return (
    <div
      role="separator"
      tabIndex={0}
      aria-orientation={vertical ? "vertical" : "horizontal"}
      aria-label={`Resize ${pane.name}`}
      aria-controls={`pane-${pane.id}`}
      aria-valuenow={Math.round(size)}
      aria-valuemin={min}
      aria-valuemax={Number.isFinite(pane.max ?? Infinity) ? pane.max : undefined}
      data-moving={moving || undefined}
      {...mergeProps(moveProps, keys)}
      className={cn(
        "relative shrink-0 touch-none bg-border transition-state hover:bg-primary focus-visible:bg-primary data-[moving]:bg-primary",
        vertical ? "w-px cursor-col-resize before:absolute before:inset-y-0 before:-inset-x-1" : "h-px cursor-row-resize before:absolute before:inset-x-0 before:-inset-y-1",
        "pointer-coarse:before:-inset-x-2",
      )}
    />
  );
}

/** Lays its children out in a row or a column, with a separator between a fixed pane and its neighbour. A nested split takes the space the fixed panes leave. */
export function Split({ direction, className, children }: { direction: "row" | "column"; className?: string; children: React.ReactNode }) {
  const state = useState_();
  const ref = React.useRef<HTMLDivElement>(null);
  const stacked = direction === "row" && state.narrow;
  const effective = stacked ? "column" : direction;
  const items = React.Children.toArray(children);
  const slotted = (c: React.ReactNode) => isPane(c) || (React.isValidElement(c) && c.type === Split);
  const grows = (c: React.ReactNode) => (isPane(c) ? Boolean(c.props.grow) : true);

  const out: React.ReactNode[] = [];
  items.forEach((child, i) => {
    const growIndex = items.findIndex((c) => slotted(c) && grows(c));
    const edge: Slot["edge"] = growIndex < 0 ? "only" : i < growIndex ? "start" : i > growIndex ? "end" : "only";
    out.push(
      <SlotContext.Provider key={React.isValidElement(child) && child.key != null ? child.key : i} value={{ direction: effective, edge, stacked }}>
        {child}
      </SlotContext.Provider>,
    );
    const next = items[i + 1];
    if (next === undefined || !slotted(child) || !slotted(next)) return;
    const fixed = (c: React.ReactNode) => isPane(c) && !c.props.grow && !(c.props.collapsible && state.isCollapsed(c.props.id, c.props.defaultCollapsed));
    const before = fixed(child);
    const after = fixed(next);
    if (stacked || (!before && !after)) return;
    const controlled = (before ? child : next) as PaneElement;
    out.push(<Separator key={`sep-${i}`} pane={controlled.props} direction={effective} sign={before ? 1 : -1} container={ref} />);
  });

  const growPane = items.find((c): c is PaneElement => isPane(c) && Boolean(c.props.grow));
  return (
    <div
      ref={ref}
      data-split={direction}
      data-min={growPane ? (growPane.props.min ?? (direction === "row" ? 240 : 120)) : undefined}
      className={cn("flex min-h-0 min-w-0 flex-1", effective === "row" ? "flex-row" : "flex-col", className)}
    >
      {out}
    </div>
  );
}
