import * as React from "react";
import { describe, expect, it } from "vitest";
import { fireEvent, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { SelectableGrid, useSelection } from "../../src";
import { renderWithStrata } from "../../src/testing";

// Issue #246: the photo-grid features of SelectableGrid.

type P = { id: string; name: string; hour: string };
const photos: P[] = Array.from({ length: 6 }, (_, i) => ({ id: `p${i}`, name: `Photo ${i}`, hour: i < 4 ? "08:00" : "09:00" }));

function Grid(props: Partial<React.ComponentProps<typeof SelectableGrid<P>>> & { rows?: P[]; start?: number; locked?: string }) {
  const { rows = photos, start = 144, locked, ...rest } = props;
  // The selection is made from every row, so a filtered-away row stays chosen (as a screen with a filter does).
  const selection = useSelection(photos, (p) => p.id);
  const [size, setSize] = React.useState(start);
  return (
    <>
      <SelectableGrid<P>
        label="Photos"
        rows={rows}
        rowKey={(p) => p.id}
        renderImage={() => <span />}
        selection={{ ...selection, rowLabel: (p) => p.name, isSelectable: (p) => p.id !== locked }}
        tileSize={size}
        onTileSizeChange={setSize}
        {...rest}
      />
      <p data-testid="size">{size}</p>
      <p data-testid="count">{selection.count}</p>
    </>
  );
}

describe("SelectableGrid as a photo grid", () => {
  it("zooms with + and -, and with Ctrl+wheel, inside its range", async () => {
    const user = userEvent.setup();
    renderWithStrata(<Grid zoomRange={[100, 200]} />);
    await user.click(screen.getAllByRole("row")[0]!);
    await user.keyboard("+");
    expect(screen.getByTestId("size")).toHaveTextContent("180");
    await user.keyboard("+");
    expect(screen.getByTestId("size")).toHaveTextContent("200");
    await user.keyboard("--");
    expect(screen.getByTestId("size")).toHaveTextContent("128");
    fireEvent.wheel(screen.getByRole("grid", { name: "Photos" }), { ctrlKey: true, deltaY: -100 });
    expect(Number(screen.getByTestId("size").textContent)).toBeGreaterThan(128);
    // Without Ctrl the wheel scrolls and does nothing here.
    const before = screen.getByTestId("size").textContent;
    fireEvent.wheel(screen.getByRole("grid", { name: "Photos" }), { deltaY: -100 });
    expect(screen.getByTestId("size")).toHaveTextContent(before!);
  });

  it("selectionMode none draws no boxes and chooses nothing; single keeps one", async () => {
    const user = userEvent.setup();
    const { unmount } = renderWithStrata(<Grid selectionMode="none" />);
    expect(screen.queryByRole("checkbox")).toBeNull();
    await user.click(screen.getAllByRole("row")[0]!);
    expect(screen.getByTestId("count")).toHaveTextContent("0");
    unmount();
    renderWithStrata(<Grid selectionMode="single" />);
    await user.click(screen.getAllByRole("row")[0]!);
    await user.click(screen.getAllByRole("row")[1]!);
    expect(screen.getByTestId("count")).toHaveTextContent("1");
  });

  it("replace: a click chooses one tile, Ctrl toggles a second, a double click opens", async () => {
    const user = userEvent.setup();
    const opened: string[] = [];
    renderWithStrata(<Grid selectionBehavior="replace" onAction={(p) => opened.push(p.id)} />);
    const rows = () => screen.getAllByRole("row");
    await user.click(rows()[0]!);
    await user.click(rows()[2]!);
    expect(screen.getByTestId("count")).toHaveTextContent("1");
    await user.keyboard("{Control>}");
    await user.click(rows()[3]!);
    await user.keyboard("{/Control}");
    expect(screen.getByTestId("count")).toHaveTextContent("2");
    await user.dblClick(rows()[1]!);
    expect(opened).toContain("p1");
  });

  it("Escape clears what is chosen", async () => {
    const user = userEvent.setup();
    renderWithStrata(<Grid />);
    await user.click(screen.getAllByRole("row")[0]!);
    expect(screen.getByTestId("count")).toHaveTextContent("1");
    await user.keyboard("{Escape}");
    expect(screen.getByTestId("count")).toHaveTextContent("0");
  });

  it("groups under headings with a mixed group box and a fold button", async () => {
    const user = userEvent.setup();
    renderWithStrata(<Grid groupBy={(p) => p.hour} groupHeading={(g) => `At ${g}`} />);
    const early = screen.getByRole("region", { name: "At 08:00" });
    expect(within(early).getAllByRole("row")).toHaveLength(4);
    await user.click(screen.getByRole("checkbox", { name: "Select Photo 0" }));
    expect(screen.getByRole("checkbox", { name: "Select At 08:00" })).toBePartiallyChecked();
    await user.click(screen.getByRole("checkbox", { name: "Select At 08:00" }));
    expect(screen.getByTestId("count")).toHaveTextContent("0");
    await user.click(screen.getByRole("checkbox", { name: "Select At 08:00" }));
    expect(screen.getByTestId("count")).toHaveTextContent("4");
    await user.click(screen.getByRole("button", { name: "Fold At 08:00" }));
    expect(within(screen.getByRole("region", { name: "At 08:00" })).queryAllByRole("row")).toHaveLength(0);
    expect(screen.getByRole("button", { name: "Unfold At 08:00" })).toBeInTheDocument();
    expect(screen.getByTestId("count")).toHaveTextContent("4");
  });

  it("counts what a filter hides and clears it", async () => {
    const user = userEvent.setup();
    function Filtered() {
      const [q, setQ] = React.useState("");
      return (
        <>
          <input aria-label="q" value={q} onChange={(e) => setQ(e.target.value)} />
          <Grid rows={photos.filter((p) => p.name.includes(q))} />
        </>
      );
    }
    renderWithStrata(<Filtered />);
    await user.click(screen.getByRole("checkbox", { name: "Select Photo 0" }));
    await user.click(screen.getByRole("checkbox", { name: "Select Photo 1" }));
    await user.type(screen.getByRole("textbox", { name: "q" }), "Photo 5");
    expect(screen.getByRole("status")).toHaveTextContent("2 chosen are hidden by the filter");
    await user.click(screen.getByRole("button", { name: "Clear hidden" }));
    expect(screen.queryByText(/hidden by the filter/)).toBeNull();
    expect(screen.getByTestId("count")).toHaveTextContent("0");
  });

  it("says in words why a tile cannot be chosen, and shows a corner badge", () => {
    renderWithStrata(<Grid locked="p1" unselectableReason={() => "In a project"} badge={(p) => (p.id === "p0" ? <b>New</b> : null)} />);
    expect(screen.getByText("New")).toBeInTheDocument();
    expect(screen.getByText("In a project")).toBeInTheDocument();
    expect(screen.getByRole("checkbox", { name: "Select Photo 1" })).toBeDisabled();
  });
});
