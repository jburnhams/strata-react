import { Ban, Check, CircleAlert, CircleDashed, LoaderCircle } from "lucide-react";
import { format } from "../lib/format";
import type { IconComponent } from "../lib/icon";
import { DataTable, type Column } from "./data-table";
import { Status, type Tone } from "./status";

// A machine's scheduled jobs (systemd timers, cron) on a status page, strata-react issue #344, from
// jburnhams/homepage, which kept a `DataTable` with a `Status` column for them. They are not
// `JobsTable`'s rows: a queue job is made once, runs once and ends (kind, state, cancel, retry); a
// scheduled job is permanent and its row is about the next run. So the shape differs:
// - a name, the last result as a word, when it last ran and when it runs next;
// - the result is a `Status` word, never a colour: "OK", "Failed", "Running", "Never run". A job that
//   is running now says "Running" whatever its last result was;
// - times are `format.ago` ("12 minutes ago", "in 3 hours"), the same call both ways, so the table
//   reads in one voice; a time not known is the placeholder, and a job that has not run says "Never";
// - the last-run and next-run columns drop on a phone (`hideBelow="sm"`, issue #339): the name and
//   the result are what the row means;
// - no actions: starting a timer by hand is the machine's business, not a status page's.

/** A scheduled job as `ScheduleTable` draws it. */
export type ScheduleRow = {
  /** What the job does, in the product's words: "Nightly backup". Also the row's key, so it is unique. */
  label: string;
  /** The last result: "ok" or "success", "failed" or "failure", or `null` for a job that has not run. Another word is shown as it is, neutrally. */
  result: string | null;
  /** The job is running now: the result then reads "Running". */
  running?: boolean;
  /** When it last ran (ISO string or Date), or `null`. */
  last?: string | Date | null;
  /** When it runs next, or `null` when nothing is scheduled. */
  next?: string | Date | null;
};

const LOOKS: Record<string, { tone: Tone; icon: IconComponent; word: string }> = {
  ok: { tone: "success", icon: Check, word: "OK" },
  success: { tone: "success", icon: Check, word: "OK" },
  failed: { tone: "danger", icon: CircleAlert, word: "Failed" },
  failure: { tone: "danger", icon: CircleAlert, word: "Failed" },
};

function lookOf(row: ScheduleRow): { tone: Tone; icon: IconComponent; word: string } {
  if (row.running) return { tone: "info", icon: LoaderCircle, word: "Running" };
  if (row.result == null) return { tone: "neutral", icon: CircleDashed, word: "Never run" };
  return LOOKS[row.result.toLowerCase()] ?? { tone: "neutral", icon: Ban, word: row.result };
}

/** The schedule table's props. */
export type ScheduleTableProps = {
  /** Names the table: "Scheduled jobs". */
  caption: string;
  rows: ScheduleRow[];
  /** "Now", for `format.ago` (tests and screenshots). */
  now?: Date;
  className?: string;
};

/** A table of a machine's scheduled jobs: each one's last result as a word, when it last ran and when it runs next. The last and next columns drop on a phone. */
export function ScheduleTable({ caption, rows, now, className }: ScheduleTableProps) {
  const columns: Column<ScheduleRow>[] = [
    { key: "label", header: "Job", cell: (r) => r.label, value: (r) => r.label, truncate: true },
    {
      key: "result",
      header: "Last result",
      cell: (r) => {
        const look = lookOf(r);
        return (
          <Status tone={look.tone} icon={look.icon}>
            {look.word}
          </Status>
        );
      },
      value: (r) => lookOf(r).word,
    },
    { key: "last", header: "Last run", cell: (r) => format.ago(r.last, now), value: (r) => (r.last == null ? null : new Date(r.last)), missing: "Never", hideBelow: "sm" },
    { key: "next", header: "Next run", cell: (r) => format.ago(r.next, now), value: (r) => (r.next == null ? null : new Date(r.next)), hideBelow: "sm" },
  ];
  return <DataTable caption={caption} columns={columns} rows={rows} rowKey={(r) => r.label} className={className} />;
}
