import { describe, expect, it } from "vitest";
import * as React from "react";
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Tree, useChoices, useExpanded, type Load } from "../../src";
import { renderWithStrata } from "../../src/testing";

// Issue #245: a current node beside ticked ones, counts and badges, sorted children, reveal, and
// ticking a branch without reading it.

type N = { id: string; name: string; n: number };
const ready = <T,>(data: T[]) => ({ status: "ready", data, refreshing: false }) as unknown as Load<readonly T[]>;
const years: N[] = [
  { id: "2019", name: "2019", n: 3 },
  { id: "2020", name: "2020", n: 2 },
];
const kids = (id: string): N[] => [1, 2, 3].map((d) => ({ id: `${id}/${id}-0${d}`, name: `${id}-0${d}`, n: d * 10 }));

const SORT = (a: N, b: N) => b.name.localeCompare(a.name);
function Host({ reveal, resolve }: { reveal?: string[]; resolve?: boolean }) {
  const choices = useChoices({ initial: [] });
  const expanded = useExpanded({ initial: [] } as never);
  const [current, setCurrent] = React.useState<string | null>(null);
  return (
    <>
      <Tree<N>
        label="Archive"
        roots={ready(years)}
        useChildren={(n) => ready(kids(n.id))}
        nodeKey={(n) => n.id}
        nodeLabel={(n) => n.name}
        isBranch={(n) => !n.id.includes("/")}
        expanded={expanded}
        emptyRow="No folders"
        choices={choices}
        current={current}
        onCurrentChange={(k) => setCurrent(k)}
        count={(n) => n.n}
        badge={(n) => (n.id === "2020" ? { label: "in project", tone: "success" } : null)}
        sortChildren={SORT}
        reveal={reveal}
        resolveBranch={resolve ? async (n) => kids(n.id).map((k) => k.id) : undefined}
        coverNoun={["folder", "folders"]}
      />
      <p data-testid="cur">{current}</p>
    </>
  );
}

describe("Tree current + choices", () => {
  it("sorts the top level, shows count and badge in the row's name", () => {
    renderWithStrata(<Host />);
    const rows = screen.getAllByRole("row");
    expect(rows[0]).toHaveTextContent("2020");
    expect(rows[0]).toHaveTextContent("in project");
    expect(rows[1]).toHaveTextContent("3");
  });

  it("a press on the name moves the current row and does not tick; the box ticks and does not move it", async () => {
    const user = userEvent.setup();
    renderWithStrata(<Host />);
    await user.click(screen.getAllByText("2019")[0]!);
    expect(screen.getByTestId("cur")).toHaveTextContent("2019");
    expect(document.querySelectorAll("[aria-current]")).toHaveLength(1);
    expect(screen.getByRole("checkbox", { name: "Choose 2019" })).not.toBeChecked();
    await user.click(screen.getByRole("checkbox", { name: "Choose 2020" }));
    expect(screen.getByRole("checkbox", { name: "Choose 2020" })).toBeChecked();
    expect(screen.getByTestId("cur")).toHaveTextContent("2019");
  });

  it("reveal opens the ancestors", async () => {
    renderWithStrata(<Host reveal={["2019", "2019/2019-02"]} />);
    await waitFor(() => expect(screen.getByText("2019-02")).toBeInTheDocument());
    // newest first
    const names = screen.getAllByRole("row").map((r) => r.textContent ?? "");
    expect(names.findIndex((t) => t.includes("2019-03"))).toBeLessThan(names.findIndex((t) => t.includes("2019-01")));
  });

  it("ticking a branch with resolveBranch says what it covers and does not open it", async () => {
    const user = userEvent.setup();
    renderWithStrata(<Host resolve />);
    await user.click(screen.getByRole("checkbox", { name: "Choose 2019" }));
    await waitFor(() => expect(screen.getByRole("status", { name: "" })).toBeDefined());
    expect(await screen.findByText("2019 and its 3 folders")).toBeInTheDocument();
    expect(screen.queryByText("2019-01")).toBeNull();
  });
});
