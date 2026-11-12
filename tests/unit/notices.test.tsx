import * as React from "react";
import { act, render, renderHook, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { afterEach, describe, expect, it, vi } from "vitest";
import { Alert, JobStatus, StrataToastRegion, toast, toastTimeout, useClientWork } from "../../src";
import { server } from "../utils/server";

const words = { running: "Exporting", finished: "Exported", failed: "Export failed" };

afterEach(() => {
  act(() => toast.clear());
  vi.useRealTimers();
});

describe("Alert", () => {
  it("is a plain region until it answers something the person just did", () => {
    const { rerender } = render(<Alert tone="warning" title="Kiln 2 is behind">Readings are 40 minutes old.</Alert>);
    expect(screen.getByRole("region", { name: "Kiln 2 is behind" })).toHaveTextContent("Readings are 40 minutes old.");
    expect(screen.queryByRole("alert")).toBeNull();
    rerender(<Alert tone="danger" announce>Export failed.</Alert>);
    expect(screen.getByRole("alert")).toHaveTextContent("Export failed.");
  });

  it("carries one recovery action", async () => {
    const user = userEvent.setup();
    const retry = vi.fn();
    render(<Alert tone="danger" action={<button onClick={retry}>Try again</button>}>Export failed.</Alert>);
    await user.click(screen.getByRole("button", { name: "Try again" }));
    expect(retry).toHaveBeenCalled();
  });
});

describe("toast", () => {
  it("stays long enough to read, longer with an action, and honours an explicit time", () => {
    expect(toastTimeout({ title: "Done" })).toBe(5160);
    expect(toastTimeout({ title: "x".repeat(1000) })).toBe(15000);
    expect(toastTimeout({ title: "Hi", action: { label: "Open", onPress: () => {} } })).toBe(8000);
    expect(toastTimeout({ title: "Hi", timeout: 1234 })).toBe(1234);
  });

  it("appears in a labelled region, runs its action once and can be dismissed", async () => {
    const user = userEvent.setup();
    const open = vi.fn();
    render(<StrataToastRegion />);
    act(() => {
      toast.show({ title: "Export finished", description: "run.mp4 is in Downloads.", tone: "success", action: { label: "Open file", onPress: open } });
    });
    const region = await screen.findByRole("region", { name: "Notifications" });
    expect(within(region).getByText("Export finished")).toBeInTheDocument();
    await user.click(within(region).getByRole("button", { name: "Open file" }));
    expect(open).toHaveBeenCalledTimes(1);
    await waitFor(() => expect(screen.queryByText("Export finished")).toBeNull());
  });

  it("goes away on Dismiss and when it times out", async () => {
    const user = userEvent.setup();
    render(<StrataToastRegion />);
    act(() => void toast.show({ title: "Synced 3 pieces" }));
    await user.click(await screen.findByRole("button", { name: "Dismiss" }));
    await waitFor(() => expect(screen.queryByText("Synced 3 pieces")).toBeNull());
    act(() => void toast.show({ title: "Quick", timeout: 50 }));
    expect(await screen.findByText("Quick")).toBeInTheDocument();
    await waitFor(() => expect(screen.queryByText("Quick")).toBeNull(), { timeout: 2000 });
  });
});

describe("JobStatus for client work", () => {
  it("offers Cancel only while running, and Dismiss only after it ends", async () => {
    const user = userEvent.setup();
    const onCancel = vi.fn();
    const onDismiss = vi.fn();
    const { rerender } = render(<JobStatus label="Export" running words={words} summary="Rendering 2 of 5." current={2} total={5} onCancel={onCancel} onDismiss={onDismiss} />);
    expect(screen.queryByRole("button", { name: "Dismiss" })).toBeNull();
    await user.click(screen.getByRole("button", { name: "Cancel" }));
    expect(onCancel).toHaveBeenCalled();
    expect(screen.getByRole("progressbar", { name: "Export" })).toHaveAttribute("aria-valuenow", "2");
    rerender(<JobStatus label="Export" running={false} words={words} summary="Done." onCancel={onCancel} onDismiss={onDismiss} />);
    expect(screen.queryByRole("button", { name: "Cancel" })).toBeNull();
    await user.click(screen.getByRole("button", { name: "Dismiss" }));
    expect(onDismiss).toHaveBeenCalled();
  });

  it("has no bar without a total, and cancelled is its own word, not a failure", () => {
    const { rerender } = render(<JobStatus label="Export" running words={words} summary="Rendering." />);
    expect(screen.queryByRole("progressbar")).toBeNull();
    rerender(<JobStatus label="Export" running={false} cancelled words={words} summary="Stopped at 2 of 5." />);
    expect(screen.getAllByText("Cancelled").length).toBeGreaterThan(0);
    expect(screen.queryByText("Export failed")).toBeNull();
    rerender(<JobStatus label="Export" running={false} cancelled words={{ ...words, cancelled: "Stopped" }} summary="Stopped at 2 of 5." />);
    expect(screen.getAllByText("Stopped").length).toBeGreaterThan(0);
  });
});

describe("useClientWork", () => {
  it("runs, reports progress and finishes with the result", async () => {
    const { result } = renderHook(() =>
      useClientWork(async ({ progress }) => {
        progress(1, 3);
        progress(3);
        return "run.mp4";
      }),
    );
    expect(result.current.phase).toBe("idle");
    await act(() => result.current.start());
    expect(result.current).toMatchObject({ phase: "finished", result: "run.mp4" });
    act(() => result.current.dismiss());
    expect(result.current.phase).toBe("idle");
  });

  it("cancels real network work through its signal and ends cancelled, not failed", async () => {
    server.use(http.get("/api/slow", async () => new Promise<Response>(() => {})));
    const { result } = renderHook(() => useClientWork(async ({ signal }) => (await fetch("/api/slow", { signal })).text()));
    let done: Promise<void> = Promise.resolve();
    act(() => {
      done = result.current.start();
    });
    await waitFor(() => expect(result.current.phase).toBe("running"));
    act(() => result.current.cancel());
    await act(() => done);
    expect(result.current.phase).toBe("cancelled");
    expect(result.current.error).toBeUndefined();
  });

  it("fails with the error, ignores a second start while running, and can be run again", async () => {
    server.use(http.get("/api/export", () => HttpResponse.text("no space", { status: 507 })));
    let calls = 0;
    const { result } = renderHook(() =>
      useClientWork(async () => {
        calls++;
        const res = await fetch("/api/export");
        if (!res.ok) throw new Error(await res.text());
        return "ok";
      }),
    );
    await act(async () => {
      await Promise.all([result.current.start(), result.current.start()]);
    });
    expect(calls).toBe(1);
    expect(result.current.phase).toBe("failed");
    expect((result.current.error as Error).message).toBe("no space");
    server.use(http.get("/api/export", () => HttpResponse.text("fine")));
    await act(() => result.current.start());
    expect(result.current).toMatchObject({ phase: "finished", result: "ok" });
  });

  it("starts from a mount effect under Strict Mode and finishes, not cancelled", async () => {
    const wrapper = ({ children }: { children: React.ReactNode }) => <React.StrictMode>{children}</React.StrictMode>;
    const { result } = renderHook(
      () => {
        const work = useClientWork(async () => "done");
        const { start } = work;
        React.useEffect(() => {
          void start();
        }, [start]);
        return work;
      },
      { wrapper },
    );
    await waitFor(() => expect(result.current.phase).toBe("finished"));
    expect(result.current.result).toBe("done");
  });
});
