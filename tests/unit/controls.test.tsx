import { useState } from "react";
import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Grid2x2, Magnet } from "lucide-react";
import { Button, Switch, Toggle, ToggleGroup, Toolbar, ToolbarSeparator } from "../../src";
import { expectOneFilledButton } from "../../src/testing";

describe("Toggle", () => {
  it("exposes aria-pressed and flips on press", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<Toggle label="Grid" onChange={onChange} />);
    const grid = screen.getByRole("button", { name: "Grid" });
    expect(grid).toHaveAttribute("aria-pressed", "false");
    await user.click(grid);
    expect(grid).toHaveAttribute("aria-pressed", "true");
    expect(onChange).toHaveBeenCalledWith(true);
    await user.keyboard(" ");
    expect(grid).toHaveAttribute("aria-pressed", "false");
  });

  it("is controlled with `pressed`", async () => {
    const user = userEvent.setup();
    function Harness() {
      const [on, setOn] = useState(true);
      return <Toggle label="Snap" pressed={on} onChange={setOn} />;
    }
    render(<Harness />);
    const snap = screen.getByRole("button", { name: "Snap" });
    expect(snap).toHaveAttribute("aria-pressed", "true");
    await user.click(snap);
    expect(snap).toHaveAttribute("aria-pressed", "false");
  });

  it("an icon-only toggle is named by its label and shows it as a tooltip on focus", async () => {
    const user = userEvent.setup();
    render(<Toggle label="Snap to edges" icon={Magnet} iconOnly />);
    const snap = screen.getByRole("button", { name: "Snap to edges" });
    expect(snap).not.toHaveTextContent("Snap");
    await user.tab();
    expect(snap).toHaveFocus();
    expect(await screen.findByRole("tooltip")).toHaveTextContent("Snap to edges");
  });

  it("marks the chosen state by more than colour and never as the filled primary", () => {
    render(
      <>
        <Toggle label="Grid" defaultPressed />
        <Button variant="default">Export</Button>
      </>,
    );
    const grid = screen.getByRole("button", { name: "Grid" });
    expect(grid).toHaveAttribute("data-selected", "true");
    expect(grid.className).toContain("data-[selected]:border-foreground");
    expect(grid.className).not.toContain("bg-primary");
    expectOneFilledButton(); // the chosen toggle does not count as a second filled button
  });

  it("does nothing when disabled", async () => {
    const onChange = vi.fn();
    render(<Toggle label="Grid" disabled onChange={onChange} />);
    await userEvent.click(screen.getByRole("button", { name: "Grid" }));
    expect(onChange).not.toHaveBeenCalled();
  });
});

describe("ToggleGroup", () => {
  const options = [
    { value: "full", label: "Full" },
    { value: "half", label: "Half" },
    { value: "quarter", label: "Quarter" },
  ];
  function Harness({ onChange }: { onChange?: (v: string) => void }) {
    const [value, setValue] = useState("full");
    return (
      <ToggleGroup
        label="Preview quality"
        options={options}
        value={value}
        onChange={(v) => {
          setValue(v);
          onChange?.(v);
        }}
      />
    );
  }

  it("is a named single-choice group that says which option is chosen", () => {
    render(<Harness />);
    const group = screen.getByRole("radiogroup", { name: "Preview quality" });
    expect(group).toBeInTheDocument();
    expect(screen.getByRole("radio", { name: "Full" })).toBeChecked();
    expect(screen.getByRole("radio", { name: "Half" })).not.toBeChecked();
  });

  it("chooses on press, always keeps one chosen, and moves with the arrow keys", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<Harness onChange={onChange} />);
    await user.click(screen.getByRole("radio", { name: "Half" }));
    expect(screen.getByRole("radio", { name: "Half" })).toBeChecked();
    expect(onChange).toHaveBeenLastCalledWith("half");
    await user.click(screen.getByRole("radio", { name: "Half" })); // pressing the chosen one does not clear it
    expect(screen.getByRole("radio", { name: "Half" })).toBeChecked();
    await user.keyboard("{ArrowRight}");
    expect(screen.getByRole("radio", { name: "Quarter" })).toHaveFocus();
  });

  it("an icon-only option keeps its label as the name", () => {
    render(
      <ToggleGroup
        label="View"
        value="grid"
        onChange={() => undefined}
        options={[{ value: "grid", label: "Grid view", icon: Grid2x2, iconOnly: true }, { value: "list", label: "List view" }]}
      />,
    );
    expect(screen.getByRole("radio", { name: "Grid view" })).toBeChecked();
  });
});

describe("Switch", () => {
  it("is a switch whose label and control are one target, and applies at once", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<Switch label="Show elevation profile" onChange={onChange} />);
    const sw = screen.getByRole("switch", { name: "Show elevation profile" });
    expect(sw).not.toBeChecked();
    await user.click(screen.getByText("Show elevation profile")); // the label is the target too
    expect(sw).toBeChecked();
    expect(onChange).toHaveBeenCalledWith(true);
    await user.keyboard(" ");
    expect(sw).not.toBeChecked();
  });

  it("can be controlled and disabled", async () => {
    const onChange = vi.fn();
    render(<Switch label="Heatmap" on disabled onChange={onChange} />);
    const sw = screen.getByRole("switch", { name: "Heatmap" });
    expect(sw).toBeChecked();
    await userEvent.click(sw);
    expect(onChange).not.toHaveBeenCalled();
  });
});

describe("Toolbar", () => {
  function Bar() {
    return (
      <>
        <button>Before</button>
        <Toolbar label="Preview options">
          <Toggle label="Safe areas" />
          <Toggle label="Grid" />
          <ToolbarSeparator />
          <Button>Fit</Button>
        </Toolbar>
        <button>After</button>
      </>
    );
  }

  it("is a named toolbar with one tab stop, arrows and Home/End inside, and Tab leaves it", async () => {
    const user = userEvent.setup();
    render(<Bar />);
    expect(screen.getByRole("toolbar", { name: "Preview options" })).toBeInTheDocument();
    await user.tab(); // Before
    await user.tab(); // into the toolbar: first control
    expect(screen.getByRole("button", { name: "Safe areas" })).toHaveFocus();
    await user.keyboard("{ArrowRight}");
    expect(screen.getByRole("button", { name: "Grid" })).toHaveFocus();
    await user.keyboard("{End}");
    expect(screen.getByRole("button", { name: "Fit" })).toHaveFocus();
    await user.keyboard("{Home}");
    expect(screen.getByRole("button", { name: "Safe areas" })).toHaveFocus();
    await user.tab();
    expect(screen.getByRole("button", { name: "After" })).toHaveFocus();
  });

  it("draws a separator between groups", () => {
    render(<Bar />);
    expect(screen.getByRole("separator")).toBeInTheDocument();
  });
});
