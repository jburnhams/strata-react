import type { Meta, StoryObj } from "@storybook/react-vite";
import { DataView, JobStatus, JobsTable, Skeleton, WorkflowSteps, fetchJson, useWorkflowRun, type WorkflowStepsProps } from "../src";
import { describeJob, firingRuns, studioJobs, workflowNow, type StageRun, type WorkflowRun } from "./fixtures/workflow";
import { api } from "./mocks/handlers";

// A firing's way through the studio's pipeline (strata-python's `workflow`): load, fire, a person
// inspects the pieces, then they are photographed. Each story fixes the run at one point; "From the
// API" reads the shared route through MSW and polls while the firing's job runs, as a product does.
// The jobs table is the shared `/api/jobs` page.

const resolve = () => new Promise<void>((r) => setTimeout(r, 400));

function Steps(props: Omit<WorkflowStepsProps<StageRun>, "label" | "now">) {
  return (
    <section className="grid max-w-xl gap-3">
      <h2 className="type-heading">Firing f-0412</h2>
      <WorkflowSteps label="Firing f-0412" now={workflowNow} onApprove={resolve} onRetry={resolve} {...props} />
    </section>
  );
}

const meta = {
  title: "Status and figures/WorkflowSteps",
  component: Steps,
  args: { stages: firingRuns.waiting.stages },
} satisfies Meta<typeof Steps>;
export default meta;
type Story = StoryObj<typeof meta>;

/** Nothing has run: the first stage is ready, the rest wait on it. */
export const NotStarted: Story = { args: { stages: firingRuns.notStarted.stages } };
/** The kiln is loaded and the firing is under way. */
export const Running: Story = { args: { stages: firingRuns.running.stages } };
/** The firing is done and a person must inspect the pieces: Approve is the view's filled button. */
export const NeedsReview: Story = { args: { stages: firingRuns.waiting.stages } };
/** Photographing failed: its error in the server's words, and Try again. */
export const Failed: Story = { args: { stages: firingRuns.failed.stages } };
/** Every stage done; the inspection was passed by the studio's policy. */
export const Done: Story = { args: { stages: firingRuns.done.stages } };
/** The studio's own words for the states. */
export const OwnWords: Story = { args: { stages: firingRuns.done.stages, words: { approved: "Passed", done: "Finished" } } };
/** On a phone: the word wraps under a long title. */
export const NeedsReviewPhone: Story = { args: { stages: firingRuns.waiting.stages }, tags: ["visual-phone"] };

function FromApi() {
  const run = useWorkflowRun({
    queryKey: ["firing", "f-0412"],
    queryFn: () => fetchJson<WorkflowRun>(api.firingRun),
    finished: ["done", "failed", "cancelled"],
  });
  return (
    <section className="grid max-w-xl gap-4">
      <h2 className="type-heading">Firing f-0412</h2>
      <DataView state={run} isEmpty={() => false} empty={null} skeleton={<Skeleton className="h-48" />}>
        {(r) => (
          <>
            {r.job && run.running && (
              <JobStatus
                label="Firing"
                running
                words={{ running: "Firing", finished: "Fired", failed: "Stopped" }}
                summary={r.job.progress?.text ?? "Starting"}
                current={r.job.progress?.done}
                total={r.job.progress?.total ?? undefined}
              />
            )}
            <WorkflowSteps
              label="Firing f-0412"
              stages={r.stages}
              now={workflowNow}
              onApprove={(s) => fetchJson(api.approve(s.name), { method: "POST", json: {} }).then(run.poll)}
              onRetry={() => fetchJson(api.runFiring, { method: "POST" }).then(run.poll)}
            />
          </>
        )}
      </DataView>
    </section>
  );
}

/** The shared route through MSW, polled while its job runs. */
export const FromTheApi: Story = { render: () => <FromApi />, tags: ["no-visual"] };

/** The queue's jobs (`GET /api/jobs`): each state as a word, Cancel or Run again where it applies. */
export const Jobs: Story = {
  render: () => <JobsTable caption="Studio jobs" jobs={studioJobs} describe={describeJob} now={workflowNow} onCancel={resolve} onRetry={resolve} />,
  tags: ["visual-wide"],
};
