import * as React from "react";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { Alert, Button, JobStatus, StrataToastRegion, toast, useClientWork, type ToastContentProps } from "../src";

// Feedback has three weights. A toast confirms background work that finished and goes by itself; an
// alert sits where the problem is and stays until it is dealt with (an error a person must act on
// is never a toast); a job status shows work that is still going, with its end. Client work (an
// export the browser runs) uses the same JobStatus as a server job through `useClientWork`.

const meta = { title: "Feedback/Overview", parameters: { layout: "padded" } } satisfies Meta;
export default meta;
type Story = StoryObj<typeof meta>;

/** Four tones, each with its icon and words as well as colour. */
export const Alerts: Story = {
  render: () => (
    <div className="grid max-w-xl gap-3">
      <Alert tone="info">Readings from Kiln 2 are logged every five minutes.</Alert>
      <Alert tone="success" title="Imported">12 pieces added to the glaze library.</Alert>
      <Alert tone="warning" title="Kiln 2 is behind">Its last reading is 40 minutes old.</Alert>
      <Alert tone="danger" title="Export failed" announce action={<Button size="sm" variant="default">Try again</Button>}>
        The disk is full. Free some space and try again.
      </Alert>
    </div>
  ),
};

/** A toast pinned open for the visual suite; in use each goes after a few seconds. */
function Pinned(content: ToastContentProps) {
  React.useEffect(() => {
    const key = toast.show({ ...content, timeout: 600000 });
    return () => toast.close(key);
  }, []);
  return <StrataToastRegion />;
}

export const ToastSuccess: Story = {
  render: () => <Pinned title="Export finished" description="run.mp4, 2:31 at 1080p, is in your Downloads folder." tone="success" action={{ label: "Open file", onPress: () => {} }} />,
  decorators: [(Story) => <div className="h-40"><Story /></div>],
};

export const ToastWarning: Story = {
  render: () => <Pinned title="Kiln 2 is 40 min behind" tone="warning" />,
  decorators: [(Story) => <div className="h-40"><Story /></div>],
};

/** Phone width: the region moves to the top so it never covers the focused control. */
export const ToastOnPhone: Story = {
  tags: ["visual-phone"],
  render: () => <Pinned title="3 pieces synced" description="Moonbeam, Ash and Slate are up to date." />,
  decorators: [(Story) => <div className="h-40"><Story /></div>],
};

const words = { running: "Exporting", finished: "Exported", failed: "Export failed" };

export const ClientWorkRunning: Story = {
  render: () => <JobStatus label="Export" running words={words} summary="Rendering frame 1,240 of 4,520." current={1240} total={4520} onCancel={() => {}} />,
};

/** No total, so no bar: the turning mark and the sentence. */
export const ClientWorkIndeterminate: Story = {
  render: () => <JobStatus label="Export" running words={words} summary="Preparing the file." onCancel={() => {}} />,
};

export const ClientWorkCancelled: Story = {
  render: () => <JobStatus label="Export" running={false} cancelled words={words} summary="Stopped at frame 1,240 of 4,520. Nothing was saved." onDismiss={() => {}} />,
};

export const ClientWorkFailed: Story = {
  render: () => <JobStatus label="Export" running={false} failed words={words} summary="The disk is full. Free some space and try again." onDismiss={() => {}} />,
};

export const ClientWorkFailedItems: Story = {
  render: () => (
    <JobStatus
      label="Export"
      running={false}
      words={{ ...words, failed: "Exported with failures" }}
      summary="Exported 3 of 5 clips."
      failures={[{ key: "a", label: "Intro.mov", reason: "Format not supported." }, { key: "b", label: "Outro.mov", reason: "File changed during export." }]}
      onDismiss={() => {}}
    />
  ),
};

/** A real run: `useClientWork` drives the status, and a toast marks the end. */
export const Working: Story = {
  tags: ["no-visual"],
  render: function Render() {
    const work = useClientWork(async ({ signal, progress }) => {
      for (let i = 1; i <= 5; i++) {
        await new Promise((r) => setTimeout(r, 600));
        if (signal.aborted) return;
        progress(i, 5);
      }
      toast.show({ title: "Export finished", tone: "success" });
    });
    return (
      <div className="grid max-w-xl gap-3">
        {work.phase === "idle" ? (
          <Button variant="default" onPress={() => void work.start()}>Export clip</Button>
        ) : (
          <JobStatus
            label="Export"
            running={work.phase === "running"}
            cancelled={work.phase === "cancelled"}
            failed={work.phase === "failed"}
            words={words}
            summary={work.phase === "running" ? `Rendering ${work.current ?? 0} of 5.` : work.phase === "cancelled" ? "Stopped." : "Exported 5 of 5."}
            current={work.current}
            total={work.total}
            onCancel={work.cancel}
            onDismiss={work.dismiss}
          />
        )}
        <StrataToastRegion />
      </div>
    );
  },
};
