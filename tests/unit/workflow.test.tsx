import { describe, expect, it } from "vitest";
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { DataView, JobsTable, WorkflowSteps, WorkflowSummary, summariseWorkflow, fetchJson, isWorkflowRunning, useLoad, useWorkflowRun } from "../../src";
import { expectOneFilledButton, renderWithStrata } from "../../src/testing";
import { describeJob, firingRuns, studioJobs, workflowNow, type Task, type WorkflowRun } from "../../stories/fixtures/workflow";
import { api } from "../../stories/mocks/handlers";
import { server } from "../utils/server";

// strata-python's shared workflow and queue routes drawn by one step list and one jobs table. The
// fixtures are typed by the generated `Schema<"WorkflowRun">` and `Schema<"Task">`, so this file
// compiling is the check that the components take the contract as it comes.

const FINISHED = ["done", "failed", "cancelled"] as const;

function steps(run: WorkflowRun, actions: { approve?: (s: string) => Promise<unknown>; retry?: () => Promise<unknown> } = {}) {
  return (
    <WorkflowSteps
      label="Firing f-0412"
      stages={run.stages}
      now={workflowNow}
      onApprove={actions.approve && ((s) => actions.approve!(s.name))}
      onRetry={actions.retry && (() => actions.retry!())}
    />
  );
}

describe("WorkflowSteps", () => {
  it("says each stage's state as a word, with when it ran and how long it took", () => {
    renderWithStrata(steps(firingRuns.waiting));
    const list = screen.getByRole("list", { name: "Firing f-0412" });
    const rows = within(list).getAllByRole("listitem");
    expect(rows.map((r) => r.textContent)).toEqual([
      "Load the kiln" + "Done" + "Ran 11 minutes ago, took 0:42",
      "Fire to cone 6" + "Done" + "Ran 2 minutes ago, took 9:05",
      "Inspect the pieces" + "Needs review",
      "Photograph the pieces" + "Waiting",
    ]);
  });

  it("puts Approve on the waiting gate as the view's one filled button, and calls the app", async () => {
    const user = userEvent.setup();
    const approved: string[] = [];
    renderWithStrata(steps(firingRuns.waiting, { approve: async (s) => void approved.push(s) }));
    const button = screen.getByRole("button", { name: "Approve: Inspect the pieces" });
    expect(expectOneFilledButton()).toBe(button);
    await user.click(button);
    expect(approved).toEqual(["inspect"]);
    expect(await screen.findByRole("button", { name: "Approve: Inspect the pieces" })).toHaveTextContent("Approved");
  });

  it("names a failed stage's error and offers Try again; says who approved a gate", async () => {
    const user = userEvent.setup();
    let tries = 0;
    renderWithStrata(steps(firingRuns.failed, { retry: async () => void tries++ }));
    expect(screen.getByText("OSError: the camera on shelf 2 did not answer")).toBeInTheDocument();
    expect(screen.getByText("Approved by Mira 5 minutes ago")).toBeInTheDocument();
    expect(screen.getByText("Failed")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Try again: Photograph the pieces" }));
    expect(tries).toBe(1);
  });

  it("says a gate approved by its policy was approved automatically; no buttons without actions; renamed words", () => {
    renderWithStrata(
      <WorkflowSteps label="Firing" stages={firingRuns.done.stages} now={workflowNow} words={{ approved: "Passed", done: "Finished" }} />,
    );
    expect(screen.getByText("Approved automatically 5 minutes ago")).toBeInTheDocument();
    expect(screen.getByText("Passed")).toBeInTheDocument();
    expect(screen.getAllByText("Finished")).toHaveLength(3);
    expect(screen.queryByRole("button")).toBeNull();
  });

  it("draws a state it does not know as waiting, and a cleared record as nothing", () => {
    const odd = [{ name: "x", title: "Glaze", gate: false, state: "new-word", last: { status: "cleared", at: workflowNow.toISOString() } }];
    renderWithStrata(<WorkflowSteps label="Odd" stages={odd} />);
    expect(screen.getByRole("listitem")).toHaveTextContent(/^GlazeWaiting$/);
  });
});

function Firing() {
  const run = useWorkflowRun({
    queryKey: ["firing", "f-0412"],
    queryFn: () => fetchJson<WorkflowRun>(api.firingRun),
    finished: FINISHED,
    every: 20,
  });
  return (
    <DataView state={run} skeleton={<p>Loading</p>} isEmpty={() => false} empty={null}>
      {(r) => (
        <>
          <p aria-label="Running">{String(run.running)}</p>
          <WorkflowSteps label="Firing" stages={r.stages} now={workflowNow} />
        </>
      )}
    </DataView>
  );
}

describe("useWorkflowRun", () => {
  it("polls while the run's job is going and stops when it ends", async () => {
    const answers = [firingRuns.running, firingRuns.running, firingRuns.waiting];
    let reads = 0;
    server.use(http.get(api.firingRun, () => HttpResponse.json(answers[Math.min(reads++, answers.length - 1)])));
    renderWithStrata(<Firing />);
    expect(await screen.findByLabelText("Running")).toHaveTextContent("true");
    await waitFor(() => expect(screen.getByLabelText("Running")).toHaveTextContent("false"));
    expect(screen.getByText("Needs review")).toBeInTheDocument();
    const after = reads;
    await new Promise((r) => setTimeout(r, 80));
    expect(reads).toBe(after);
  });

  it("isWorkflowRunning reads the job's state, and a run with no job is not running", () => {
    expect(isWorkflowRunning(firingRuns.running, FINISHED)).toBe(true);
    expect(isWorkflowRunning(firingRuns.waiting, new Set(FINISHED))).toBe(false);
    expect(isWorkflowRunning(firingRuns.notStarted, FINISHED)).toBe(false);
  });
});

function Jobs() {
  const load = useLoad({ queryKey: ["jobs"], queryFn: () => fetchJson<{ items: Task[] }>(api.jobs) });
  return (
    <DataView state={load} skeleton={<p>Loading</p>} isEmpty={(p) => p.items.length === 0} empty={<p>No jobs</p>}>
      {(p) => (
        <JobsTable
          caption="Jobs"
          jobs={p.items}
          describe={describeJob}
          now={workflowNow}
          onCancel={(j) => fetchJson(api.cancelJob(j.id), { method: "POST" })}
          onRetry={(j) => fetchJson(api.retryJob(j.id), { method: "POST" })}
        />
      )}
    </DataView>
  );
}

describe("JobsTable", () => {
  it("lists jobs with their state as a word, progress or error, and actions only where they apply", async () => {
    const user = userEvent.setup();
    const posted: string[] = [];
    server.use(
      http.post("/api/jobs/:id/:action", ({ params }) => {
        posted.push(`${params.action} ${params.id}`);
        return HttpResponse.json(studioJobs[0]);
      }),
    );
    renderWithStrata(<Jobs />);
    const table = await screen.findByRole("grid", { name: "Jobs" });
    const rows = within(table).getAllByRole("row").slice(1);
    expect(rows.map((r) => within(r).getAllByRole("gridcell")[0]!.textContent)).toEqual(["Running", "Queued", "Failed", "Cancelled", "Done"]);
    expect(within(rows[0]!).getByText("Tile 3 of 12")).toBeInTheDocument();
    expect(within(rows[2]!).getByText("OSError: the camera on shelf 2 did not answer")).toBeInTheDocument();
    expect(within(rows[4]!).queryByRole("button")).toBeNull();
    expect(within(rows[3]!).getByText(/hour ago/)).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Cancel Test glaze celadon" }));
    await user.click(screen.getByRole("button", { name: "Cancel Photograph firing f-0413" }));
    await user.click(screen.getByRole("button", { name: "Run again Photograph firing f-0412" }));
    await user.click(screen.getByRole("button", { name: "Run again Test glaze tenmoku" }));
    await waitFor(() => expect(posted).toEqual(["cancel 45", "cancel 44", "retry 43", "retry 42"]));
  });

  it("names a job by its kind without describe, and draws an unknown state as queued", () => {
    const odd = { ...studioJobs[4]!, state: "paused" as Task["state"] };
    renderWithStrata(<JobsTable caption="Jobs" jobs={[odd]} now={workflowNow} />);
    expect(screen.getByText("workflow:firing")).toBeInTheDocument();
    expect(screen.getByText("Queued")).toBeInTheDocument();
  });
});

describe("WorkflowSummary (#373)", () => {
  it("reduces a run to the state that matters and the stage it is about", () => {
    expect(summariseWorkflow(firingRuns.notStarted.stages)).toMatchObject({ state: "ready", done: 0, total: 4 });
    expect(summariseWorkflow(firingRuns.running.stages, { running: true })).toMatchObject({ state: "running", step: 2, stage: { name: "fire" } });
    expect(summariseWorkflow(firingRuns.waiting.stages)).toMatchObject({ state: "waiting", step: 3, stage: { name: "inspect" } });
    expect(summariseWorkflow(firingRuns.failed.stages)).toMatchObject({ state: "failed", stage: { name: "photograph" } });
    expect(summariseWorkflow(firingRuns.done.stages)).toMatchObject({ state: "done", done: 4, total: 4 });
  });

  it("says running before a failure its job is trying again, and part done for a run stopped part way", () => {
    expect(summariseWorkflow(firingRuns.failed.stages, { running: true })).toMatchObject({ state: "running", stage: { name: "photograph" }, step: 4 });
    const part = firingRuns.running.stages.map((s) => ({ ...s, state: s.state === "done" ? "done" : "ready" }));
    expect(summariseWorkflow(part)).toMatchObject({ state: "partial", done: 1 });
  });

  it("draws the word and the stage, in the same words as WorkflowSteps unless renamed", () => {
    const { unmount } = renderWithStrata(<WorkflowSummary stages={firingRuns.waiting.stages} />);
    expect(screen.getByText("Needs review")).toBeInTheDocument();
    expect(screen.getByText("Inspect the pieces")).toBeInTheDocument();
    unmount();
    renderWithStrata(<WorkflowSummary stages={firingRuns.running.stages} running words={{ running: "Firing" }} />);
    expect(screen.getByText("Firing")).toBeInTheDocument();
    expect(screen.getByText("Fire to cone 6, step 2 of 4")).toBeInTheDocument();
  });
});
