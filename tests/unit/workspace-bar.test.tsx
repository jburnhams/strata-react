import { describe, expect, it } from "vitest";
import { screen, within } from "@testing-library/react";
import { Inspector, InspectorSection, Pane, Split, Workspace, WorkspaceBar, useWorkspaceState } from "../../src";
import { renderWithStrata } from "../../src/testing";

// Issue #365: the bar across the top of a Workspace. Issue #366: a Pane's body is inset by default
// so an Inspector's heading lines up with its sections; `flush` is edge to edge.

describe("WorkspaceBar", () => {
  it("is the banner with the tool's name as the heading, a polite status, actions and an end slot", () => {
    renderWithStrata(<WorkspaceBar title="Quake 2 explorer" status="pak.pak, mod.pak, 3 MB" actions={<button>Add files</button>} end={<button>Theme</button>} />);
    const bar = screen.getByRole("banner");
    expect(within(bar).getByRole("heading", { level: 1, name: "Quake 2 explorer" })).toBeInTheDocument();
    expect(within(bar).getByRole("status")).toHaveTextContent("pak.pak, mod.pak, 3 MB");
    expect(within(bar).getByRole("button", { name: "Add files" })).toBeInTheDocument();
    expect(within(bar).getByRole("button", { name: "Theme" })).toBeInTheDocument();
  });

  it("takes its height from the control height and wraps", () => {
    renderWithStrata(<WorkspaceBar title="Tool" />);
    expect(screen.getByRole("banner")).toHaveClass("min-h-(--control-h)", "flex-wrap");
  });
});

describe("Pane body", () => {
  function Tool({ flush }: { flush?: boolean }) {
    const state = useWorkspaceState();
    return (
      <Workspace label="Tool" state={state}>
        <Split direction="row">
          <Pane id="stage" name="Stage" grow>Stage</Pane>
          <Pane id="details" name="Details" flush={flush}>
            <Inspector title="clip.wal" empty={null}>
              <InspectorSection id="a" title="Size">32 by 32</InspectorSection>
            </Inspector>
          </Pane>
        </Split>
      </Workspace>
    );
  }
  const body = () => document.getElementById("pane-body-details")!;

  it("is inset by default so the inspector's heading lines up with the pane's name", () => {
    renderWithStrata(<Tool />);
    expect(body()).toHaveClass("p-3");
  });

  it("is edge to edge with flush", () => {
    renderWithStrata(<Tool flush />);
    expect(body()).not.toHaveClass("p-3");
  });
});
