import * as React from "react";
import { CircleAlert, CircleCheck, FileQuestion, Loader, Upload, X } from "lucide-react";
import { DropZone, FileTrigger } from "react-aria-components";
import type { FileIntake, FileOutcome } from "../lib/file-intake";
import type { IconComponent } from "../lib/icon";
import { cn } from "../lib/utils";
import { Button, IconButton, RowAction, type ButtonProps } from "./button";
import { Status } from "./status";
import { STRATA_DRAG_TYPE } from "./drag-source";

// Bringing local files into an app (strata issue #75). Four pieces over `useFileIntake`:
//
//   FileButton    opens the picker. The one route that needs no pointer, so it is also the keyboard
//                 and phone way in: a drop zone always carries one.
//   FileDropZone  a region files can be dropped on, that says what it takes and shows when a drag
//                 is over it. Rejection happens after the drop, in `useFileIntake`, so a wrong
//                 file is named with its reason instead of the drop silently doing nothing.
//   FileOutcomes  one row per file: pending, added, rejected or failed, each with its word and,
//                 where a person must act, the reason and a retry. Inline, never a full-screen
//                 overlay (components.md §3.6).
//   MissingFile   a saved item whose file is gone: a status word and a relink button that opens the
//                 picker for that one item.
//
// React Aria first. The picker is `FileTrigger` (it renders the hidden input and opens it from a
// real `Button`, so the control is focusable and named; the old `<label>` around a hidden input
// is not) and the zone is `DropZone` (drop events, `isDropTarget`, its own focus ring). Checked in
// their `.d.ts`: `DropZone` filters nothing by type unless `getDropOperation` says so, and a
// refusal there shows no message, so we accept any file drop and judge in the hook. `isDropTarget`
// comes from React Aria's enter and leave bookkeeping, which is why the state does not flicker as
// the pointer crosses the zone's children (a plain `dragenter` handler on the zone does).
// A drag of the app's own things is not a drop of files (issue #291, from strata-vid, whose library rows are
// `DragSource`s beside a `FileDropZone` and a `Timeline`): the zone refuses a drag that carries `DragSource`'s
// type, or one of the app's `refuseTypes` for drags it starts some other way, so the zone is not a stop on the
// keyboard drag's way to a lane and does not offer "Drop to add" for it. Checked in `DragTypes` (react-aria's
// `dnd/utils`): a drag of files carries each file's MIME type (`application/octet-stream` when unknown), so it
// cannot carry our type; a drag `useDrag` starts carries only what it was given; but Safari's file drags have
// an empty items list and `DragTypes.has` then answers true for every type. A type nothing could carry is asked
// first (`has` true for it means "unknown types"), and such a drag is never refused, so Safari keeps working.
// The dropped `File`s are read from the drop items (`kind: "file"`); directories are ignored.
//
// Drop-over state is a word as well as a border: "Drop to add …" replaces the prompt, so it does
// not rest on colour alone. Nothing animates (character by frequency; the zone is used a handful
// of times a session, but its state change is itself the feedback).

/** The picker as a button. `children` is its visible name ("Add files"); `accept` narrows what the dialog shows. */
export function FileButton({
  accept,
  multiple = false,
  onFiles,
  icon: Icon,
  children,
  ...props
}: Omit<ButtonProps, "onChange" | "children"> & {
  /** What the dialog offers: extensions (`.gpx`), exact types or families (`video/*`). */
  accept: readonly string[];
  multiple?: boolean;
  /** Called with the files chosen. Not called when the dialog is cancelled. */
  onFiles: (files: File[]) => void;
  icon?: IconComponent;
  children: string;
}) {
  return (
    <FileTrigger
      acceptedFileTypes={accept}
      allowsMultiple={multiple}
      onSelect={(list) => {
        const files = list ? Array.from(list) : [];
        if (files.length) onFiles(files);
      }}
    >
      <Button {...props}>
        {Icon && <Icon aria-hidden />}
        {children}
      </Button>
    </FileTrigger>
  );
}

// A type no drag carries: `has` answering true for it means the browser would not say what is dragged (Safari's files).
const NEVER_CARRIED = "application/x-strata-never";

/** Whether a drag is the app's own, not files: it carries one of `refuse`, and the browser has not left its types unknown. */
export function refusesDrag(types: { has: (type: string) => boolean }, refuse: readonly string[]): boolean {
  return !types.has(NEVER_CARRIED) && refuse.some((type) => types.has(type));
}

/** A region that takes dropped files and offers the picker as its keyboard alternative. */
export function FileDropZone({
  onFiles,
  acceptLabel,
  title,
  disabled,
  refuseTypes,
  children,
  className,
}: {
  onFiles: (files: File[]) => void;
  /** What it takes, in words ("a video, an audio file or a GPX track"). Shown while a drag is over it. */
  acceptLabel: string;
  /** The resting prompt ("Drag files here"). */
  title: string;
  disabled?: boolean;
  /** Drag types of the app's own drags to ignore, besides every `DragSource`'s (which are always ignored): the zone does not light up for them and a keyboard drag does not stop on it. A dragged file never carries these, so a file is never refused. */
  refuseTypes?: readonly string[];
  /** The `FileButton` (required in practice: it is how a keyboard or phone gets files in). */
  children?: React.ReactNode;
  className?: string;
}) {
  const onDrop = async (e: Parameters<NonNullable<React.ComponentProps<typeof DropZone>["onDrop"]>>[0]) => {
    const items = e.items.filter((i) => i.kind === "file");
    const files = await Promise.all(items.map((i) => i.getFile()));
    if (files.length) onFiles(files);
  };
  return (
    <DropZone
      aria-label={title}
      isDisabled={disabled}
      getDropOperation={(types) => (refusesDrag(types, [STRATA_DRAG_TYPE, ...(refuseTypes ?? [])]) ? "cancel" : "copy")}
      onDrop={onDrop}
      className={({ isDropTarget, isFocusVisible }) =>
        cn(
          "grid min-w-0 justify-items-center gap-2 rounded-surface border border-dashed border-input px-4 py-6 text-center",
          isDropTarget && "border-solid border-primary bg-muted",
          isFocusVisible && "outline-2 outline-offset-2 outline-ring",
          className,
        )
      }
    >
      {({ isDropTarget }) => (
        <>
          <Upload aria-hidden className="size-5 text-muted-foreground" />
          <p className="type-body">{isDropTarget ? `Drop to add ${acceptLabel}` : title}</p>
          {children}
        </>
      )}
    </DropZone>
  );
}

// A window-wide drop (issue #368, from the Quake 2 explorer). In a tool screen the person drags a file
// from the desktop onto the window, wherever it lands, and `FileDropZone` is a region you aim at. React
// Aria's `DropZone` is for that region; there is no part for the whole window, so this listens on the
// document (checked: `useDrop` binds to one element). It follows the same rules as the zone: the drag
// must carry files (`Files` in its types), the app's own drags (`STRATA_DRAG_TYPE`, `refuseTypes`) never
// light it, and the drop is judged after it, in `useFileIntake`. Enter and leave events fire for every
// child the pointer crosses, so a depth count (not a boolean) says whether a drag is still over the
// window. A drop a `FileDropZone` or other target already took (`defaultPrevented`) is not taken twice.
// The overlay is for a pointer; the `FileButton` stays the keyboard and phone way in, so it is hidden
// from assistive technology and takes no events. `Workspace onFiles` mounts it for a tool screen.

const carriesFiles = (e: DragEvent, refuse: readonly string[]) => {
  const types = Array.from(e.dataTransfer?.types ?? []);
  return types.includes("Files") && !refusesDrag({ has: (type) => types.includes(type) }, [STRATA_DRAG_TYPE, ...refuse]);
};

/** While files are dragged anywhere over the window, a dim overlay names what is taken ("Drop to add PAK files"); a drop calls `onFiles`. The app's own drags never trigger it. Keep a `FileButton` beside it for the keyboard and phones. */
export function FileDropOverlay({
  onFiles,
  acceptLabel,
  disabled,
  refuseTypes,
}: {
  onFiles: (files: File[]) => void;
  /** What it takes, in words ("PAK files"), shown in "Drop to add …". */
  acceptLabel: string;
  disabled?: boolean;
  /** Drag types of the app's own drags to ignore, besides every `DragSource`'s. */
  refuseTypes?: readonly string[];
}) {
  const [over, setOver] = React.useState(false);
  const live = React.useRef({ onFiles, refuseTypes: refuseTypes ?? [] });
  live.current = { onFiles, refuseTypes: refuseTypes ?? [] };
  React.useEffect(() => {
    if (disabled) return;
    let depth = 0;
    const reset = () => {
      depth = 0;
      setOver(false);
    };
    const enter = (e: DragEvent) => {
      if (!carriesFiles(e, live.current.refuseTypes)) return;
      depth += 1;
      setOver(true);
    };
    const hover = (e: DragEvent) => {
      if (!carriesFiles(e, live.current.refuseTypes)) return;
      e.preventDefault(); // without this the browser opens the file instead of dropping it
      if (e.dataTransfer) e.dataTransfer.dropEffect = "copy";
    };
    const leave = (e: DragEvent) => {
      if (!carriesFiles(e, live.current.refuseTypes)) return;
      depth = Math.max(0, depth - 1);
      if (depth === 0) setOver(false);
    };
    const drop = (e: DragEvent) => {
      const wanted = carriesFiles(e, live.current.refuseTypes);
      reset();
      if (!wanted || e.defaultPrevented) return;
      e.preventDefault();
      const files = Array.from(e.dataTransfer?.items ?? [])
        .filter((i) => i.kind === "file")
        .map((i) => i.getAsFile())
        .filter((f): f is File => f !== null);
      const list = files.length ? files : Array.from(e.dataTransfer?.files ?? []);
      if (list.length) live.current.onFiles(list);
    };
    document.addEventListener("dragenter", enter);
    document.addEventListener("dragover", hover);
    document.addEventListener("dragleave", leave);
    document.addEventListener("drop", drop);
    // A drag cancelled with Escape fires no leave on the window in every browser.
    document.addEventListener("dragend", reset);
    return () => {
      document.removeEventListener("dragenter", enter);
      document.removeEventListener("dragover", hover);
      document.removeEventListener("dragleave", leave);
      document.removeEventListener("drop", drop);
      document.removeEventListener("dragend", reset);
    };
  }, [disabled]);
  if (!over || disabled) return null;
  return (
    <div aria-hidden data-file-drop-overlay className="pointer-events-none fixed inset-0 layer-overlay grid place-items-center scrim p-6">
      <div className="flex items-center gap-3 rounded-overlay border-2 border-dashed border-primary bg-background px-6 py-5 shadow-overlay">
        <Upload aria-hidden className="size-5 text-primary" />
        <p className="type-heading">Drop to add {acceptLabel}</p>
      </div>
    </div>
  );
}

const rowStatus: Record<FileOutcome["status"], { tone: "neutral" | "info" | "success" | "warning" | "danger"; word: string; icon: IconComponent }> = {
  processing: { tone: "info", word: "Adding…", icon: Loader },
  added: { tone: "success", word: "Added", icon: CircleCheck },
  rejected: { tone: "warning", word: "Not added", icon: CircleAlert },
  failed: { tone: "danger", word: "Failed", icon: CircleAlert },
};

/** One row per file offered: its name, a status word, and for a rejected or failed file the reason and (for failed) a retry. Announces a summary politely when a batch finishes. */
export function FileOutcomes({ intake, className }: { intake: FileIntake; className?: string }) {
  const { outcomes, retry, dismiss, pending } = intake;
  // A polite summary once nothing is pending, covering the files not yet announced, so a six-file
  // drop is one announcement and not six, and a drop that is all rejections is still heard.
  const [summary, setSummary] = React.useState("");
  const announced = React.useRef(new Set<string>());
  React.useEffect(() => {
    if (pending > 0) return;
    const fresh = outcomes.filter((o) => !announced.current.has(o.id));
    if (!fresh.length) return;
    for (const o of fresh) announced.current.add(o.id);
    const added = fresh.filter((o) => o.status === "added").length;
    const problems = fresh.length - added;
    setSummary([added && `${added} added`, problems && `${problems} not added`].filter(Boolean).join(", "));
  }, [pending, outcomes]);

  return (
    <div className={cn("min-w-0", className)}>
      <p role="status" className="sr-only">
        {summary}
      </p>
      {outcomes.length > 0 && (
        <ul className="grid divide-y divide-border border-y border-border">
          {outcomes.map((o) => {
            const s = rowStatus[o.status];
            const reason = o.status === "rejected" || o.status === "failed" ? o.reason : undefined;
            return (
              <li key={o.id} className="grid gap-1 py-2">
                <div className="flex items-center gap-3">
                  <span className="min-w-0 flex-1 truncate type-body" title={o.name}>
                    {o.name}
                  </span>
                  <Status tone={s.tone} icon={s.icon}>
                    {s.word}
                  </Status>
                  {o.status === "failed" && <RowAction label="Try again" subject={o.name} onClick={() => retry(o.id)} />}
                  {o.status !== "processing" && <IconButton icon={X} label={`Dismiss ${o.name}`} onClick={() => dismiss(o.id)} />}
                </div>
                {reason && <p className="type-body-sm text-muted-foreground">{reason}</p>}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

/**
 * A saved item whose file is gone: the item's name, a "File missing" status (a word and an icon) and a "Relink" button that opens the picker for this one item.
 * In a narrow column the name keeps its own line, in full, and the status and button wrap under it. An optional `thumbnail` sits beside all three.
 */
export function MissingFile({
  name,
  accept,
  onRelink,
  thumbnail,
  className,
}: {
  /** The item's name as the person knows it ("run-02.mp4"). */
  name: string;
  accept: readonly string[];
  /** Called with the file the person chose to stand in for it. */
  onRelink: (file: File) => void;
  /** A picture of the item (what it last looked like), drawn at the start. */
  thumbnail?: React.ReactNode;
  className?: string;
}) {
  // In a 300px library a name, a status and a button on one row left the name "parkru…" (strata-react
  // issue #122). The name is the one thing that must stay readable, so it wraps rather than truncates,
  // takes at least ten ems, and pushes the status and button to the next row when the row is short.
  return (
    <div className={cn("flex min-w-0 items-center gap-3", className)}>
      {thumbnail && <div className="shrink-0">{thumbnail}</div>}
      <div className="flex min-w-0 flex-1 flex-wrap items-center gap-x-3 gap-y-1">
        <span className="min-w-40 flex-auto break-words type-body" title={name}>
          {name}
        </span>
        <div className="flex items-center gap-2">
          <Status tone="warning" icon={FileQuestion}>
            File missing
          </Status>
          <FileButton accept={accept} variant="ghost" size="sm" aria-label={`Relink ${name}`} onFiles={([file]) => onRelink(file)}>
            Relink
          </FileButton>
        </div>
      </div>
    </div>
  );
}
