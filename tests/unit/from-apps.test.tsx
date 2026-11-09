import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import {
  AsyncButton,
  BulkBar,
  Button,
  CompositionBar,
  DataTable,
  DataView,
  EmptyState,
  InfiniteList,
  JobStatus,
  LoadMore,
  Meter,
  Skeleton,
  Thumbnail,
  fetchJson,
  useInfiniteLoad,
  useJob,
  useLoad,
  type Column,
  type Load,
} from "../../src";
import {
  asyncButtonPhase,
  expectOneFilledButton,
  filledButtons,
  installFakeIntersectionObserver,
  renderWithStrata,
} from "../../src/testing";
import { server } from "../utils/server";
import { api, firingsLaterPageError, firingsServerError, logSyncs, type FiringPage, type LogSync } from "../../stories/mocks/handlers";
import type { Firing } from "../../stories/fixtures/kiln";

// Tests for the issues filed from Tubes and python-app-template on 2026-11-09 (#43, #45, #47,
// #48, #49, #50, #51). #42, #46 and #52 are in errors.test.tsx and lib.test.ts.

describe("CompositionBar and Meter never show a part that is there as 0% (#43)", () => {
  it("prints <1% for a small part and keeps its segment visible", () => {
    const { container } = render(
      <CompositionBar
        label="Disk"
        parts={[{ key: "app", label: "This app's data", value: 2.4 }]}
        total={512}
        restLabel="Free"
        formatValue={(v) => `${v} GB`}
      />,
    );
    const row = screen.getByRole("row", { name: /This app's data/ });
    expect(row).toHaveTextContent("<1%");
    expect(screen.getByRole("row", { name: /Free/ })).toHaveTextContent(">99%");
    const segment = container.querySelector('[aria-hidden="true"].flex > div') as HTMLElement;
    expect(segment.className).toContain("min-w-1");
  });

  it("reads a nearly empty disk as <1% used", () => {
    render(<Meter label="Disk /" value={2.4} max={512} />);
    expect(screen.getByRole("meter", { name: "Disk /" })).toHaveAttribute("aria-valuetext", "<1% used");
  });
});

type Channel = { id: string; name: string; total?: number | null; synced?: string | null };
const channels: Channel[] = [
  { id: "a", name: "Night Sky", total: 40, synced: "2026-11-08T10:00:00Z" },
  { id: "b", name: "Glaze Lab", total: null, synced: null },
  { id: "c", name: "Wheel Work", total: 7, synced: "2026-11-01T10:00:00Z" },
  { id: "d", name: "Kiln Talk", total: 120 },
];

describe("DataTable missing values (#47)", () => {
  const columns: Column<Channel>[] = [
    { key: "name", header: "Channel", value: (c) => c.name },
    { key: "total", header: "Videos", numeric: true, value: (c) => c.total },
    { key: "synced", header: "Last synced", value: (c) => (c.synced ? new Date(c.synced) : null), missing: "Never" },
  ];
  const names = () =>
    within(screen.getByRole("table"))
      .getAllByRole("row")
      .slice(1)
      .map((r) => within(r).getAllByRole("cell")[0].textContent);

  it("draws a placeholder for a missing value, the column's word where it has one", () => {
    renderWithStrata(<DataTable caption="Channels" columns={columns} rows={channels} rowKey={(c) => c.id} />);
    const glaze = screen.getByRole("row", { name: /Glaze Lab/ });
    const [, total, synced] = within(glaze).getAllByRole("cell");
    expect(total).toHaveTextContent("No value");
    expect(within(total).getByText("–")).toHaveAttribute("aria-hidden", "true");
    expect(synced).toHaveTextContent("Never");
    expect(within(screen.getByRole("row", { name: /Night Sky/ })).getAllByRole("cell")[2]).toHaveTextContent("8 Nov 2026");
  });

  it("sorts by value with missing rows last in both directions", async () => {
    renderWithStrata(<DataTable caption="Channels" columns={columns} rows={channels} rowKey={(c) => c.id} />);
    await userEvent.click(screen.getByRole("button", { name: "Videos" }));
    expect(names()).toEqual(["Wheel Work", "Night Sky", "Kiln Talk", "Glaze Lab"]);
    await userEvent.click(screen.getByRole("button", { name: "Videos" }));
    expect(names()).toEqual(["Kiln Talk", "Night Sky", "Wheel Work", "Glaze Lab"]);
    await userEvent.click(screen.getByRole("button", { name: "Last synced" }));
    expect(names().slice(0, 2)).toEqual(["Wheel Work", "Night Sky"]);
    await userEvent.click(screen.getByRole("button", { name: "Last synced" }));
    expect(names().slice(0, 2)).toEqual(["Night Sky", "Wheel Work"]);
    expect(names().slice(2).sort()).toEqual(["Glaze Lab", "Kiln Talk"]);
  });

  it("sorts text in the locale's order with numbers read as numbers, and keeps a column's own sort among present values", async () => {
    const rows = [{ id: "1", n: "Kiln 10" }, { id: "2", n: "kiln 2" }, { id: "3", n: null }];
    renderWithStrata(
      <DataTable
        caption="Kilns"
        columns={[{ key: "n", header: "Kiln", value: (r: (typeof rows)[number]) => r.n }]}
        rows={rows}
        rowKey={(r) => r.id}
      />,
    );
    await userEvent.click(screen.getByRole("button", { name: "Kiln" }));
    expect(names()).toEqual(["kiln 2", "Kiln 10", "–No value"]);
  });

  it("does not sort a value column when sort is false", () => {
    renderWithStrata(
      <DataTable caption="Channels" columns={[{ key: "name", header: "Channel", value: (c: Channel) => c.name, sort: false }]} rows={channels} rowKey={(c) => c.id} />,
    );
    expect(screen.queryByRole("button", { name: "Channel" })).toBeNull();
  });
});

describe("DataView's error renderer (#50)", () => {
  it("keeps the state machine and lets the app draw the failure, still as an alert", async () => {
    let retried = 0;
    const state: Load<string[]> = { status: "error", message: "The feed could not be read.", retry: () => retried++ };
    render(
      <DataView<string[]>
        state={state}
        isEmpty={(d) => d.length === 0}
        skeleton={<Skeleton className="h-4" />}
        empty={<EmptyState title="Nothing yet" />}
        error={({ message, retry }) => (
          <p className="text-center">
            {message} <Button onClick={retry}>Reload the feed</Button>
          </p>
        )}
      >
        {(d) => d.join()}
      </DataView>,
    );
    expect(screen.getByRole("alert")).toHaveTextContent("The feed could not be read.");
    await userEvent.click(screen.getByRole("button", { name: "Reload the feed" }));
    expect(retried).toBe(1);
  });
});

describe("LoadMore and a page-scrolled grid (#49)", () => {
  let io: ReturnType<typeof installFakeIntersectionObserver>;
  beforeEach(() => {
    io = installFakeIntersectionObserver();
  });
  afterEach(() => io.uninstall());

  function useFirings() {
    return useInfiniteLoad({
      queryKey: ["firings", "grid"],
      queryFn: ({ cursor, signal }) => fetchJson<FiringPage>(`${api.firings}?limit=6${cursor ? `&after=${cursor}` : ""}`, { signal }),
      items: (page) => page.firings,
      itemKey: (f: Firing) => f.id,
      hasMore: (page) => page.hasMore,
    });
  }

  function Grid() {
    const load = useFirings();
    return (
      <InfiniteList
        state={load}
        label="Firings"
        scroll="page"
        listClassName="grid grid-cols-3 gap-4"
        moreLabel="Show older firings"
        skeleton={<Skeleton className="h-24" />}
        empty={<EmptyState title="No firings yet" />}
        moreError={({ message, retry }) => (
          <p>
            {message} <Button onClick={retry}>Load older firings again</Button>
          </p>
        )}
      >
        {(f) => <article>Firing {f.id}</article>}
      </InfiniteList>
    );
  }

  it("draws a plain grid list with no scroll region of its own, and watches the viewport", async () => {
    renderWithStrata(<Grid />);
    const list = await screen.findByRole("list", { name: "Firings" });
    expect(list.className).toContain("grid-cols-3");
    expect(screen.queryByRole("region", { name: "Firings" })).toBeNull();
    expect(within(list).getAllByRole("listitem")).toHaveLength(6);
    expect(io.observers.at(-1)?.options.root ?? null).toBeNull();
    io.scrollToEnd();
    await waitFor(() => expect(within(list).getAllByRole("listitem")).toHaveLength(12));
  });

  it("focuses the first new item after Show more, and draws a failed page the app's way", async () => {
    renderWithStrata(<Grid />);
    await screen.findByText("Firing f-0412");
    await userEvent.click(screen.getByRole("button", { name: "Show older firings" }));
    await waitFor(() => expect(document.activeElement).toHaveAttribute("data-index", "6"));
    server.use(firingsLaterPageError);
    await userEvent.click(screen.getByRole("button", { name: "Show older firings" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Load older firings again");
  });

  it("goes after any list an app draws itself", async () => {
    function OwnCards() {
      const load = useFirings();
      return (
        <div>
          <ul aria-label="Cards">
            {load.status === "ready" && load.data.map((f, i) => <li key={f.id} data-index={i}>Firing {f.id}</li>)}
          </ul>
          <LoadMore state={load} moreLabel="Show older firings" moreSkeleton={<Skeleton className="h-24" />} end="That is every firing." />
        </div>
      );
    }
    renderWithStrata(<OwnCards />);
    await screen.findByText("Firing f-0412");
    await userEvent.click(screen.getByRole("button", { name: "Show older firings" }));
    await waitFor(() => expect(document.activeElement).toHaveAttribute("data-index", "6"));
  });

  it("lets InfiniteList draw a failed first page the app's way", async () => {
    server.use(firingsServerError);
    function Feed() {
      const load = useFirings();
      return (
        <InfiniteList
          state={load}
          label="Firings"
          moreLabel="More"
          skeleton={<Skeleton className="h-4" />}
          empty={<EmptyState title="None" />}
          error={({ message }) => <p className="text-center">Could not load: {message}</p>}
        >
          {(f) => f.id}
        </InfiniteList>
      );
    }
    renderWithStrata(<Feed />);
    expect(await screen.findByRole("alert")).toHaveTextContent("Could not load: The server could not answer (503).");
  });
});

describe("Thumbnail overlays and fallback (#51)", () => {
  it("keeps overlays in the box whether the image loads, fails or is missing", () => {
    const { container, rerender } = render(
      <Thumbnail src="/api/photos/p-301.svg" alt="Bowl" missing="Photo not found" eager aspect="16/9">
        <span className="absolute right-1 bottom-1">4:05</span>
      </Thumbnail>,
    );
    const box = container.firstElementChild as HTMLElement;
    expect(within(box).getByText("4:05")).toBeInTheDocument();
    fireEvent.error(screen.getByRole("img", { name: "Bowl" }));
    expect(screen.getByRole("img", { name: "Bowl: Photo not found" })).toBeInTheDocument();
    expect(within(box).getByText("4:05")).toBeInTheDocument();
    rerender(
      <Thumbnail src={null} alt="Bowl" missing="No photo yet">
        <span>4:05</span>
      </Thumbnail>,
    );
    expect(within(container.firstElementChild as HTMLElement).getByText("4:05")).toBeInTheDocument();
  });

  it("draws an app's fallback, named by alt, and takes a round shape", () => {
    const { container } = render(
      <Thumbnail src={null} alt="Night Sky" aspect={1} className="rounded-pill" fallback={<span className="grid place-items-center">N</span>} />,
    );
    const missing = screen.getByRole("img", { name: "Night Sky" });
    expect(missing).toHaveTextContent("N");
    const box = container.firstElementChild as HTMLElement;
    expect(box.className).toContain("rounded-pill");
    expect(box.className).not.toContain("rounded-control");
  });
});

describe("strata-react/testing: filled buttons and AsyncButton's phase (#48)", () => {
  it("finds the filled buttons, and checks there is one", () => {
    render(
      <div>
        <Button variant="default">Book firing</Button>
        <Button>Export</Button>
        <div hidden>
          <Button variant="default">Hidden</Button>
        </div>
      </div>,
    );
    expect(filledButtons().map((b) => b.textContent)).toEqual(["Book firing"]);
    expect(expectOneFilledButton()).toHaveTextContent("Book firing");
  });

  it("names the buttons it found when the rule is broken, as with a BulkBar beside a filled primary", () => {
    render(
      <div>
        <Button variant="default">Send greeting</Button>
        <BulkBar count={2} noun="greeting" onClear={() => undefined}>
          <Button variant="default">Remove 2</Button>
        </BulkBar>
      </div>,
    );
    expect(() => expectOneFilledButton()).toThrow('Expected one filled button in the view, found 2: "Send greeting", "Remove 2".');
  });

  it("reads an AsyncButton's phase from the button or any element in it", () => {
    const labels = { idle: "Add", pending: "Adding…", done: "Added" };
    const { rerender } = render(<AsyncButton phase="idle" labels={labels} />);
    const button = screen.getByRole("button", { name: "Add" });
    expect(asyncButtonPhase(button)).toBe("idle");
    rerender(<AsyncButton phase="error" labels={labels} />);
    expect(asyncButtonPhase(screen.getByRole("button", { name: "Try again" }))).toBe("error");
    expect(() => asyncButtonPhase(document.body)).toThrow(/Not an AsyncButton/);
  });
});

describe("JobStatus and useJob (#45)", () => {
  const words = { running: "Syncing", finished: "Finished", failed: "Finished with failures" };

  it("shows the word, the sentence and a progress bar while running", () => {
    render(<JobStatus label="Log sync" running words={words} summary="Reading Kiln 2: 412 new readings so far." current={1} total={3} />);
    const section = screen.getByRole("region", { name: "Log sync" });
    expect(section).toHaveTextContent("Syncing");
    expect(screen.getByRole("progressbar", { name: "Log sync" })).toHaveAttribute("aria-valuetext", "1 of 3");
  });

  it("names each failure with its reason, and uses the failed word", () => {
    render(
      <JobStatus
        label="Log sync"
        running={false}
        words={words}
        summary="Read 2 of 3 kilns."
        failures={[{ key: "k3", label: "Kiln 3", reason: "its controller did not answer" }]}
      />,
    );
    expect(screen.getByText("Finished with failures")).toBeInTheDocument();
    expect(screen.queryByRole("progressbar")).toBeNull();
    expect(within(screen.getByRole("list", { name: "Failures" })).getByRole("listitem")).toHaveTextContent("Kiln 3: its controller did not answer");
  });

  it("announces when the item changes or the job ends, not on every poll", () => {
    const { rerender } = render(<JobStatus label="Log sync" running words={words} summary="10 so far." current={1} total={3} />);
    const live = screen.getByRole("status");
    expect(live).toHaveTextContent("");
    rerender(<JobStatus label="Log sync" running words={words} summary="20 so far." current={1} total={3} />);
    expect(live).toHaveTextContent("");
    rerender(<JobStatus label="Log sync" running words={words} summary="30 so far." current={2} total={3} />);
    expect(live).toHaveTextContent("Syncing. 30 so far.");
    rerender(<JobStatus label="Log sync" running words={words} summary="40 so far." current={2} total={3} />);
    expect(live).toHaveTextContent("Syncing. 30 so far.");
    rerender(<JobStatus label="Log sync" running={false} words={words} summary="All read." current={3} total={3} />);
    expect(live).toHaveTextContent("Finished. All read.");
  });

  it("polls while the job runs, stops when it ends, and reads the changed data again once", async () => {
    const stages: LogSync[] = [logSyncs.running, { ...logSyncs.running, current: 3, kiln: "Kiln 3" }, logSyncs.finished];
    let polls = 0;
    let readingsReads = 0;
    server.use(
      http.get(api.logSync, () => HttpResponse.json(stages[Math.min(polls++, stages.length - 1)])),
      http.get(api.readings, () => {
        readingsReads++;
        return HttpResponse.json([]);
      }),
    );
    function Sync() {
      const readings = useLoad({ queryKey: ["readings"], queryFn: () => fetchJson<unknown[]>(api.readings) });
      const job = useJob({
        queryKey: ["log-sync"],
        queryFn: () => fetchJson<LogSync>(api.logSync),
        isRunning: (s) => s.running,
        every: 20,
        invalidates: [["readings"]],
      });
      return (
        <div>
          <p>{job.running ? "running" : "stopped"}</p>
          <p>{readings.status}</p>
        </div>
      );
    }
    renderWithStrata(<Sync />);
    expect(await screen.findByText("running")).toBeInTheDocument();
    await waitFor(() => expect(polls).toBe(3));
    expect(await screen.findByText("stopped")).toBeInTheDocument();
    await waitFor(() => expect(readingsReads).toBe(2));
    // No more polls once it has stopped.
    await act(() => new Promise((r) => setTimeout(r, 100)));
    expect(polls).toBe(3);
    expect(readingsReads).toBe(2);
  });

  it("invalidates nothing when the first read finds the job already finished, and poll() reads now", async () => {
    let polls = 0;
    let readingsReads = 0;
    server.use(
      http.get(api.logSync, () => {
        polls++;
        return HttpResponse.json(logSyncs.finished);
      }),
      http.get(api.readings, () => {
        readingsReads++;
        return HttpResponse.json([]);
      }),
    );
    let poll = () => undefined as void;
    function Sync() {
      useLoad({ queryKey: ["readings"], queryFn: () => fetchJson<unknown[]>(api.readings) });
      const job = useJob({ queryKey: ["log-sync"], queryFn: () => fetchJson<LogSync>(api.logSync), isRunning: (s) => s.running, invalidates: [["readings"]] });
      poll = job.poll;
      return <p>{job.status}</p>;
    }
    renderWithStrata(<Sync />);
    await screen.findByText("ready");
    await act(() => new Promise((r) => setTimeout(r, 50)));
    expect(readingsReads).toBe(1);
    act(() => poll());
    await waitFor(() => expect(polls).toBe(2));
    expect(readingsReads).toBe(1);
  });
});
