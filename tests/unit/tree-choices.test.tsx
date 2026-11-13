import { describe, expect, it } from "vitest";
import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Tree, useChoices, useExpanded, useSelection, type Load } from "../../src";
import { applyChange, noteFor, resolve } from "../../src/lib/choice";
import { renderWithStrata } from "../../src/testing";

// Issue #222: choose several, with what depends on a choice ticked for you.

describe("choice rules", () => {
  const implies = (k: string) => ({ a: ["b"], b: ["c"], c: ["a"] })[k]; // a cycle, on purpose
  it("follows implications transitively, guards a cycle, and says why", () => {
    const r = resolve(new Set(["a"]), implies);
    expect([...r.all].sort()).toEqual(["a", "b", "c"]);
    expect([...r.dependents].sort()).toEqual(["b", "c"]);
    expect(r.because.get("c")).toEqual(["a"]);
  });
  it("puts back a key something chosen implies, and reports it", () => {
    const change = applyChange(new Set(["a"]), new Set(["a"]), (k) => (k === "a" ? ["b"] : []));
    expect(change.explicit).toEqual(new Set(["a"]));
    // Asking for the set without b (the surface cleared it) is refused: b stays.
    expect(change.refused).toBe(1);
    expect(noteFor({ added: 3, dropped: 0, refused: 0 })).toBe("3 more chosen because they depend on it");
  });
});

type Node = { id: string; name: string; branch: boolean };
const clip = (id: string): Node => ({ id, name: id, branch: true });
const stage = (clipId: string, s: string): Node => ({ id: `${clipId}/${s}`, name: s, branch: false });
const STAGES = ["detect", "track", "render"];
const implies = (key: string) => {
  const [c, s] = key.split("/");
  const i = STAGES.indexOf(s);
  return s && i >= 0 && i < STAGES.length - 1 ? [`${c}/${STAGES[i + 1]}`] : [];
};
const roots: Load<readonly Node[]> = { status: "ready", data: [clip("c1"), clip("c2")], refreshing: false } as never;

function Host({ initial = [] as string[], summary, openKeys = ["c1", "c2"] }: { initial?: string[]; summary?: boolean; openKeys?: string[] }) {
  const choices = useChoices({ initial, implies });
  const expanded = useExpanded({ initial: openKeys } as never);
  return (
    <>
      <Tree
        label="Results"
        roots={roots}
        useChildren={(n) => ({ status: "ready", data: STAGES.map((s) => stage(n.id, s)), refreshing: false }) as never}
        nodeKey={(n) => n.id}
        nodeLabel={(n) => n.name}
        isBranch={(n) => n.branch}
        expanded={expanded}
        emptyRow="No results"
        choices={choices}
      />
      {summary && <p data-testid="summary">{choices.summary(["result", "results"], "will be forgotten")}</p>}
    </>
  );
}


describe("Tree with choices", () => {
  it("draws a checkbox per row, and ticking a stage ticks what depends on it, with the reason in text", async () => {
    const user = userEvent.setup();
    renderWithStrata(<Host summary />);
    const c1 = screen.getAllByRole("row").filter((r) => /detect/.test(r.textContent ?? ""))[0];
    await user.click(within(c1).getByRole("checkbox"));
    const rows = screen.getAllByRole("row");
    const tracks = rows.filter((r) => /^track/.test(r.textContent ?? ""));
    expect(tracks[0]).toHaveTextContent("Included because of detect");
    expect(within(tracks[0]).getByRole("checkbox")).toBeChecked();
    expect(screen.getByText("2 more chosen because they depend on it")).toBeInTheDocument();
    expect(screen.getByTestId("summary")).toHaveTextContent(/3\s+results will be forgotten: 1 chosen, 2 that depend on them/);
  });

  it("a key that is implied cannot be cleared on its own; clearing what implied it releases it", async () => {
    const user = userEvent.setup();
    renderWithStrata(<Host initial={["c1/detect"]} summary />);
    const rowOf = (name: string, nth = 0) => screen.getAllByRole("row").filter((r) => new RegExp(`^${name}`).test(r.textContent ?? ""))[nth];
    expect(within(rowOf("track")).getByRole("checkbox")).toBeChecked();
    await user.click(within(rowOf("track")).getByRole("checkbox"));
    expect(within(rowOf("track")).getByRole("checkbox")).toBeChecked(); // refused
    expect(screen.getByText(/stays chosen because something chosen depends on it/)).toBeInTheDocument();
    await user.click(within(rowOf("detect")).getByRole("checkbox"));
    expect(within(rowOf("track")).getByRole("checkbox")).not.toBeChecked();
    expect(screen.getByTestId("summary")).toHaveTextContent("No results chosen");
  });

  it("shows a parent as mixed when only some of what is under it is chosen, and ticks all of it when pressed", async () => {
    const user = userEvent.setup();
    renderWithStrata(<Host initial={["c1/render"]} />);
    const c1 = screen.getAllByRole("row").find((r) => /^c1/.test(r.textContent ?? ""))!;
    expect(within(c1).getByRole("checkbox")).toBePartiallyChecked();
    await user.click(within(c1).getByRole("checkbox"));
    expect(within(c1).getByRole("checkbox")).toBeChecked();
    for (const r of screen.getAllByRole("row").filter((r) => /^(detect|track|render)/.test(r.textContent ?? "")).slice(0, 3)) expect(within(r).getByRole("checkbox")).toBeChecked();
    await user.click(within(c1).getByRole("checkbox"));
    expect(within(c1).getByRole("checkbox")).not.toBeChecked();
  });

  it("Select all shown only adds: a choice under a collapsed branch is kept", async () => {
    const user = userEvent.setup();
    renderWithStrata(<Host initial={["c2/render"]} openKeys={["c1"]} />);
    await user.click(screen.getByRole("button", { name: "Select all shown" }));
    const c2 = screen.getAllByRole("row").find((r) => /^c2/.test(r.textContent ?? ""))!;
    expect(within(c2).getByRole("checkbox")).toBeChecked(); // c2 is shown, so it is added; nothing chosen under it is lost
    await user.click(within(c2).getByRole("button"));
    const render = screen.getAllByRole("row").filter((r) => /^render/.test(r.textContent ?? ""))[1];
    expect(within(render).getByRole("checkbox")).toBeChecked();
  });

  it("Select all shown chooses every row shown, Clear releases them", async () => {
    const user = userEvent.setup();
    renderWithStrata(<Host />);
    await user.click(screen.getByRole("button", { name: "Select all shown" }));
    for (const r of screen.getAllByRole("row")) expect(within(r).getByRole("checkbox")).toBeChecked();
    await user.click(screen.getByRole("button", { name: "Clear" }));
    for (const r of screen.getAllByRole("row")) expect(within(r).getByRole("checkbox")).not.toBeChecked();
  });
});

describe("useSelection implies", () => {
  type Row = { id: string };
  function List() {
    const rows: Row[] = ["a", "b", "c"].map((id) => ({ id }));
    const s = useSelection(rows, (r) => r.id, [], { implies: (k) => (k === "a" ? ["b"] : []) });
    return (
      <div>
        {rows.map((r) => (
          <label key={r.id}>
            <input type="checkbox" aria-label={r.id} checked={s.selected.has(r.id)} onChange={(e) => { const n = new Set(s.selected); if (e.target.checked) n.add(r.id); else n.delete(r.id); s.onChange(n); }} />
            {s.implied.has(r.id) && <span>because of {s.because(r.id).join()}</span>}
          </label>
        ))}
        <p data-testid="sum">{s.summary("row", "will change")}</p>
        <p role="status">{s.note}</p>
      </div>
    );
  }
  it("chooses what a row implies, marks it, and holds it until what implied it is cleared", async () => {
    const user = userEvent.setup();
    renderWithStrata(<List />);
    await user.click(screen.getByLabelText("a"));
    expect(screen.getByLabelText("b")).toBeChecked();
    expect(screen.getByText("because of a")).toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent("1 more chosen because it depends on it");
    expect(screen.getByTestId("sum")).toHaveTextContent(/2\s+rows will change: 1 chosen, 1 that depend on them/);
    await user.click(screen.getByLabelText("b"));
    expect(screen.getByLabelText("b")).toBeChecked();
    await user.click(screen.getByLabelText("a"));
    expect(screen.getByLabelText("b")).not.toBeChecked();
  });
});
