import type { Meta, StoryObj } from "@storybook/react-vite";
import { AsyncButton, DataView, JobStatus, Skeleton, fetchJson, format, useAsyncAction, useJob, type JobStatusProps } from "../src";
import { api, logSyncAt, logSyncs, type LogSync } from "./mocks/handlers";

// The kiln log sync: the server reads each kiln controller's log in turn, which takes a minute or
// two. The state stories fix one status each; "From the API" polls MSW with `useJob`, the same
// path a product runs. The panel's button is the only way to start a sync and is held while one
// runs, so a second cannot be started on top of the first.

const words = { running: "Reading logs", finished: "Finished", failed: "Finished with failures" };

/** The app's sentence for a status, written once and used by every story. */
function summary(s: LogSync) {
  if (s.running) return `Reading ${s.kiln} (${s.current} of ${s.total}). ${format.count(s.newReadings, "new reading")} so far.`;
  if (s.error) return `${s.error} Read ${s.current - 1} of ${s.total} kilns before it stopped.`;
  return `Read ${s.total - s.failures.length} of ${s.total} kilns: ${format.count(s.newReadings, "new reading")}.`;
}

/** The status's props for one `LogSync`. */
const statusOf = (s: LogSync): JobStatusProps => ({
  label: "Kiln log sync",
  running: s.running,
  words,
  summary: summary(s),
  current: s.current,
  total: s.total,
  failures: s.failures.map((f) => ({ key: f.kiln, label: f.kiln, reason: f.reason })),
  failed: Boolean(s.error),
});

function SyncPanel({ sync }: { sync: LogSync }) {
  const start = useAsyncAction(() => fetchJson(api.logSync, { method: "POST" }));
  const idle = !sync.running && sync.total === 0;
  return (
    <section className="grid max-w-xl gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="type-heading">Kiln logs</h2>
        <AsyncButton
          variant="default"
          phase={start.phase}
          error={start.error}
          disabled={sync.running}
          labels={{ idle: "Read kiln logs", pending: "Starting…", done: "Started" }}
          onClick={() => start.run()}
        />
      </div>
      {idle ? (
        <p className="type-body-sm text-muted-foreground">The logs have not been read since the server started. Reading them takes a minute or two.</p>
      ) : (
        <JobStatus {...statusOf(sync)} />
      )}
    </section>
  );
}

const meta = { title: "Status and figures/JobStatus", component: SyncPanel, args: { sync: logSyncs.running } } satisfies Meta<typeof SyncPanel>;
export default meta;
type Story = StoryObj<typeof meta>;

/** Before any sync: the button and a sentence, no status. */
export const Idle: Story = { args: { sync: logSyncs.idle } };
/** Running: the word, the sentence, a bar for kilns read so far; the button is held. */
export const Running: Story = { args: { sync: logSyncs.running } };
/** Finished: every kiln read. */
export const Finished: Story = { args: { sync: logSyncs.finished } };
/** Finished with failures: each kiln that failed is named with its reason. */
export const SomeFailed: Story = { args: { sync: logSyncs.someFailed } };
/** The sync stopped for a reason that names no kiln. */
export const Failed: Story = { args: { sync: logSyncs.failed } };
/** On a phone: the word above a wrapped sentence. */
export const RunningPhone: Story = { args: { sync: logSyncs.running }, tags: ["visual-phone"] };

// useJob polls the status every two seconds while it runs and reads the firing log again once it ends.
function FromApi() {
  const job = useJob({
    queryKey: ["log-sync"],
    queryFn: () => fetchJson<LogSync>(api.logSync),
    isRunning: (s) => s.running,
    invalidates: [["firings"]],
  });
  return (
    <DataView state={job} isEmpty={() => false} skeleton={<Skeleton className="h-16 max-w-xl" />} empty={null}>
      {(sync) => <SyncPanel sync={sync} />}
    </DataView>
  );
}

export const FromApiRunning: Story = { name: "From the API: running", beforeEach: ({ msw }) => msw.use(logSyncAt("running")), render: () => <FromApi /> };
export const FromApiSomeFailed: Story = {
  name: "From the API: finished with failures",
  beforeEach: ({ msw }) => msw.use(logSyncAt("someFailed")),
  render: () => <FromApi />,
};
