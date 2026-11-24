import { Check, CircleAlert, CircleDashed, Clock, Eye, RotateCcw } from "lucide-react";
import { format } from "../lib/format";
import type { IconComponent } from "../lib/icon";
import { cn } from "../lib/utils";
import { AsyncButton, useAsyncAction } from "./async-button";
import { Status, type Tone } from "./status";

// A subject's way through a pipeline (strata-python's `workflow`: a book's ingest, a tape's derived
// assets, a picture's develop), drawn from the shared `/api/workflows/<pipeline>/subjects/<subject>`
// answer, `WorkflowRun`. strata-listory drew its review phases, strata-360 its state matrix and
// strata-reels nothing yet; the server shape is now one, so the screen is one. The rules:
//
// - Each stage is a row with its state as a word (`Status`), never a bare tick or dot. The six
//   states have fixed meanings on the server, so their words default here ("Done", "Needs review",
//   "Failed", "Out of date", "Not started", "Waiting"); `words` renames them in the product's terms.
// - A gate (a person's approval) that is waiting gets the row's one action, "Approve", and the first
//   waiting gate's button is the view's filled one (one filled button per view). A gate approved by
//   a person says who ("Approved by ada"); one approved by its policy says "Approved automatically".
// - A failed stage names its error in the server's words and offers "Try again", which re-runs the
//   subject (the queue resumes at the failure); it is outline, as a recovery, not the main action.
// - The stage's last record says what a person wants next to the word: how long it took, and when
//   (`format.ago`, with `now` for tests).
// - Types are the app's generated ones (`Schema<"WorkflowRun">` from `strata-api-types`): the props
//   ask only for the fields drawn, so nothing of the contract is written again here.

/** A stage's state on the server: `strata_python.contracts.StageState`. */
export type StageState = "done" | "ready" | "stale" | "failed" | "waiting" | "blocked";

/** The fields of a stage `WorkflowSteps` draws: the shape of `Schema<"StageRun">`, which satisfies it. */
export type WorkflowStage = {
  name: string;
  title: string;
  gate: boolean;
  state: string;
  last?: { status: string; at: string; elapsed_s?: number; error?: string | null; by?: string | null } | null;
};

/** Each state's word, in the product's terms. Any left out keeps its default. */
export type StageWords = Partial<Record<StageState | "approved", string>>;

const DEFAULT_WORDS: Record<StageState | "approved", string> = {
  done: "Done",
  approved: "Approved",
  ready: "Not started",
  stale: "Out of date",
  failed: "Failed",
  waiting: "Needs review",
  blocked: "Waiting",
};

const LOOKS: Record<StageState, { tone: Tone; icon: IconComponent }> = {
  done: { tone: "success", icon: Check },
  ready: { tone: "neutral", icon: CircleDashed },
  stale: { tone: "warning", icon: RotateCcw },
  failed: { tone: "danger", icon: CircleAlert },
  waiting: { tone: "info", icon: Eye },
  blocked: { tone: "neutral", icon: Clock },
};

/** The workflow steps' props. */
export type WorkflowStepsProps<S extends WorkflowStage> = {
  /** What the subject's pipeline is ("Ingest of Wolf Hall"): names the list. */
  label: string;
  /** The stages in order: `WorkflowRun.stages`. */
  stages: S[];
  /** Approves a gate (the POST to `.../stages/<name>/approve`). Without it, a waiting gate has no button. */
  onApprove?: (stage: S) => Promise<unknown>;
  /** Runs the subject again (the POST to `.../run`). Without it, a failed stage has no button. */
  onRetry?: (stage: S) => Promise<unknown>;
  /** Renames the states. */
  words?: StageWords;
  /** "Now", for `format.ago` (tests and screenshots). */
  now?: Date;
  className?: string;
};

function wordOf(stage: WorkflowStage, words: Record<StageState | "approved", string>): string {
  const state = (stage.state in LOOKS ? stage.state : "blocked") as StageState;
  if (state === "done" && stage.gate) return words.approved;
  return words[state];
}

function detailOf(stage: WorkflowStage, now: Date | undefined): string | null {
  const last = stage.last;
  if (!last || last.status === "cleared") return null;
  const when = format.ago(last.at, now);
  if (stage.gate && last.status === "done") return last.by === "auto" ? `Approved automatically ${when}` : `Approved by ${last.by ?? "someone"} ${when}`;
  const took = last.elapsed_s != null && last.elapsed_s >= 1 ? `, took ${format.runningTime(last.elapsed_s)}` : "";
  return `${last.status === "failed" ? "Failed" : "Ran"} ${when}${took}`;
}

function StageAction<S extends WorkflowStage>({ stage, filled, run, labels }: { stage: S; filled: boolean; run: (s: S) => Promise<unknown>; labels: { idle: string; pending: string; done: string } }) {
  const action = useAsyncAction(() => run(stage));
  return (
    <AsyncButton
      size="sm"
      variant={filled ? "default" : "outline"}
      phase={action.phase}
      error={action.error}
      labels={labels}
      aria-label={`${labels.idle}: ${stage.title}`}
      onClick={() => void action.run()}
    />
  );
}

/** A subject's stages through a strata-python pipeline, each with its state as a word, when it last ran, its error, and Approve on a waiting gate or Try again on a failed stage. */
export function WorkflowSteps<S extends WorkflowStage>({ label, stages, onApprove, onRetry, words, now, className }: WorkflowStepsProps<S>) {
  const all = { ...DEFAULT_WORDS, ...words };
  const firstWaiting = stages.find((s) => s.gate && s.state === "waiting")?.name;
  return (
    <ol aria-label={label} className={cn("grid min-w-0 gap-0 divide-y divide-border", className)}>
      {stages.map((stage) => {
        const state = (stage.state in LOOKS ? stage.state : "blocked") as StageState;
        const look = stage.state === "done" && stage.gate ? { tone: "success" as const, icon: Check } : LOOKS[state];
        const detail = detailOf(stage, now);
        const error = state === "failed" ? stage.last?.error : null;
        return (
          <li key={stage.name} className="grid gap-1 py-3">
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
              <span className="min-w-0 flex-1 type-label text-foreground">{stage.title}</span>
              {state === "waiting" && stage.gate && onApprove && (
                <StageAction stage={stage} filled={stage.name === firstWaiting} run={onApprove} labels={{ idle: "Approve", pending: "Approving…", done: "Approved" }} />
              )}
              {state === "failed" && onRetry && <StageAction stage={stage} filled={false} run={onRetry} labels={{ idle: "Try again", pending: "Starting…", done: "Started" }} />}
              <Status tone={look.tone} icon={look.icon}>
                {wordOf(stage, all)}
              </Status>
            </div>
            {detail && <p className="type-caption text-muted-foreground">{detail}</p>}
            {error && <p className="type-body-sm text-danger">{error}</p>}
          </li>
        );
      })}
    </ol>
  );
}
