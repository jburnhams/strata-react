import { describe, expect, it, vi } from "vitest";
import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { HttpError, UndoBar, fetchJson, useUndoable, type PendingRemoval, type Undoable } from "../../src";
import { server } from "../utils/server";
import { api, withdrawServerError } from "../../stories/mocks/handlers";

type Removal = Pick<PendingRemoval, "commit" | "onError">;

// A row that the hook takes out of view, an Undo bar, and a handle on the hook for flush().
function Harness({ removal, api: handle = {}, id = "a" }: { removal: Removal; api?: { current?: Undoable }; id?: string }) {
  const undoable = useUndoable(8000);
  handle.current = undoable;
  return (
    <>
      {!undoable.isRemoved(id) && <p>Tom Ellery: 3 pieces in kiln 2.</p>}
      <button
        onClick={() =>
          undoable.schedule({ id, message: "Withdrew 3 pieces.", failure: "Tom Ellery's booking is back.", ...removal })
        }
      >
        Withdraw
      </button>
      <UndoBar inline undoable={undoable} />
    </>
  );
}

const row = () => screen.queryByText("Tom Ellery: 3 pieces in kiln 2.");

describe("useUndoable: the window", () => {
  it("removes the item at once and commits after the window", () => {
    vi.useFakeTimers();
    const commit = vi.fn();
    render(<Harness removal={{ commit }} />);
    act(() => screen.getByText("Withdraw").click());
    expect(row()).toBeNull();
    expect(screen.getByText("Withdrew 3 pieces.")).toBeInTheDocument();
    act(() => vi.advanceTimersByTime(7999));
    expect(commit).not.toHaveBeenCalled();
    act(() => vi.advanceTimersByTime(1));
    expect(commit).toHaveBeenCalledOnce();
    expect(screen.queryByText("Withdrew 3 pieces.")).toBeNull();
    expect(row()).toBeNull(); // a committed item stays out of view until the data drops it
    vi.useRealTimers();
  });

  it("Undo brings the item back and never commits", () => {
    vi.useFakeTimers();
    const commit = vi.fn();
    render(<Harness removal={{ commit }} />);
    act(() => screen.getByText("Withdraw").click());
    act(() => screen.getByRole("button", { name: "Undo" }).click());
    expect(row()).toBeInTheDocument();
    act(() => vi.advanceTimersByTime(10_000));
    expect(commit).not.toHaveBeenCalled();
    vi.useRealTimers();
  });

  it("one removal is pending at a time: a second commits the first at once", () => {
    vi.useFakeTimers();
    const commit = vi.fn();
    render(<Harness removal={{ commit }} />);
    act(() => screen.getByText("Withdraw").click());
    act(() => screen.getByText("Withdraw").click());
    expect(commit).toHaveBeenCalledOnce();
    act(() => vi.advanceTimersByTime(8000));
    expect(commit).toHaveBeenCalledTimes(2);
    vi.useRealTimers();
  });

  it("unmounting inside the window commits, once", () => {
    vi.useFakeTimers();
    const commit = vi.fn();
    const { unmount } = render(<Harness removal={{ commit }} />);
    act(() => screen.getByText("Withdraw").click());
    unmount();
    expect(commit).toHaveBeenCalledOnce();
    act(() => vi.advanceTimersByTime(10_000));
    expect(commit).toHaveBeenCalledOnce();
    vi.useRealTimers();
  });

  it("takes a window in options", () => {
    vi.useFakeTimers();
    const commit = vi.fn();
    function Short() {
      const u = useUndoable({ windowMs: 3000 });
      return <button onClick={() => u.schedule({ id: "a", message: "m", failure: "f", commit })}>Withdraw</button>;
    }
    render(<Short />);
    act(() => screen.getByText("Withdraw").click());
    act(() => vi.advanceTimersByTime(3000));
    expect(commit).toHaveBeenCalledOnce();
    vi.useRealTimers();
  });
});

describe("useUndoable: flush", () => {
  it("commits now, resolves when the commit settles, and the window does not commit again", async () => {
    vi.useFakeTimers();
    let finish!: () => void;
    const commit = vi.fn(() => new Promise<void>((r) => (finish = r)));
    const handle: { current?: Undoable } = {};
    render(<Harness removal={{ commit }} api={handle} />);
    act(() => screen.getByText("Withdraw").click());
    let flushed = false;
    let done!: Promise<void>;
    act(() => {
      done = handle.current!.flush().then(() => void (flushed = true));
    });
    expect(commit).toHaveBeenCalledOnce();
    expect(screen.queryByText("Withdrew 3 pieces.")).toBeNull();
    await Promise.resolve();
    expect(flushed).toBe(false);
    finish();
    await done;
    expect(flushed).toBe(true);
    act(() => vi.advanceTimersByTime(10_000));
    expect(commit).toHaveBeenCalledOnce();
    vi.useRealTimers();
  });

  it("also waits for an earlier commit still in flight, and rejects if it fails", async () => {
    vi.useFakeTimers();
    let fail!: (e: Error) => void;
    const slow = vi.fn(() => new Promise<void>((_, reject) => (fail = reject)));
    const handle: { current?: Undoable } = {};
    render(<Harness removal={{ commit: slow }} api={handle} />);
    act(() => screen.getByText("Withdraw").click());
    act(() => vi.advanceTimersByTime(8000)); // the window closed; the request is in flight
    expect(slow).toHaveBeenCalledOnce();
    let settled = false;
    let outcome!: Promise<unknown>;
    act(() => {
      outcome = handle.current!.flush().then(
        () => "resolved",
        (e: unknown) => e,
      ).finally(() => void (settled = true));
    });
    await Promise.resolve();
    expect(settled).toBe(false);
    const error = new Error("The kiln controller is offline.");
    await act(async () => fail(error));
    expect(await outcome).toBe(error);
    vi.useRealTimers();
  });

  it("resolves at once with nothing pending", async () => {
    const handle: { current?: Undoable } = {};
    render(<Harness removal={{ commit: vi.fn() }} api={handle} />);
    await expect(handle.current!.flush()).resolves.toBeUndefined();
  });

  it("rejects when the commit fails, so the dependent action does not run", async () => {
    server.use(withdrawServerError);
    const handle: { current?: Undoable } = {};
    render(<Harness removal={{ commit: () => fetchJson(`${api.bookings}/a`, { method: "DELETE" }) }} api={handle} />);
    act(() => screen.getByText("Withdraw").click());
    let result!: Promise<void>;
    act(() => {
      result = handle.current!.flush();
    });
    await expect(result).rejects.toBeInstanceOf(HttpError);
  });

  it("a 204 from the server is success", async () => {
    const handle: { current?: Undoable } = {};
    render(<Harness removal={{ commit: () => fetchJson(`${api.bookings}/a`, { method: "DELETE" }) }} api={handle} />);
    act(() => screen.getByText("Withdraw").click());
    await act(() => handle.current!.flush());
    expect(row()).toBeNull();
    expect(screen.queryByRole("button", { name: "Try again" })).toBeNull();
  });
});

describe("useUndoable: a failed commit", () => {
  it("brings the item back and says why in the bar, in the product's words and the error's", async () => {
    server.use(withdrawServerError);
    const onError = vi.fn();
    const handle: { current?: Undoable } = {};
    render(<Harness removal={{ commit: () => fetchJson(`${api.bookings}/a`, { method: "DELETE" }), onError }} api={handle} />);
    act(() => screen.getByText("Withdraw").click());
    await act(() => handle.current!.flush().catch(() => undefined));
    expect(row()).toBeInTheDocument();
    expect(screen.getByText(/Tom Ellery's booking is back\. The server could not answer \(503\)\./)).toBeInTheDocument();
    expect(onError).toHaveBeenCalledWith(expect.any(HttpError));
  });

  it("Try again removes the item and commits now; Dismiss leaves it back", async () => {
    const user = userEvent.setup();
    let fail = true;
    const commit = vi.fn(() => (fail ? Promise.reject(new Error("The kiln controller is offline.")) : Promise.resolve()));
    const handle: { current?: Undoable } = {};
    render(<Harness removal={{ commit }} api={handle} />);
    await user.click(screen.getByText("Withdraw"));
    await act(() => handle.current!.flush().catch(() => undefined));
    expect(screen.getByText(/The kiln controller is offline\./)).toBeInTheDocument();
    fail = false;
    await user.click(screen.getByRole("button", { name: "Try again" }));
    await waitFor(() => expect(commit).toHaveBeenCalledTimes(2));
    expect(row()).toBeNull();
    expect(screen.queryByRole("button", { name: "Try again" })).toBeNull();

    fail = true;
    await user.click(screen.getByText("Withdraw"));
    await act(() => handle.current!.flush().catch(() => undefined));
    await user.click(screen.getByRole("button", { name: "Dismiss" }));
    expect(row()).toBeInTheDocument();
    expect(screen.queryByText(/offline/)).toBeNull();
  });

  it("a commit that throws when the window closes is handled the same way", async () => {
    vi.useFakeTimers();
    render(<Harness removal={{ commit: () => { throw new Error("The kiln controller is offline."); } }} />);
    act(() => screen.getByText("Withdraw").click());
    await act(async () => vi.advanceTimersByTime(8000));
    expect(row()).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Try again" })).toBeInTheDocument();
    vi.useRealTimers();
  });

  it("after unmount, onError is the only path and still hears the failure", async () => {
    const onError = vi.fn();
    const { unmount } = render(<Harness removal={{ commit: () => Promise.reject(new Error("gone")), onError }} />);
    act(() => screen.getByText("Withdraw").click());
    unmount();
    await waitFor(() => expect(onError).toHaveBeenCalledOnce());
  });

  it("shows the removal's failure sentence alone when the error has nothing to say", async () => {
    const handle: { current?: Undoable } = {};
    render(<Harness removal={{ commit: () => Promise.reject("x") }} api={handle} />);
    act(() => screen.getByText("Withdraw").click());
    await act(() => handle.current!.flush().catch(() => undefined));
    expect(screen.getByText("Tom Ellery's booking is back.")).toBeInTheDocument();
  });

  it("describes failures with the product's own words when given", async () => {
    function Own() {
      const u = useUndoable({ describeError: () => "The co-op's server is down for the night." });
      return (
        <>
          <button onClick={() => u.schedule({ id: "a", message: "m", failure: "Back.", commit: () => Promise.reject(new Error("x")) })}>
            Withdraw
          </button>
          <button onClick={() => void u.flush().catch(() => undefined)}>Rebuild</button>
          <UndoBar inline undoable={u} />
        </>
      );
    }
    const user = userEvent.setup();
    render(<Own />);
    await user.click(screen.getByText("Withdraw"));
    await user.click(screen.getByText("Rebuild"));
    expect(await screen.findByText("Back. The co-op's server is down for the night.")).toBeInTheDocument();
  });
});
