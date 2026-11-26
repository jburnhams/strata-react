import { describe, expect, it } from "vite-plus/test";
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { DataView, PauseButton, fetchJson, usePoll, useLoad } from "../../src";
import { renderWithStrata } from "../../src/testing";
import { server } from "../utils/server";

// A polled read the person can pause (issue #344): the interval stops while paused, the button's name
// stays "Pause updates" with its pressed state carrying the rest, the line says when it was read, and
// resuming reads at once.

function Live({ every = 40 }: { every?: number }) {
  const poll = usePoll({ every });
  const load = useLoad({
    queryKey: ["live"],
    queryFn: () => fetchJson<{ n: number }>("/api/live"),
    poll,
    staleTime: 0,
  });
  return (
    <>
      <PauseButton poll={poll} />
      <DataView state={load} isEmpty={() => false} skeleton={<p>Loading</p>} empty={null}>
        {(d) => <p>Reading {d.n}</p>}
      </DataView>
    </>
  );
}

describe("a polled read with a pause", () => {
  it("reads on its interval, stops while paused, and reads at once on resume", async () => {
    const user = userEvent.setup();
    let calls = 0;
    server.use(http.get("/api/live", () => HttpResponse.json({ n: ++calls })));
    renderWithStrata(<Live />);
    await waitFor(() => expect(calls).toBeGreaterThanOrEqual(3));

    const button = screen.getByRole("button", { name: "Pause updates" });
    expect(button).toHaveAttribute("aria-pressed", "false");
    expect(screen.getByText(/^Updated \d\d:\d\d$/)).toBeInTheDocument();

    await user.click(button);
    expect(button).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button", { name: "Pause updates" })).toBeInTheDocument();
    expect(screen.getByText(/^Paused\. Last updated \d\d:\d\d$/)).toBeInTheDocument();
    await new Promise((r) => setTimeout(r, 30)); // let a read that was already in flight land
    const frozen = calls;
    await new Promise((r) => setTimeout(r, 200));
    expect(calls).toBe(frozen);

    await user.click(button);
    expect(button).toHaveAttribute("aria-pressed", "false");
    await waitFor(() => expect(calls).toBeGreaterThan(frozen));
  });

  it("says the screen has not read yet before the first answer", () => {
    server.use(http.get("/api/live", () => new Promise(() => undefined)));
    renderWithStrata(<Live />);
    expect(screen.getByText("Not read yet")).toBeInTheDocument();
  });
});

// #349: a read with its own pace under the page's shared pause.
function TwoPaces() {
  const poll = usePoll({ every: 30 });
  const fast = useLoad({
    queryKey: ["fast"],
    queryFn: () => fetchJson<{ n: number }>("/api/fast"),
    poll,
    staleTime: 0,
  });
  const slow = useLoad({
    queryKey: ["slow"],
    queryFn: () => fetchJson<{ n: number }>("/api/slow"),
    poll: poll.with({ every: 100_000 }),
    staleTime: 0,
  });
  return (
    <>
      <PauseButton poll={poll} />
      <p>{fast.status === "ready" ? `fast ${fast.data.n}` : "fast loading"}</p>
      <p>{slow.status === "ready" ? `slow ${slow.data.n}` : "slow loading"}</p>
    </>
  );
}

describe("poll.with({ every })", () => {
  it("keeps its own interval while sharing the pause", async () => {
    const user = userEvent.setup();
    let fast = 0;
    let slow = 0;
    server.use(
      http.get("/api/fast", () => HttpResponse.json({ n: ++fast })),
      http.get("/api/slow", () => HttpResponse.json({ n: ++slow })),
    );
    renderWithStrata(<TwoPaces />);
    await waitFor(() => expect(fast).toBeGreaterThanOrEqual(3));
    expect(slow).toBe(1);

    // Pausing the page's poll pauses both; resuming reads both once.
    await user.click(screen.getByRole("button", { name: "Pause updates" }));
    const held = fast;
    await new Promise((r) => setTimeout(r, 120));
    expect(fast).toBe(held);
    await user.click(screen.getByRole("button", { name: "Pause updates" }));
    await waitFor(() => expect(slow).toBe(2));
  });
});
