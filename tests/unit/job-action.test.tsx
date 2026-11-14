import { describe, expect, it, vi, afterEach } from "vitest";
import { act, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useLocation } from "react-router";
import { AsyncButton, JobStatus, StrataToastRegion, jobProgressText, toast, useJobAction, type Job } from "../../src";
import { resetToastWarnings } from "../../src/components/toast";
import { renderWithStrata } from "../../src/testing";

// Issues #248 (a pending ghost AsyncButton), #249 (a toast with no region says so) and #250 (a button
// that starts a server job, and a shared progress shape).

type Status = { running: boolean; done: number };
const labels = { idle: "Scan", pending: "Scanning…", done: "Scanned" };

function fakeJob(status: Status, poll = () => {}): Job<Status> {
  return { status: "ready", data: status, running: status.running, poll } as Job<Status>;
}

function Row({ status, start, poll }: { status: Status; start: () => Promise<{ id: string }>; poll?: () => void }) {
  const action = useJobAction({
    start,
    job: fakeJob(status, poll),
    queued: () => ({ title: "Scan queued", description: "Kiln roll 12" }),
    done: (s) => ({ title: `Scanned ${s.done} pictures` }),
    jobsHref: "/jobs",
  });
  return (
    <>
      <p aria-label="Path">{useLocation().pathname}</p>
      <AsyncButton size="sm" variant="ghost" phase={action.phase} labels={labels} error={action.error} onPress={() => void action.run()} />
    </>
  );
}

describe("AsyncButton as a row action (#248)", () => {
  it("takes variant and size, and says it is busy while pending", () => {
    renderWithStrata(<AsyncButton size="sm" variant="ghost" phase="pending" labels={labels} />);
    const button = screen.getByRole("button");
    expect(button).toHaveAttribute("aria-busy", "true");
    expect(button).toBeDisabled();
    expect(button).toHaveAttribute("data-variant", "ghost");
  });
});

describe("toast with no region (#249)", () => {
  afterEach(() => vi.restoreAllMocks());
  it("warns once in development when nothing is mounted to show it", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    resetToastWarnings();
    toast.show({ title: "Nobody sees this" });
    toast.show({ title: "Nor this" });
    expect(warn).toHaveBeenCalledTimes(1);
    expect(warn.mock.calls[0][0]).toMatch(/no StrataToastRegion is mounted/);
    resetToastWarnings();
    toast.clear();
  });
  it("stays quiet when a region is mounted", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    resetToastWarnings();
    renderWithStrata(<StrataToastRegion />, { toasts: false });
    act(() => void toast.show({ title: "Seen" }));
    expect(warn).not.toHaveBeenCalled();
  });
});

describe("jobProgressText and JobStatus progress (#250)", () => {
  it("says how many are done, how many remain and what it is on", () => {
    expect(jobProgressText({ done: 3, total: 9, current: "Night Sky" })).toBe("3 of 9 done, 6 remaining · Night Sky");
    expect(jobProgressText({ done: 12, total: 9 })).toBe("9 of 9 done, 0 remaining");
  });
  it("draws the bar and the sentence from one object", () => {
    renderWithStrata(<JobStatus label="Scan" running words={{ running: "Scanning", finished: "Finished", failed: "Failed" }} summary="Scanning the roll." progress={{ done: 3, total: 9, current: "Frame 4" }} />);
    expect(screen.getByRole("progressbar")).toHaveAttribute("aria-valuenow", "3");
    expect(screen.getByText("3 of 9 done, 6 remaining · Frame 4")).toBeInTheDocument();
  });
});

describe("useJobAction (#250)", () => {
  it("is busy until the job ends, with a queued toast that goes to the jobs page and a finished toast", async () => {
    const user = userEvent.setup();
    const start = vi.fn().mockResolvedValue({ id: "j1" });
    const poll = vi.fn();
    const { rerender } = renderWithStrata(
      <>
        <StrataToastRegion />
        <Row status={{ running: false, done: 0 }} start={start} poll={poll} />
      </>,
      { toasts: false },
    );
    await user.click(screen.getByRole("button", { name: "Scan" }));
    expect(start).toHaveBeenCalledTimes(1);
    expect(poll).toHaveBeenCalled();
    expect(await screen.findByText("Scan queued")).toBeInTheDocument();
    // The job is running: the button stays busy though the request returned.
    rerender(
      <>
        <StrataToastRegion />
        <Row status={{ running: true, done: 2 }} start={start} poll={poll} />
      </>,
    );
    expect(screen.getByRole("button", { name: /Scanning/ })).toBeDisabled();
    await user.click(screen.getByRole("button", { name: "Show jobs" }));
    expect(screen.getByLabelText("Path")).toHaveTextContent("/jobs");
    rerender(
      <>
        <StrataToastRegion />
        <Row status={{ running: false, done: 14 }} start={start} poll={poll} />
      </>,
    );
    expect(await screen.findByText("Scanned 14 pictures")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Scan" })).toBeEnabled();
  });

  it("shows a failure to start on the button and makes no toast", async () => {
    const user = userEvent.setup();
    const start = vi.fn().mockRejectedValue(new Error("The scanner is busy."));
    renderWithStrata(
      <>
        <StrataToastRegion />
        <Row status={{ running: false, done: 0 }} start={start} />
      </>,
      { toasts: false },
    );
    await user.click(screen.getByRole("button", { name: "Scan" }));
    expect(await screen.findByRole("button", { name: "Try again" })).toBeInTheDocument();
    expect(screen.queryByText("Scan queued")).toBeNull();
  });
});
