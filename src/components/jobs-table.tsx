import { Ban, Check, CircleAlert, Clock, LoaderCircle } from "lucide-react";
import { format } from "../lib/format";
import type { IconComponent } from "../lib/icon";
import { cn } from "../lib/utils";
import { AsyncButton, useAsyncAction } from "./async-button";
import { DataTable, type Column } from "./data-table";
import { Status, type Tone } from "./status";

// The jobs page every app with strata-python's queue has (listory's Processing page, reels' and
// tubes' job lists), drawn from the shared `GET /api/jobs` (`Page[Task]`), with cancel and retry
// from `POST /api/jobs/<id>/cancel` and `.../retry`. One table so each app stops writing its own:
//
// - A job's state is a word (`Status`): Queued, Running, Done, Failed, Cancelled. Running shows
//   the progress line the job reports ("Page 3 of 40"), a failed job its error in the server's words.
// - What the job is about comes from the app: `describe(task)` turns kind and domain ("ocr",
//   "book:12") into the person's words ("Read the text of Wolf Hall"); the default is the kind.
// - A row's action is named with that description ("Cancel Read the text of Wolf Hall"), shown only
//   where it applies: Cancel on a queued or running job, Run again on a failed or cancelled one.
//   Actions are ghost: the jobs page is a log, not a place with a main action.
// - Types are the app's generated `Schema<"Task">`; the props ask only for the fields drawn.

/** The fields of a job `JobsTable` draws: the shape of `Schema<"Task">`, which satisfies it. */
export type JobRow = {
  id: number | string;
  kind: string;
  state: string;
  created_at: string;
  started_at?: string | null;
  finished_at?: string | null;
  error?: string | null;
  attempts?: number;
  domain?: string | null;
  progress?: { text?: string; done?: number; total?: number | null } | null;
};

const LOOKS: Record<string, { tone: Tone; icon: IconComponent; word: string }> = {
  queued: { tone: "neutral", icon: Clock, word: "Queued" },
  running: { tone: "info", icon: LoaderCircle, word: "Running" },
  done: { tone: "success", icon: Check, word: "Done" },
  failed: { tone: "danger", icon: CircleAlert, word: "Failed" },
  cancelled: { tone: "neutral", icon: Ban, word: "Cancelled" },
};

/** The jobs table's props. */
export type JobsTableProps<T extends JobRow> = {
  /** Names the table: "Jobs". */
  caption: string;
  /** The jobs, newest first: the items of `GET /api/jobs` pages. */
  jobs: T[];
  /** What a job is, in the person's words. Default its kind. */
  describe?: (job: T) => string;
  /** Cancels a queued or running job (`POST /api/jobs/<id>/cancel`). Without it, no Cancel. */
  onCancel?: (job: T) => Promise<unknown>;
  /** Runs a failed or cancelled job again (`POST /api/jobs/<id>/retry`). Without it, no Run again. */
  onRetry?: (job: T) => Promise<unknown>;
  /** "Now", for `format.ago` (tests and screenshots). */
  now?: Date;
  className?: string;
};

function JobAction<T extends JobRow>({ job, subject, run, labels }: { job: T; subject: string; run: (j: T) => Promise<unknown>; labels: { idle: string; pending: string; done: string } }) {
  const action = useAsyncAction(() => run(job));
  return (
    <AsyncButton
      size="sm"
      variant="ghost"
      className="-my-1.5"
      phase={action.phase}
      error={action.error}
      labels={labels}
      aria-label={`${labels.idle} ${subject}`}
      onClick={() => void action.run()}
    />
  );
}

/** A table of the queue's jobs (`GET /api/jobs`): what each is, its state as a word with its progress or error, when it started, and Cancel or Run again where they apply. */
export function JobsTable<T extends JobRow>({ caption, jobs, describe = (j) => j.kind, onCancel, onRetry, now, className }: JobsTableProps<T>) {
  const columns: Column<T>[] = [
    {
      key: "job",
      header: "Job",
      cell: (j) => describe(j),
      value: (j) => describe(j),
      truncate: true,
    },
    {
      key: "state",
      header: "State",
      cell: (j) => {
        const look = LOOKS[j.state] ?? LOOKS.queued!;
        return (
          <Status tone={look.tone} icon={look.icon}>
            {look.word}
          </Status>
        );
      },
      value: (j) => j.state,
    },
    {
      key: "detail",
      header: "Detail",
      cell: (j) =>
        j.state === "failed" && j.error ? (
          <span className="text-danger">{j.error}</span>
        ) : j.state === "running" && j.progress?.text ? (
          j.progress.text
        ) : (
          <span className="text-muted-foreground">{format.missing}</span>
        ),
      sort: false,
      truncate: true,
    },
    {
      key: "created",
      header: "Added",
      cell: (j) => format.ago(j.created_at, now),
      value: (j) => new Date(j.created_at),
    },
    {
      key: "actions",
      header: "Actions",
      hideHeader: true,
      sort: false,
      cell: (j) =>
        (j.state === "queued" || j.state === "running") && onCancel ? (
          <JobAction job={j} subject={describe(j)} run={onCancel} labels={{ idle: "Cancel", pending: "Cancelling…", done: "Cancelled" }} />
        ) : (j.state === "failed" || j.state === "cancelled") && onRetry ? (
          <JobAction job={j} subject={describe(j)} run={onRetry} labels={{ idle: "Run again", pending: "Queuing…", done: "Queued" }} />
        ) : null,
    },
  ];
  return <DataTable caption={caption} columns={columns} rows={jobs} rowKey={(j) => String(j.id)} className={cn(className)} />;
}
