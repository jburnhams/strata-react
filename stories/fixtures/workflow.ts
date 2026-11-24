import type { Schema } from "./workflow-api.generated";

// A firing's way through the studio's pipeline, as strata-python's shared routes answer it
// (`/api/workflows/firing/subjects/<id>`, `/api/jobs`). The types are generated from those routes'
// OpenAPI schema (`workflow-openapi.json`, written by strata-python's `add_jobs` and `add_workflow`)
// with `strata-api-types`, as an app generates its own: nothing of the contract is typed by hand,
// and `WorkflowSteps` and `JobsTable` take these as they come.

export type WorkflowRun = Schema<"WorkflowRun">;
export type StageRun = Schema<"StageRun">;
export type Task = Schema<"Task">;

/** "Now" in every story and test: the records' times are minutes before it. */
export const workflowNow = new Date("2026-11-24T10:00:00Z");
const at = (minutes: number) => new Date(workflowNow.getTime() - minutes * 60_000).toISOString();

const event = (stage: string, status: string, minutes: number, extra: Partial<Schema<"StageEvent">> = {}): Schema<"StageEvent"> => ({
  stage,
  status,
  at: at(minutes),
  elapsed_s: 0,
  metrics: {},
  error: null,
  by: null,
  data: null,
  ...extra,
});

const stage = (name: string, title: string, state: StageRun["state"], last: Schema<"StageEvent"> | null = null, gate = false): StageRun => ({
  name,
  title,
  gate,
  needs: [],
  state,
  last,
});

export const firingJob = (state: Task["state"], extra: Partial<Task> = {}): Task => ({
  id: 41,
  kind: "workflow:firing",
  state,
  created_at: at(12),
  started_at: state === "queued" ? null : at(11),
  finished_at: state === "done" || state === "failed" ? at(1) : null,
  error: null,
  result: null,
  progress: null,
  attempts: 1,
  domain: "firing:f-0412",
  ...extra,
});

const run = (state: WorkflowRun["state"], stages: StageRun[], job: Task | null): WorkflowRun => ({
  pipeline: "firing",
  subject: "f-0412",
  state,
  waiting: stages.filter((s) => s.state === "waiting").map((s) => s.name),
  failed: stages.filter((s) => s.state === "failed").map((s) => s.name),
  stages,
  job,
});

/** The firing at each point of its way: what each story and test shows. */
export const firingRuns = {
  notStarted: run(
    "blocked",
    [
      stage("load", "Load the kiln", "ready"),
      stage("fire", "Fire to cone 6", "blocked"),
      stage("inspect", "Inspect the pieces", "blocked", null, true),
      stage("photograph", "Photograph the pieces", "blocked"),
    ],
    null,
  ),
  running: run(
    "blocked",
    [
      stage("load", "Load the kiln", "done", event("load", "done", 11, { elapsed_s: 42 })),
      stage("fire", "Fire to cone 6", "ready"),
      stage("inspect", "Inspect the pieces", "blocked", null, true),
      stage("photograph", "Photograph the pieces", "blocked"),
    ],
    firingJob("running", { progress: { done: 1, total: 4, text: "Fire to cone 6", stage: "fire", at: at(1) } }),
  ),
  waiting: run(
    "waiting",
    [
      stage("load", "Load the kiln", "done", event("load", "done", 11, { elapsed_s: 42 })),
      stage("fire", "Fire to cone 6", "done", event("fire", "done", 2, { elapsed_s: 545 })),
      stage("inspect", "Inspect the pieces", "waiting", null, true),
      stage("photograph", "Photograph the pieces", "blocked"),
    ],
    firingJob("done"),
  ),
  failed: run(
    "failed",
    [
      stage("load", "Load the kiln", "done", event("load", "done", 11, { elapsed_s: 42 })),
      stage("fire", "Fire to cone 6", "done", event("fire", "done", 9, { elapsed_s: 545 })),
      stage("inspect", "Inspect the pieces", "done", event("inspect", "done", 5, { by: "Mira" }), true),
      stage("photograph", "Photograph the pieces", "failed", event("photograph", "failed", 1, { error: "OSError: the camera on shelf 2 did not answer" })),
    ],
    firingJob("failed", { error: "OSError: the camera on shelf 2 did not answer" }),
  ),
  done: run(
    "done",
    [
      stage("load", "Load the kiln", "done", event("load", "done", 11, { elapsed_s: 42 })),
      stage("fire", "Fire to cone 6", "done", event("fire", "done", 9, { elapsed_s: 545 })),
      stage("inspect", "Inspect the pieces", "done", event("inspect", "done", 5, { by: "auto" }), true),
      stage("photograph", "Photograph the pieces", "done", event("photograph", "done", 4, { elapsed_s: 75 })),
    ],
    firingJob("done"),
  ),
} satisfies Record<string, WorkflowRun>;

/** The jobs page: one of each state, newest first. */
export const studioJobs: Task[] = [
  firingJob("running", { id: 45, kind: "glaze-test", domain: "glaze:celadon", created_at: at(1), progress: { done: 3, total: 12, text: "Tile 3 of 12", stage: null, at: at(0) } }),
  firingJob("queued", { id: 44, kind: "photograph", domain: "firing:f-0413", created_at: at(3) }),
  firingJob("failed", { id: 43, kind: "photograph", domain: "firing:f-0412", created_at: at(20), error: "OSError: the camera on shelf 2 did not answer" }),
  firingJob("cancelled", { id: 42, kind: "glaze-test", domain: "glaze:tenmoku", created_at: at(65) }),
  firingJob("done", { id: 41, created_at: at(180) }),
];

/** The person's words for a studio job. */
export function describeJob(t: Task): string {
  const what = t.domain?.split(":")[1] ?? "";
  if (t.kind === "glaze-test") return `Test glaze ${what}`;
  if (t.kind === "photograph") return `Photograph firing ${what}`;
  return `Firing ${what}`;
}
