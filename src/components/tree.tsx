import * as React from "react";
import { Button as AriaButton, ListLayout, Tree as AriaTree, TreeItem, TreeItemContent, Virtualizer, type Selection } from "react-aria-components";
import { ChevronRight, CircleAlert, Folder, FolderOpen, Lock } from "lucide-react";
import { cn } from "../lib/utils";
import { Button } from "./button";
import { TableSelectionCheckbox } from "./checkbox";
import type { Choices } from "./selection";
import type { Load } from "./data-view";
import type { Expanded } from "./disclosure";

// A hierarchy that loads as it opens. Issue #188, from strata-360's folder browser: the server's
// disk is far too big to send, so each folder's children are read when it is first opened.
//
// React Aria's `Tree` (checked in its types, v1.22: `Expandable` keys, `hasChildItems`, a
// `slot="chevron"` button, `Virtualizer` with `ListLayout`), not our own: it gives the `treegrid`
// roles, arrows (Right opens or goes in, Left closes or goes out), Home/End, type-ahead over each
// row's `textValue`, and single selection. Ours is what sits around it: where the children come from,
// what a node shows while that is happening, and where the open state lives.
//
// Children come from `useChildren(node)`, a hook (a `useLoad` over the app's read) called by a
// component that exists only while the node is open, so a closed branch makes no request and the
// query cache answers a second opening at once. Each open node is its own small state: a skeleton
// row while it loads, a row naming the failure with Try again in place if it fails, and an empty
// row ("No folders") when there is nothing in it. These rows are not selectable and are named for
// what they are, so a keyboard user is told, not left on a blank.
//
// The open set is `Expanded` from `useExpanded`, so it can live in the URL (`?open=…`) like a
// `Disclosure`'s and survive a reload. A branch that is open on load fetches its children as it
// mounts. Selection is one key (a controlled `selected`), reported with the node.
//
// Long trees: the tree is always inside React Aria's `Virtualizer` (`ListLayout`), so it draws only
// the visible rows however many are open (a folder of 500 children, or 100 folders each opened).
// It is always, not from some count, because rows appear as branches open and a Virtualizer added
// at the hundredth row would remount the tree and lose the person's place; a short tree costs
// nothing extra (as with `InfiniteList`). The scroll box is bounded by `height`.
//
// Choosing several (issue #222, a "redo" dialog: clips by stage, where choosing a stage chooses the
// stages that depend on it). `choices` (from `useChoices`) switches the tree to React Aria's
// multiple selection, which gives the checkbox per row, Shift-click ranges in the order shown, and
// Ctrl/Cmd+A. React Aria has no parent-child rule, so ours is drawn from what has loaded: a branch
// is checked when all its loaded descendants are chosen, mixed when only some are (or it is chosen
// itself and some are not), and ticking it sets itself and everything loaded under it. A branch
// never opened is read first (Jonathan, 2026-11-13: "as if it had been expanded and ticked"): ticking
// it opens it, and when its rows arrive they are chosen too, and any branch among them is opened and
// chosen the same way, so what is ticked is everything under it, not a key whose rows are unknown.
// Until the rows arrive the branch is ticked and drawn mixed, and a failed read leaves it open on
// its own Try again row. "Select all shown" chooses every row the open branches
// show. A key that something chosen implies stays ticked when cleared (the choice puts it back) and
// its row says, in words, which chosen row it is included because of; the polite live region says
// how many more were chosen, or that a clear was refused.
//
// Names that do not fit are cut with an ellipsis and carry the whole text as the row's title, so a
// long path segment is readable on hover without widening the pane.

/** A node's place in the tree, passed to `renderNode`. */
export type TreeNodeState = { expanded: boolean; selected: boolean; level: number; branch: boolean };

// The type parameter is `N`, not `T`: `Load<readonly T[]>` with a parameter named like `Load`'s own
// sends Storybook's docgen (react-docgen's type resolver) into endless recursion.
export type TreeProps<N> = TreeCommon<N> &
  (
    | {
        /** The chosen node's key, or `null`. */
        selected: string | null;
        /** A node was chosen. */
        onSelect: (key: string, node: N) => void;
        choices?: undefined;
      }
    | {
        /** Choose several, from `useChoices`: a checkbox per row, mixed parents, Shift ranges, "Select all shown", and keys the choice implies marked in words. Give this instead of `selected` and `onSelect`. */
        choices: Choices;
        selected?: undefined;
        onSelect?: undefined;
      }
  );

type TreeCommon<N> = {
  /** Names the tree for assistive technology: "Folders". Required. */
  label: string;
  /** The top level, as one read: the skeleton, the failure and Try again come from `DataView`'s `Load`. */
  roots: Load<readonly N[]>;
  /** The children of an open node, as a hook (`useLoad` inside). Called only while the node is open. */
  useChildren: (node: N) => Load<readonly N[]>;
  /** A node's key, unique in the whole tree: a path, an id. */
  nodeKey: (node: N) => string;
  /** A node's name: shown, and what type-ahead matches. */
  nodeLabel: (node: N) => string;
  /** Whether a node can open. Default: every node can. */
  isBranch?: (node: N) => boolean;
  /** What a row shows after the icon. Default: the name, cut with an ellipsis. */
  renderNode?: (node: N, state: TreeNodeState) => React.ReactNode;
  /** Which nodes are open; from `useExpanded`, optionally in the URL. */
  expanded: Expanded;
  /** Asked when the person opens a branch (chevron or Right arrow): return `false` to keep it closed, having done something else with it (a folder that is a project is chosen, not entered). Not asked for opens the app makes itself. */
  beforeOpen?: (node: N) => boolean;
  /** The skeleton row while a node's children load. Default: a muted bar. */
  loadingRow?: React.ReactNode;
  /** What an open node with nothing in it says: "No folders". Required, so an empty branch is never blank. */
  emptyRow: string;
  /** The tallest the tree may be before it scrolls, as a CSS length. Default 24rem. */
  height?: string;
  className?: string;
};

type Ctx<N> = Omit<TreeCommon<N>, "label" | "roots" | "className" | "height"> & { choices?: Choices; nodes: Map<string, N>; settle: (key: string, kids: readonly N[]) => void; childKeys: Map<string, string[]>; stateOf: (key: string) => "on" | "mixed" | "off" };
const Context = React.createContext<Ctx<never> | null>(null);
const useCtx = <N,>() => React.useContext(Context) as unknown as Ctx<N>;

const NOTE = "\u0000";
const isNote = (key: string) => key.includes(NOTE);
const ROW = "flex min-h-(--control-h-sm) min-w-0 items-center gap-1 rounded-control pr-2 type-body-sm";

function Row({ level, children }: { level: number; children: React.ReactNode }) {
  return <div className={ROW} style={{ paddingInlineStart: `${level * 1.25 + 0.25}rem` }}>{children}</div>;
}

function Node<N>({ node }: { node: N }) {
  const c = useCtx<N>();
  const key = c.nodeKey(node);
  c.nodes.set(key, node);
  const branch = c.isBranch ? c.isBranch(node) : true;
  const open = branch && c.expanded.isOpen(key);
  const name = c.nodeLabel(node);
  const because = c.choices?.implied.has(key) ? c.choices.because(key).map((k) => (c.nodes.has(k) ? c.nodeLabel(c.nodes.get(k) as N) : k)) : [];
  return (
    <TreeItem id={key} textValue={name} hasChildItems={branch} className="outline-none">
      <TreeItemContent>
        {({ level, isSelected, isExpanded }) => (
          <div
            title={name}
            className={cn(ROW, "cursor-pointer outline-offset-[-2px] hover:bg-muted", isSelected && "bg-surface-sunken font-medium")}
            style={{ paddingInlineStart: `${(level - 1) * 1.25 + 0.25}rem` }}
            data-selected={isSelected || undefined}
          >
            {c.choices && <TableSelectionCheckbox label={`Choose ${name}`} mixed={c.stateOf(key) === "mixed"} />}
            {branch ? (
              <AriaButton slot="chevron" className="grid size-6 shrink-0 place-items-center rounded-control text-muted-foreground">
                <ChevronRight aria-hidden className={cn("size-4", isExpanded && "rotate-90")} />
              </AriaButton>
            ) : (
              <span aria-hidden className="size-6 shrink-0" />
            )}
            {branch ? (isExpanded ? <FolderOpen aria-hidden className="size-4 shrink-0 text-muted-foreground" /> : <Folder aria-hidden className="size-4 shrink-0 text-muted-foreground" />) : null}
            <span className="min-w-0 flex-1 truncate">
              {c.renderNode ? c.renderNode(node, { expanded: isExpanded, selected: isSelected, level, branch }) : name}
            </span>
            {because.length > 0 && (
              <span className="flex max-w-[50%] shrink-0 items-center gap-1 truncate type-caption text-muted-foreground" title={`Included because of ${because.join(", ")}`}>
                <Lock aria-hidden className="size-3 shrink-0" />
                <span className="truncate">Included because of {because.slice(0, 2).join(", ")}{because.length > 2 ? ` and ${because.length - 2} more` : ""}</span>
              </span>
            )}
          </div>
        )}
      </TreeItemContent>
      {open ? <Children node={node} /> : branch && <ClosedChild id={`${key}${NOTE}closed`} />}
    </TreeItem>
  );
}

// React Aria 1.22 does not pass `hasChildItems` on to the row's hook (checked in `Tree.mjs`: it
// builds `useTreeItem` from the node, focus mode and arrow behaviour only), so a branch counts as
// expandable, and gets `aria-expanded` and the Right/Left arrow keys, only when the collection
// holds a child for it. A closed branch has not loaded any, so it holds this one: never drawn (a
// closed branch shows no rows) and never chosen, there so the branch is a branch.
function ClosedChild({ id }: { id: string }) {
  return (
    <TreeItem key="closed" id={id} textValue="" isDisabled>
      <TreeItemContent>{() => null}</TreeItemContent>
    </TreeItem>
  );
}

function Nodes<N>({ nodes }: { nodes: readonly N[] }) {
  const c = useCtx<N>();
  return <>{nodes.map((n) => <Node key={c.nodeKey(n)} node={n} />)}</>;
}

// The children of one open node. Its own component, so the hook runs only while it is open.
function Children<N>({ node }: { node: N }) {
  const c = useCtx<N>();
  const key = c.nodeKey(node);
  const load = c.useChildren(node);
  const ready = load.status === "ready" ? load.data : undefined;
  React.useEffect(() => {
    if (ready) c.settle(key, ready);
  }, [ready]);
  if (load.status === "loading") {
    return (
      <TreeItem key="loading" id={`${key}${NOTE}loading`} textValue="Loading" isDisabled className="outline-none">
        <TreeItemContent>
          {({ level }) => <Row level={level - 1}><span aria-hidden className="size-6 shrink-0" /><span role="status" className="sr-only">Loading</span>{c.loadingRow ?? <span aria-hidden className="h-3 w-32 animate-pulse rounded-pill bg-muted" />}</Row>}
        </TreeItemContent>
      </TreeItem>
    );
  }
  if (load.status === "error") {
    return (
      <TreeItem key="error" id={`${key}${NOTE}error`} textValue={load.message} className="outline-none">
        <TreeItemContent>
          {({ level }) => (
            <Row level={level - 1}>
              <CircleAlert aria-hidden className="size-4 shrink-0 text-danger" />
              <span className="min-w-0 flex-1 truncate text-danger" title={load.message}>{load.message}</span>
              <Button size="sm" onPress={load.retry}>Try again</Button>
            </Row>
          )}
        </TreeItemContent>
      </TreeItem>
    );
  }
  if (load.data.length === 0) {
    return (
      <TreeItem key="empty" id={`${key}${NOTE}empty`} textValue={c.emptyRow} isDisabled className="outline-none">
        <TreeItemContent>
          {({ level }) => <Row level={level - 1}><span aria-hidden className="size-6 shrink-0" /><span className="text-muted-foreground">{c.emptyRow}</span></Row>}
        </TreeItemContent>
      </TreeItem>
    );
  }
  c.childKeys.set(key, load.data.map(c.nodeKey));
  return <Nodes nodes={load.data} />;
}

/** A hierarchy whose children load as each node opens (a `useChildren` hook per open node): a skeleton row, a Try again row and an "empty" row per node, type-ahead and arrow keys, single selection, open state optionally in the URL, always virtualised. */
export function Tree<N>({ label, roots, useChildren, nodeKey, nodeLabel, isBranch, renderNode, selected, onSelect, choices, expanded, beforeOpen, loadingRow, emptyRow, height = "24rem", className }: TreeProps<N>) {
  const nodes = React.useRef(new Map<string, N>()).current;
  const childKeys = React.useRef(new Map<string, string[]>()).current;

  // Loaded descendants of a key, from what each open branch has read.
  const below = (key: string): string[] => (childKeys.get(key) ?? []).flatMap((k) => [k, ...below(k)]);
  const stateOf = (key: string): "on" | "mixed" | "off" => {
    const all = choices?.selected;
    const own = all?.has(key) ?? false;
    const ds = below(key);
    if (ds.length === 0) return own ? "on" : "off";
    const chosen = ds.filter((k) => all?.has(k)).length;
    if (chosen === ds.length) return "on";
    return chosen === 0 && !own ? "off" : "mixed";
  };
  // Branches ticked before they were read: chosen with everything under them once their rows arrive.
  const awaiting = React.useRef(new Set<string>()).current;
  const latest = React.useRef({ expanded, choices });
  latest.current = { expanded, choices };
  const opening = React.useRef(new Set<string>()).current; // asked to open, not yet in `expanded`
  const open = (keys: readonly string[]) => {
    for (const k of keys) opening.add(k);
    latest.current.expanded.onChange(new Set([...latest.current.expanded.expanded, ...opening]));
  };
  const unread = (key: string) => {
    const node = nodes.get(key);
    return node !== undefined && (isBranch ? isBranch(node) : true) && !childKeys.has(key);
  };
  // Tick a set of keys: branches among them that have not been read are opened and awaited.
  const tick = (keys: readonly string[]) => {
    const toOpen = keys.filter(unread);
    for (const k of toOpen) awaiting.add(k);
    if (toOpen.length) open(toOpen);
  };
  const settle = (key: string, kids: readonly N[]) => {
    opening.delete(key);
    if (!awaiting.delete(key) || !latest.current.choices) return;
    const keys = kids.map(nodeKey);
    for (const kid of kids) nodes.set(nodeKey(kid), kid);
    latest.current.choices.add(keys);
    tick(keys);
  };
  const ctx: Ctx<N> = { useChildren, nodeKey, nodeLabel, isBranch, renderNode, expanded, loadingRow, emptyRow, nodes, childKeys, choices, stateOf, settle };

  if (roots.status === "loading") {
    return (
      <div role="status" aria-label={`${label}: loading`} className={cn("space-y-2 p-2", className)}>
        {[0, 1, 2, 3].map((i) => <div key={i} aria-hidden className="h-4 animate-pulse rounded-pill bg-muted" style={{ width: `${70 - i * 10}%` }} />)}
      </div>
    );
  }
  if (roots.status === "error") {
    return (
      <div role="alert" className={cn("flex items-center gap-3 rounded-surface bg-danger-subtle p-3 text-danger", className)}>
        <CircleAlert aria-hidden className="size-5 shrink-0" />
        <p className="min-w-0 flex-1 type-body-sm">{roots.message}</p>
        <Button size="sm" onPress={roots.retry}>Try again</Button>
      </div>
    );
  }

  const choose = (keys: Selection) => {
    const first = keys === "all" ? undefined : [...keys][0];
    if (first === undefined || isNote(String(first))) return;
    const key = String(first);
    const node = nodes.get(key);
    if (node !== undefined) onSelect?.(key, node);
  };

  // What the boxes show as ticked: the chosen keys (a row not read yet is still ticked), and a
  // branch whose loaded rows are all chosen, but not a branch drawn mixed.
  const displayKeys = choices ? [...new Set([...choices.selected, ...nodes.keys()])].filter((k) => stateOf(k) === "on" || (choices.selected.has(k) && !nodes.has(k))) : [];

  // The rows the open branches show, in order.
  const shown = (): string[] => {
    const walk = (keys: string[]): string[] => keys.flatMap((k) => (expanded.isOpen(k) && childKeys.has(k) ? [k, ...walk(childKeys.get(k)!)] : [k]));
    return walk(roots.data.map(nodeKey));
  };
  const chooseMany = (keys: Selection) => {
    if (!choices) return;
    const wanted = new Set(choices.selected);
    if (keys === "all") {
      // Select all shown only adds: rows that are chosen but not shown (a collapsed branch) stay as they are.
      const rows = shown().flatMap((k) => [k, ...below(k)]);
      for (const x of rows) wanted.add(x);
      choices.onChange(wanted);
      tick(rows);
      return;
    }
    const display = new Set(displayKeys);
    const next = new Set([...keys].map(String).filter((k) => !isNote(k)));
    // Each row whose box changed sets itself and what is loaded under it to the new state.
    for (const k of new Set([...next, ...display])) {
      if (next.has(k) === display.has(k)) continue;
      const under = [k, ...below(k)];
      for (const x of under) {
        if (next.has(k)) wanted.add(x);
        else {
          wanted.delete(x);
          awaiting.delete(x);
        }
      }
      if (next.has(k)) tick(under);
    }
    choices.onChange(wanted);
  };

  const tree = (
    <AriaTree
      aria-label={label}
      selectionMode={choices ? "multiple" : "single"}
      disallowEmptySelection={!choices}
      selectedKeys={choices ? displayKeys : selected === null ? [] : [selected as string]}
      onSelectionChange={choices ? chooseMany : choose}
      expandedKeys={expanded.expanded}
      onExpandedChange={(keys) => {
        const next = new Set([...keys].map(String).filter((k) => !isNote(k)));
        if (beforeOpen) for (const k of [...next]) {
          const node = nodes.get(k);
          if (!expanded.isOpen(k) && node !== undefined && beforeOpen(node) === false) next.delete(k);
        }
        expanded.onChange(next);
      }}
      renderEmptyState={() => <p className="p-3 type-body-sm text-muted-foreground">{emptyRow}</p>}
      className={cn("min-w-0 overflow-y-auto outline-none", !choices && className)}
      style={{ maxHeight: height }}
      data-strata-scroll=""
    >
      <Nodes nodes={roots.data} />
    </AriaTree>
  );
  const body = (
    <Context.Provider value={ctx as unknown as Ctx<never>}>
      <Virtualizer layout={ListLayout} layoutOptions={{ rowHeight: 32 }}>{tree}</Virtualizer>
    </Context.Provider>
  );
  if (!choices) return body;
  return (
    <div className={cn("grid min-w-0 gap-2", className)}>
      <div className="flex items-center gap-2">
        <Button size="sm" variant="ghost" onPress={() => chooseMany("all")}>Select all shown</Button>
        {choices.count > 0 && <Button size="sm" variant="ghost" onPress={choices.clear}>Clear</Button>}
      </div>
      {body}
      <p role="status" className="sr-only">{choices.note}</p>
    </div>
  );
}
