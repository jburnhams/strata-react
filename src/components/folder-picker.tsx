import * as React from "react";
import { ArrowUp, Pencil } from "lucide-react";
import { cn } from "../lib/utils";
import { format } from "../lib/format";
import { AsyncButton, useAsyncAction } from "./async-button";
import { Button, IconButton } from "./button";
import type { Load } from "./data-view";
import type { Expanded } from "./disclosure";
import { Field, Input } from "./field";
import { Status, type Tone } from "./status";
import { Tooltip } from "./tooltip";
import { Tree } from "./tree";

// Choose a folder on the server, or make one. Issue #188, from strata-360's folder browser, a
// common first screen in tool apps. Built on `Tree` (React Aria's tree, lazy), so type-ahead, the
// arrow keys and the roles are its; the picker adds the path, the recents and the new-folder form.
//
// The unit is a path (`/home/ada/projects`), and the key of every row. The chosen folder is
// `value`; choosing in the tree, a crumb, "Up", a recent or the typed path all call `onChange`,
// and whatever sets it, its ancestors are opened in the tree so the choice is always visible.
// Paths use `/`; an app on a platform with another separator maps them in `useFolders`.
//
// The path is shown as a breadcrumb (each part a button that goes there) and can be edited as text
// ("Edit path"): Enter goes, Escape leaves it. The text field is how a person who knows the path
// gets to a deep folder in one step, and it is the only way for a path the tree has not loaded.
//
// Reads are the app's: `useFolders(path)` is a hook (`useLoad` inside) that returns one folder's
// subfolders as `Load`, with `null` for the top. The picker keeps no copy. Which entries are shown
// (hidden ones, say) is decided there, not here.
//
// "Choose this folder" is the one filled button. "New folder" is one field with its button beside
// it (`Field action=`); the server's refusal ("A folder named archive already exists") lands under
// the field through `useAsyncAction`, from its 4xx reason or per-field message, never as a toast.
// On success the new folder is chosen so the person can carry on into it.
//
// What the app knows about a folder (issue #233, from strata-360's chooser, whose server says
// whether a folder already is a project and whether one can be made in it): `badge` is a word on a
// tinted `Status` beside the name (never colour alone, and it is in the row's name); `canChoose`
// answers true or the reason the filled button is disabled, shown beside it and tied to it with
// `aria-describedby`, so a disabled button always says why; `chooseLabel` names the action ("Create
// project here"); `onOpen` is asked when the person opens a folder in the tree and answers "choose"
// to take it as chosen at once instead of entering it; and the listing may carry a `footer`, a
// sentence about the folder being looked at ("3 camera files here"), shown under the tree. The
// kind of the badge is its `tone`; a separate `kind` would repeat it. `canChoose` is given the
// folder when the picker has it (read through the same cached listing the tree uses), or
// `undefined` for a path typed in that no listing holds.

/** One folder in a listing. */
export type Folder = {
  /** The full path, which is also its key. */
  path: string;
  /** The last part, shown. */
  name: string;
  /** How many folders are inside it, when the server knows; shown beside the name. */
  count?: number;
  /** A word about the folder ("project"), shown beside the name as text on a tint and included in its row's name. */
  badge?: string;
  /** The badge's tone. Default `neutral`. */
  tone?: Tone;
};

/** What a listing hook may return instead of a bare array: the folders and a sentence about the folder they are in. */
export type FolderListing = {
  folders: readonly Folder[];
  /** Shown under the tree while this folder is the one being looked at: "3 camera files here". */
  footer?: string;
};

export type FolderPickerProps = {
  /** Names the picker: "Choose a folder for the project". Required. */
  label: string;
  /** Reads one folder's subfolders (`null` is the top). A hook: `useLoad` inside. It may return `{ folders, footer }` to say something about the folder itself. */
  useFolders: (path: string | null) => Load<readonly Folder[] | FolderListing>;
  /** The folder being looked at, or `null`. */
  value: string | null;
  onChange: (path: string | null) => void;
  /** The person chose this folder. */
  onChoose: (path: string) => void;
  /** Which folders are open in the tree; from `useExpanded`, optionally in the URL. */
  expanded: Expanded;
  /** Folders chosen before, newest first. */
  recent?: readonly string[];
  /** Whether the looked-at folder may be chosen: `true`, or the reason it may not, shown beside the disabled button. Given the folder when the listing has it. */
  canChoose?: (path: string, folder: Folder | undefined) => true | string;
  /** Names the choosing button: "Create project here". Default "Choose this folder". */
  chooseLabel?: string;
  /** Asked when the person opens a folder in the tree: `"choose"` takes it as chosen at once and keeps it closed, `"enter"` (the default) opens it. */
  onOpen?: (folder: Folder) => "choose" | "enter";
  /** Makes a folder named `name` in `parent`. Throw (an `HttpError`) to refuse; its reason is shown on the field. Without it there is no New folder. */
  onCreate?: (parent: string, name: string) => Promise<unknown>;
  /** The name of the top: "Server". Default "Top". */
  topLabel?: string;
  /** What a folder with no folders in it says. Default "No folders". */
  emptyRow?: string;
  /** The height of the tree before it scrolls. Default 18rem. */
  height?: string;
  className?: string;
};

const SEP = "/";
const parts = (path: string) => path.split(SEP).filter(Boolean);
const join = (parent: string, name: string) => `${parent === SEP ? "" : parent}${SEP}${name}`;
/** The parent of a path, or `null` at the top. */
export const parentOf = (path: string): string | null => {
  const p = parts(path);
  return p.length <= 1 ? null : `${SEP}${p.slice(0, -1).join(SEP)}`;
};
/** Every folder from the top down to `path`, which the tree must have open to show it. */
export const ancestorsOf = (path: string): string[] => parts(path).slice(0, -1).map((_, i, a) => `${SEP}${a.slice(0, i + 1).join(SEP)}`);

/** A server folder chooser: a lazy tree, a breadcrumb that is also editable text, Up, recents, a New folder field that shows the server's refusal, and Choose this folder as the one filled button. */
export function FolderPicker({ label, useFolders: useListing, value, onChange, onChoose, expanded, recent, canChoose, chooseLabel = "Choose this folder", onOpen, onCreate, topLabel = "Top", emptyRow = "No folders", height = "18rem", className }: FolderPickerProps) {
  // The app's hook may return a listing with a footer; the tree and the rest read bare arrays.
  const useFolders = (path: string | null): Load<readonly Folder[]> => {
    const l = useListing(path);
    return l.status === "ready" && !Array.isArray(l.data) ? { ...l, data: (l.data as FolderListing).folders } : (l as Load<readonly Folder[]>);
  };
  const roots = useFolders(null);
  // The folder itself (from its parent's listing) and its own listing: the query cache holds both
  // already when the tree has them open, so these are not extra requests in the common case.
  const siblings = useFolders(value ? parentOf(value) : null);
  const own = useListing(value);
  const folder = value && siblings.status === "ready" ? siblings.data.find((f) => f.path === value) : undefined;
  const footer = value && own.status === "ready" && !Array.isArray(own.data) ? (own.data as FolderListing).footer : undefined;
  const verdict = value && canChoose ? canChoose(value, folder) : true;
  const reason = typeof verdict === "string" ? verdict : undefined;
  const reasonId = React.useId();
  const [editing, setEditing] = React.useState(false);
  const [text, setText] = React.useState("");

  const go = (path: string | null) => onChange(path);

  // Whatever sets the folder (the tree, a crumb, Up, a recent, the typed path, the app's first
  // value), its ancestors are opened so the choice is visible in the tree.
  React.useEffect(() => {
    if (!value) return;
    const open = ancestorsOf(value).filter((a) => !expanded.isOpen(a));
    if (open.length) expanded.onChange(new Set([...expanded.expanded, ...open]));
  }, [value, expanded]);

  const [name, setName] = React.useState("");
  const created = useAsyncAction(async (name: string) => {
    if (!value) return;
    await onCreate?.(value, name);
    setName("");
    go(join(value, name));
    expanded.setOpen(value, true);
  }, {
    validate: (name) => (name.trim() ? undefined : { name: "Name the new folder." }),
  });
  const crumbs = value ? parts(value) : [];
  return (
    <section aria-label={label} className={cn("space-y-3", className)}>
      <div className="flex flex-wrap items-center gap-2">
        <IconButton icon={ArrowUp} label="Up one folder" onPress={() => go(value ? parentOf(value) : null)} disabled={!value} />
        {editing ? (
          <form
            className="flex min-w-0 flex-1 items-center gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              const typed = text.trim();
              go(typed ? (typed.startsWith(SEP) ? typed : `${SEP}${typed}`).replace(/\/+$/, "") || SEP : null);
              setEditing(false);
            }}
          >
            <Input
              aria-label="Folder path"
              value={text}
              autoFocus
              onChange={(e) => setText(e.target.value)}
              onKeyDown={(e) => e.key === "Escape" && (e.stopPropagation(), setEditing(false))}
              className="min-w-0 flex-1 font-mono"
              size="sm"
            />
            <Button size="sm" type="submit">Go</Button>
          </form>
        ) : (
          <>
            <nav aria-label="Folder path" className="min-w-0 flex-1">
              <ol className="flex flex-wrap items-center gap-x-1 type-body-sm">
                <li>
                  <Button size="sm" variant="ghost" onPress={() => go(null)} aria-current={value ? undefined : "location"}>{topLabel}</Button>
                </li>
                {crumbs.map((c, i) => {
                  const path = `${SEP}${crumbs.slice(0, i + 1).join(SEP)}`;
                  const last = i === crumbs.length - 1;
                  return (
                    <li key={path} className="flex min-w-0 items-center gap-1">
                      <span aria-hidden className="text-muted-foreground">/</span>
                      <Tooltip label={path} side="bottom">
                        <Button size="sm" variant="ghost" onPress={() => go(path)} aria-current={last ? "location" : undefined} className={cn("max-w-48 truncate", last && "font-medium")}>{c}</Button>
                      </Tooltip>
                    </li>
                  );
                })}
              </ol>
            </nav>
            <IconButton icon={Pencil} label="Edit path" onPress={() => { setText(value ?? ""); setEditing(true); }} />
          </>
        )}
      </div>

      <div className="rounded-surface border border-border">
        <Tree
          label={`${label}: folders`}
          roots={roots}
          useChildren={(f: Folder) => useFolders(f.path)}
          nodeKey={(f) => f.path}
          nodeLabel={(f) => (f.badge ? `${f.name}, ${f.badge}` : f.name)}
          beforeOpen={onOpen ? (f) => {
            if (onOpen(f) !== "choose") return true;
            go(f.path);
            onChoose(f.path);
            return false;
          } : undefined}
          renderNode={(f) => (
            <span className="flex min-w-0 items-baseline gap-2">
              <span className="truncate">{f.name}</span>
              {f.badge && <Status tone={f.tone ?? "neutral"} className="self-center">{f.badge}</Status>}
              {f.count !== undefined && <span className="type-caption tabular-nums text-muted-foreground">{format.integer(f.count)}</span>}
            </span>
          )}
          selected={value}
          onSelect={(key) => onChange(key)}
          expanded={expanded}
          emptyRow={emptyRow}
          height={height}
        />
      </div>

      {recent && recent.length > 0 && (
        <div role="group" aria-label="Recent folders" className="flex flex-wrap items-center gap-2">
          <span className="type-caption text-muted-foreground">Recent</span>
          {recent.map((r) => (
            <Tooltip key={r} label={r} side="bottom">
              <Button size="sm" variant="outline" onPress={() => go(r)} className="max-w-64 truncate font-mono">{r}</Button>
            </Tooltip>
          ))}
        </div>
      )}

      {onCreate && (
        <form onSubmit={(e) => { e.preventDefault(); void created.run(name.trim()); }}>
          <Field
            label="New folder"
            hint={value ? `It will be made in ${value}.` : "Open a folder first."}
            error={created.fieldErrors.name ?? (created.phase === "error" ? created.error : undefined)}
            action={<AsyncButton type="submit" phase={created.phase} error={created.error} disabled={!value} labels={{ idle: "Make folder", pending: "Making…", done: "Made" }} />}
          >
            <Input
              value={name}
              disabled={!value}
              onChange={(e) => { setName(e.target.value); created.clearFieldError("name"); }}
            />
          </Field>
        </form>
      )}

      {footer && <p className="type-body-sm text-muted-foreground">{footer}</p>}

      <div className="flex flex-wrap items-center justify-end gap-3">
        {reason && <p id={reasonId} className="min-w-0 flex-1 type-body-sm text-muted-foreground">{reason}</p>}
        <Button variant="default" disabled={!value || reason !== undefined} aria-describedby={reason ? reasonId : undefined} onPress={() => value && onChoose(value)}>{chooseLabel}</Button>
      </div>
    </section>
  );
}
