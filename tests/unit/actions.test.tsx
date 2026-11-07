import { describe, expect, it, vi } from "vitest";
import { act, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { RefreshCw } from "lucide-react";
import { AsyncButton, Button, IconButton, useAsyncAction } from "../../src";

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
  it("takes its accessible name and tooltip from label", () => {
    render(<IconButton icon={RefreshCw} label="Refresh readings" />);
    const button = screen.getByRole("button", { name: "Refresh readings" });
    expect(button).toHaveAttribute("title", "Refresh readings");
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
      const [phase, run] = useAsyncAction(() => new Promise<void>((r) => (resolve = r)), 2000);
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
});
