import { beforeEach, describe, expect, it } from "vitest";
import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Button, Pane, Split, Workspace, useWorkspaceState } from "../../src";
import { renderWithStrata } from "../../src/testing";

function Editor({ persist, narrowBelow = 0 }: { persist?: string; narrowBelow?: number }) {
  const ws = useWorkspaceState(persist);
  return (
    <>
      <Button onClick={() => ws.toggle("library")}>View library</Button>
      <Button onClick={ws.reset}>Reset layout</Button>
      <Workspace label="Editor" state={ws} narrowBelow={narrowBelow}>
        <Split direction="column">
          <Split direction="row">
            <Pane id="library" name="Library" size={300} min={200} max={400} collapsible>
              <p>Clips</p>
            </Pane>
            <Pane id="stage" name="Preview" grow>
              <p>Frame</p>
            </Pane>
            <Pane id="inspector" name="Inspector" size={280} min={200} actions={<Button size="sm">Reset</Button>}>
              <p>Properties</p>
            </Pane>
          </Split>
          <Pane id="timeline" name="Timeline" size={200} min={120} collapsible>
            <p>Tracks</p>
          </Pane>
        </Split>
      </Workspace>
    </>
  );
}

const sep = (name: string) => screen.getByRole("separator", { name: `Resize ${name}` });

beforeEach(() => window.localStorage.clear());

describe("Workspace", () => {
  it("is a named group of regions, each named by its own header", () => {
    renderWithStrata(<Editor />);
    const ws = screen.getByRole("group", { name: "Editor" });
    for (const name of ["Library", "Preview", "Inspector", "Timeline"]) expect(within(ws).getByRole("region", { name })).toBeInTheDocument();
    expect(within(screen.getByRole("region", { name: "Inspector" })).getByRole("button", { name: "Reset" })).toBeInTheDocument();
  });

  it("gives each separator its role, value and limits, and puts it in the tab order", () => {
    renderWithStrata(<Editor />);
    const s = sep("Library");
    expect(s).toHaveAttribute("aria-orientation", "vertical");
    expect(s).toHaveAttribute("aria-valuenow", "300");
    expect(s).toHaveAttribute("aria-valuemin", "200");
    expect(s).toHaveAttribute("aria-valuemax", "400");
    expect(s).toHaveAttribute("tabindex", "0");
    expect(sep("Timeline")).toHaveAttribute("aria-orientation", "horizontal");
  });

  it("moves with the arrow keys (Shift for more), in the pane's own direction, and stops at the limits", async () => {
    const user = userEvent.setup();
    renderWithStrata(<Editor />);
    sep("Library").focus();
    await user.keyboard("{ArrowRight}");
    expect(sep("Library")).toHaveAttribute("aria-valuenow", "310");
    await user.keyboard("{Shift>}{ArrowLeft}{/Shift}");
    expect(sep("Library")).toHaveAttribute("aria-valuenow", "260");
    // The inspector is after its separator, so moving the separator right makes it smaller.
    sep("Inspector").focus();
    await user.keyboard("{ArrowRight}");
    expect(sep("Inspector")).toHaveAttribute("aria-valuenow", "270");
    // Up makes the bottom pane taller.
    sep("Timeline").focus();
    await user.keyboard("{ArrowUp}");
    expect(sep("Timeline")).toHaveAttribute("aria-valuenow", "210");
    sep("Library").focus();
    await user.keyboard("{End}");
    expect(sep("Library")).toHaveAttribute("aria-valuenow", "400");
    await user.keyboard("{ArrowRight}");
    expect(sep("Library")).toHaveAttribute("aria-valuenow", "400");
    await user.keyboard("{Home}");
    expect(sep("Library")).toHaveAttribute("aria-valuenow", "200");
    await user.keyboard("{ArrowLeft}");
    expect(sep("Library")).toHaveAttribute("aria-valuenow", "200");
  });

  it("restores the default size with Enter or a double-click", async () => {
    const user = userEvent.setup();
    renderWithStrata(<Editor />);
    sep("Library").focus();
    await user.keyboard("{ArrowRight}{ArrowRight}{Enter}");
    expect(sep("Library")).toHaveAttribute("aria-valuenow", "300");
    await user.keyboard("{ArrowRight}");
    await user.dblClick(sep("Library"));
    expect(sep("Library")).toHaveAttribute("aria-valuenow", "300");
  });

  it("folds a pane to a rail with a visible way back, from its button and from outside", async () => {
    const user = userEvent.setup();
    renderWithStrata(<Editor />);
    await user.click(screen.getByRole("button", { name: "Hide Library" }));
    const rail = document.querySelector('[data-pane="library"]')!;
    expect(rail).toHaveAttribute("data-collapsed");
    expect(screen.queryByText("Clips")).not.toBeVisible();
    expect(screen.queryByRole("separator", { name: "Resize Library" })).toBeNull();
    await user.click(screen.getByRole("button", { name: "Show Library" }));
    expect(screen.getByText("Clips")).toBeVisible();
    await user.click(screen.getByRole("button", { name: "View library" }));
    expect(screen.getByRole("button", { name: "Show Library" })).toHaveAttribute("aria-expanded", "false");
    await user.click(screen.getByRole("button", { name: "View library" }));
    expect(screen.getByText("Clips")).toBeVisible();
  });

  it("remembers sizes and folded panes across a reload, and Reset forgets them", async () => {
    const user = userEvent.setup();
    const first = renderWithStrata(<Editor persist="editor" />);
    sep("Library").focus();
    await user.keyboard("{ArrowRight}");
    await user.click(screen.getByRole("button", { name: "Hide Timeline" }));
    first.unmount();
    renderWithStrata(<Editor persist="editor" />);
    expect(sep("Library")).toHaveAttribute("aria-valuenow", "310");
    expect(screen.getByRole("button", { name: "Show Timeline" })).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Reset layout" }));
    expect(sep("Library")).toHaveAttribute("aria-valuenow", "300");
    expect(screen.getByRole("button", { name: "Hide Timeline" })).toBeInTheDocument();
  });

  it("falls back to the defaults when storage is empty, broken or blocked", () => {
    window.localStorage.setItem("strata:workspace:editor", "{not json");
    renderWithStrata(<Editor persist="editor" />);
    expect(sep("Library")).toHaveAttribute("aria-valuenow", "300");
    const original = Storage.prototype.setItem;
    Storage.prototype.setItem = () => {
      throw new Error("blocked");
    };
    try {
      expect(() => renderWithStrata(<Editor persist="other" />)).not.toThrow();
    } finally {
      Storage.prototype.setItem = original;
    }
  });

  it("stacks side-by-side panes when narrow, with the collapsible panes folded to their headers", async () => {
    const user = userEvent.setup();
    renderWithStrata(<Editor narrowBelow={900} />);
    expect(screen.queryByRole("separator", { name: "Resize Library" })).toBeNull();
    expect(screen.getByText("Clips")).not.toBeVisible();
    await user.click(screen.getByRole("button", { name: "Show Library" }));
    expect(screen.getByText("Clips")).toBeVisible();
  });
});
