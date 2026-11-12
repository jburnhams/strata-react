import * as React from "react";
import { Check, CircleAlert, LoaderCircle, TriangleAlert, Ban } from "lucide-react";
import { format } from "../lib/format";
import type { IconComponent } from "../lib/icon";
import { cn } from "../lib/utils";
import { Button } from "./button";
import { Status, type Tone } from "./status";

// A job the server runs for a while (syncing sources one after another, an import, a re-index),
// as the screen that started it shows it (strata-react issue #45, from the Tubes Library screen,
// which built each part by hand). Three things are true of every such job, and the props make
// each one impossible to leave out:
//
// - Its state is a word, as `Status` is: `words` names running, finished and failed in the
//   product's terms ("Syncing", "Finished", "Finished with failures"), all three required, so a
//   screen cannot forget the end it did not test. Beside the word, `summary` is the app's own
//   sentence ("Syncing 2 of 3: Night Sky. 42 new videos so far.").
// - How far it has got is a bar only when the total is known (`current` of `total`), a
//   `progressbar`, not a `meter`: this is a task moving to done. Without a total there is no bar,
//   because a bar that guesses is worse than the sentence.
// - When it ends, each item that failed is named with its reason (`failures`), because "3
//   failed" alone sends the person hunting. A job that failed as a whole (`failed`, the summary
//   saying why) names no item.
//
// It is announced, politely, only when something a person waits for happens: the item changes
// (`current`) or the job ends. A poll every two seconds that rewrites "42 new videos so far" in
// a live region would talk over everything else, so the visible sentence is not the live region;
// a separate one carries the word and the sentence at those moments.
//
// Work the browser does (an export, an upload, a render; issue #72) uses the same component, so one
// idea of "a job" covers both: `onCancel` shows a Cancel button while it runs (work the person can
// stop is stoppable), `cancelled` is a fourth ending in neutral ("Cancelled": not a failure, nothing
// to retry), and `onDismiss` shows Dismiss once it has ended so the result does not linger. With no
// `total` there is no bar, only the turning mark and the sentence, which is the indeterminate case. The spinner turns only
// while running, the one case where a status mark's data is live. Polling and re-reading what
// the job changed is `useJob`'s.

/** An item a job could not do, and why, in the product's words. */
export type JobFailure = { key: string; label: string; reason: string };

/** A job's three states as words, all required: "Syncing", "Finished", "Finished with failures". */
export type JobWords = { running: string; finished: string; failed: string; /** Shown when `cancelled`. Default "Cancelled". */ cancelled?: string };

/** The job status's props. */
export type JobStatusProps = {
  /** What the job is ("Library sync"): names the section and the progress bar. */
  label: string;
  /** The job is still going. */
  running: boolean;
  words: JobWords;
  /** The app's sentence for where the job is or how it went: "Syncing 2 of 3: Night Sky." */
  summary: string;
  /** Items done or being done, with `total`, for the bar. */
  current?: number;
  /** Items in all, when known. No bar without it. */
  total?: number;
  /** Each item that failed, with its reason. Any failure makes a finished job `failed`'s word. */
  failures?: JobFailure[];
  /** The job failed as a whole, for a reason that names no item (the summary says it). */
  failed?: boolean;
  /** Names the list of failures for screen readers. Default "Failures". */
  failuresLabel?: string;
  /** The person stopped it. A neutral ending, not a failure. */
  cancelled?: boolean;
  /** Stops the job. Shows a Cancel button while it runs. */
  onCancel?: () => void;
  /** Label of the cancel button. Default "Cancel". */
  cancelLabel?: string;
  /** Clears the result. Shows a Dismiss button once the job has ended. */
  onDismiss?: () => void;
  className?: string;
};

const Spinner: IconComponent = ({ className, ...props }) => (
  <LoaderCircle {...props} className={cn(className, "motion-safe:animate-spin")} />
);

/** A long-running server job: its state as a required word beside the app's sentence, a progress bar when the total is known, each failure named with its reason, and a polite announcement only when the item changes or the job ends. */
export function JobStatus({
  label,
  running,
  words,
  summary,
  current,
  total,
  failures = [],
  failed = false,
  failuresLabel = "Failures",
  cancelled = false,
  onCancel,
  cancelLabel = "Cancel",
  onDismiss,
  className,
}: JobStatusProps) {
  const ended: { tone: Tone; icon: IconComponent; word: string } = cancelled
    ? { tone: "neutral", icon: Ban, word: words.cancelled ?? "Cancelled" }
    : failed
    ? { tone: "danger", icon: CircleAlert, word: words.failed }
    : failures.length
      ? { tone: "warning", icon: TriangleAlert, word: words.failed }
      : { tone: "success", icon: Check, word: words.finished };
  const { tone, icon, word } = running ? { tone: "info" as const, icon: Spinner, word: words.running } : ended;

  // What is announced changes only with the item or the end, not with every poll's sentence.
  const moment = running ? `running:${current ?? ""}` : `ended:${word}`;
  const [said, setSaid] = React.useState({ moment, text: "" });
  if (said.moment !== moment) setSaid({ moment, text: `${word}. ${summary}` });

  const bar = running && total !== undefined && total > 0 && current !== undefined;
  const done = Math.min(total ?? 0, Math.max(0, current ?? 0));

  return (
    <section aria-label={label} className={cn("grid min-w-0 gap-3", className)}>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <Status tone={tone} icon={icon}>
          {word}
        </Status>
        <p className="min-w-0 flex-1 type-body-sm text-foreground">{summary}</p>
        {running && onCancel && (
          <Button size="sm" onPress={onCancel}>
            {cancelLabel}
          </Button>
        )}
        {!running && onDismiss && (
          <Button size="sm" variant="ghost" onPress={onDismiss}>
            Dismiss
          </Button>
        )}
      </div>
      {bar && (
        <div
          role="progressbar"
          aria-label={label}
          aria-valuemin={0}
          aria-valuemax={total}
          aria-valuenow={done}
          aria-valuetext={`${format.integer(done)} of ${format.integer(total)}`}
          className="relative h-2 overflow-hidden rounded-pill bg-muted"
        >
          <div className="absolute inset-y-0 left-0" style={{ width: `${(done / total) * 100}%`, background: "var(--chart-1)" }} />
        </div>
      )}
      {!running && failures.length > 0 && (
        <ul aria-label={failuresLabel} className="grid gap-1 border-l-2 border-warning pl-3 type-body-sm">
          {failures.map((f) => (
            <li key={f.key}>
              <span className="type-label">{f.label}</span>
              <span className="text-muted-foreground">: {f.reason}</span>
            </li>
          ))}
        </ul>
      )}
      <p role="status" className="sr-only">
        {said.text}
      </p>
    </section>
  );
}
