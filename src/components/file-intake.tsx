import * as React from "react";
import { CircleAlert, CircleCheck, FileQuestion, Loader, Upload, X } from "lucide-react";
import { DropZone, FileTrigger } from "react-aria-components";
import type { FileIntake, FileOutcome } from "../lib/file-intake";
import type { IconComponent } from "../lib/icon";
import { cn } from "../lib/utils";
import { Button, IconButton, RowAction, type ButtonProps } from "./button";
import { Status } from "./status";

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

/** A region that takes dropped files and offers the picker as its keyboard alternative. */
export function FileDropZone({
  onFiles,
  acceptLabel,
  title,
  disabled,
  children,
  className,
}: {
  onFiles: (files: File[]) => void;
  /** What it takes, in words ("a video, an audio file or a GPX track"). Shown while a drag is over it. */
  acceptLabel: string;
  /** The resting prompt ("Drag files here"). */
  title: string;
  disabled?: boolean;
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

/** A saved item whose file is gone: the item's name, a "File missing" status (a word and an icon) and a "Relink" button that opens the picker for this one item. */
export function MissingFile({
  name,
  accept,
  onRelink,
  className,
}: {
  /** The item's name as the person knows it ("run-02.mp4"). */
  name: string;
  accept: readonly string[];
  /** Called with the file the person chose to stand in for it. */
  onRelink: (file: File) => void;
  className?: string;
}) {
  return (
    <div className={cn("flex min-w-0 items-center gap-3", className)}>
      <span className="min-w-0 flex-1 truncate type-body" title={name}>
        {name}
      </span>
      <Status tone="warning" icon={FileQuestion}>
        File missing
      </Status>
      <FileButton accept={accept} variant="ghost" size="sm" aria-label={`Relink ${name}`} onFiles={([file]) => onRelink(file)}>
        Relink
      </FileButton>
    </div>
  );
}
