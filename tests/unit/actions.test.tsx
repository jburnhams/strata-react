import * as React from "react";
import { describe, expect, it, vi } from "vitest";
import { act, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { RefreshCw } from "lucide-react";
import { http, HttpResponse } from "msw";
import { AsyncButton, Button, IconButton, fetchJson, useAsyncAction } from "../../src";
import { api, bookingConflict } from "../../stories/mocks/handlers";
import { server } from "../utils/server";

describe("Button", () => {
  it("is the outline variant and type=button unless told otherwise", () => {
    render(<Button>Save changes</Button>);
    const button = screen.getByRole("button", { name: "Save changes" });
    expect(button).toHaveAttribute("type", "button");
    expect(button.className).toContain("border-input");
    expect(button.className).not.toContain("bg-primary");
  });

  it("uses the filled accent only when asked", () => {
    render(<Button variant="default">Book firing</Button>);
    expect(screen.getByRole("button").className).toContain("bg-primary");
  });

  it("lets layout classes through but merges type steps as font sizes", () => {
    render(<Button className="w-full type-body">Wide</Button>);
    const cls = screen.getByRole("button").className;
    expect(cls).toContain("w-full");
    expect(cls).toContain("type-body");
    expect(cls).not.toContain("type-label");
  });
});

describe("IconButton", () => {
  it("takes its accessible name from label and shows it as a tooltip on focus", async () => {
    render(<IconButton icon={RefreshCw} label="Refresh readings" />);
    const button = screen.getByRole("button", { name: "Refresh readings" });
    expect(screen.queryByRole("tooltip")).toBeNull();
    await userEvent.tab();
    expect(button).toHaveFocus();
    expect(await screen.findByRole("tooltip")).toHaveTextContent("Refresh readings");
  });
});

const labels = { idle: "Book firing", pending: "Booking…", done: "Booked" };

describe("AsyncButton", () => {
  it("shows one label per phase in the same button and announces the outcome", () => {
    const { rerender } = render(<AsyncButton phase="idle" labels={labels} />);
    expect(screen.getByRole("button", { name: "Book firing" })).toBeEnabled();
    rerender(<AsyncButton phase="pending" labels={labels} />);
    expect(screen.getByRole("button", { name: "Booking…" })).toBeDisabled();
    rerender(<AsyncButton phase="done" labels={labels} />);
    expect(screen.getByRole("status")).toHaveTextContent("Booked");
    rerender(<AsyncButton phase="error" labels={labels} />);
    expect(screen.getByRole("button", { name: "Try again" })).toBeEnabled();
    expect(screen.getByRole("status")).toHaveTextContent("Try again");
  });

  it("runs idle → pending → done → idle with useAsyncAction", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    let resolve!: () => void;
    function Live() {
      const { phase, run } = useAsyncAction(() => new Promise<void>((r) => (resolve = r)), { settleMs: 2000 });
      return <AsyncButton phase={phase} labels={labels} onClick={() => run()} />;
    }
    render(<Live />);
    await userEvent.click(screen.getByRole("button", { name: "Book firing" }));
    expect(screen.getByRole("button", { name: "Booking…" })).toBeDisabled();
    await act(async () => resolve());
    expect(screen.getByRole("button", { name: "Booked" })).toBeInTheDocument();
    await act(async () => vi.advanceTimersByTime(2000));
    expect(screen.getByRole("button", { name: "Book firing" })).toBeInTheDocument();
    vi.useRealTimers();
  });

  it("announces the error's own words with the retry label", () => {
    render(<AsyncButton phase="error" labels={labels} error="Kiln 2 is already booked for Thursday." />);
    expect(screen.getByRole("button", { name: "Try again" })).toBeEnabled();
    expect(screen.getByRole("status")).toHaveTextContent("Kiln 2 is already booked for Thursday. Try again");
  });

  it("surfaces the thrown message, calls onError, and clears the error on a re-run", async () => {
    const onError = vi.fn();
    let attempt = 0;
    let resolve!: () => void;
    const failure = new Error("Kiln 2 is already booked for Thursday.");
    function Live() {
      const { phase, run, error } = useAsyncAction(
        () => (++attempt === 1 ? Promise.reject(failure) : new Promise<void>((r) => (resolve = r))),
        { onError },
      );
      return (
        <>
          <AsyncButton phase={phase} labels={labels} error={error} onClick={() => run()} />
          <p>{error ?? "no error"}</p>
        </>
      );
    }
    render(<Live />);
    await userEvent.click(screen.getByRole("button", { name: "Book firing" }));
    expect(screen.getByRole("button", { name: "Try again" })).toBeEnabled();
    expect(screen.getByText("Kiln 2 is already booked for Thursday.", { selector: "p" })).toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent("Kiln 2 is already booked for Thursday. Try again");
    expect(onError).toHaveBeenCalledWith(failure);

    await userEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(screen.getByRole("button", { name: "Booking…" })).toBeDisabled();
    expect(screen.getByText("no error")).toBeInTheDocument();
    await act(async () => resolve());
    expect(screen.getByRole("button", { name: "Booked" })).toBeInTheDocument();
  });

  it("leaves error undefined when the thrown value has no message", async () => {
    function Live() {
      const { phase, run, error } = useAsyncAction(() => Promise.reject("nope"));
      return (
        <>
          <AsyncButton phase={phase} labels={labels} error={error} onClick={() => run()} />
          <p>{error ?? "no message"}</p>
        </>
      );
    }
    render(<Live />);
    await userEvent.click(screen.getByRole("button", { name: "Book firing" }));
    expect(screen.getByRole("status")).toHaveTextContent(/^Try again$/);
    expect(screen.getByText("no message")).toBeInTheDocument();
  });

  it("keeps run's identity across renders even when the action is an inline arrow", () => {
    const seen = new Set<unknown>();
    function Live({ n }: { n: number }) {
      const { run } = useAsyncAction(async () => void n);
      seen.add(run);
      return <span>{n}</span>;
    }
    const { rerender } = render(<Live n={1} />);
    rerender(<Live n={2} />);
    rerender(<Live n={3} />);
    expect(seen.size).toBe(1);
  });

  it("runs the latest action, not the one from the first render", async () => {
    const calls: number[] = [];
    function Live({ n }: { n: number }) {
      const { phase, run } = useAsyncAction(async () => void calls.push(n));
      return <AsyncButton phase={phase} labels={labels} onClick={() => run()} />;
    }
    const { rerender } = render(<Live n={1} />);
    rerender(<Live n={2} />);
    await userEvent.click(screen.getByRole("button", { name: "Book firing" }));
    expect(calls).toEqual([2]);
  });

  it("describes an HttpError from fetchJson in a sentence, not its log message", async () => {
    server.use(bookingConflict);
    function Live() {
      const { phase, run, error } = useAsyncAction(() => fetchJson(api.bookings, { method: "POST", body: "{}" }));
      return <AsyncButton phase={phase} labels={labels} error={error} onClick={() => run()} />;
    }
    render(<Live />);
    await userEvent.click(screen.getByRole("button", { name: "Book firing" }));
    expect(await screen.findByRole("button", { name: "Try again" })).toBeEnabled();
    expect(screen.getByRole("status")).toHaveTextContent("The request was refused: Kiln 2 is already booked for Friday's bisque. Try again");
  });

  it("falls back to the status text when the refusal has no body", async () => {
    server.use(http.post(api.bookings, () => new HttpResponse(null, { status: 409, statusText: "Conflict" })));
    function Live() {
      const { phase, run, error } = useAsyncAction(() => fetchJson(api.bookings, { method: "POST", body: "{}" }));
      return <AsyncButton phase={phase} labels={labels} error={error} onClick={() => run()} />;
    }
    render(<Live />);
    await userEvent.click(screen.getByRole("button", { name: "Book firing" }));
    expect(await screen.findByRole("button", { name: "Try again" })).toBeEnabled();
    expect(screen.getByRole("status")).toHaveTextContent("The request was refused (409): Conflict. Try again");
  });

  it("takes the product's own words through describeError", async () => {
    function Live() {
      const { phase, run, error } = useAsyncAction(() => Promise.reject(new Error("409")), {
        describeError: () => "Kiln 2 was booked by someone else a moment ago.",
      });
      return <AsyncButton phase={phase} labels={labels} error={error} onClick={() => run()} />;
    }
    render(<Live />);
    await userEvent.click(screen.getByRole("button", { name: "Book firing" }));
    expect(screen.getByRole("status")).toHaveTextContent("Kiln 2 was booked by someone else a moment ago. Try again");
  });

  it("calls onError after the error render, so it can move focus to an error message shown on error", async () => {
    function Live() {
      const ref = React.useRef<HTMLParagraphElement>(null);
      const { phase, run, error } = useAsyncAction(() => Promise.reject(new Error("Kiln 2 is offline.")), {
        onError: () => ref.current?.focus(),
      });
      return (
        <>
          <AsyncButton phase={phase} labels={labels} error={error} onClick={() => run()} />
          {error && (
            <p ref={ref} tabIndex={-1}>
              {error}
            </p>
          )}
        </>
      );
    }
    render(<Live />);
    await userEvent.click(screen.getByRole("button", { name: "Book firing" }));
    expect(screen.getByText("Kiln 2 is offline.", { selector: "p" })).toHaveFocus();
  });
});
