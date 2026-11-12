import { describe, expect, it } from "vitest";
import { renderWithStrata } from "../../src/testing";
import { CommandLegend, KeysLegend, type Command } from "../../src";

// Issue #136: arrows and macOS modifiers are drawn as icons (the bundled fonts do not have them), and still read as words.
describe("keys drawn as icons", () => {
  it("draws arrows in the legend as icons and names them for a screen reader", () => {
    const { container } = renderWithStrata(<KeysLegend shortcuts={[{ keys: ["ArrowLeft", "ArrowRight"], label: "Step" }, { keys: ["Escape"], label: "Close" }]} />);
    expect(container.textContent).not.toMatch(/[←→]/);
    expect(container.querySelectorAll("svg[aria-hidden='true']")).toHaveLength(2);
    expect(container.textContent).toContain("left arrow");
    expect(container.textContent).toContain("right arrow");
    expect(container.textContent).toContain("Esc");
  });

  it("draws the mac modifiers in a command legend as icons, with their names", () => {
    const commands: Command[] = [{ id: "undo", label: "Undo", keys: ["Mod+Shift+Z"], run: () => {} }];
    const { container } = renderWithStrata(<CommandLegend commands={commands} platform="mac" />);
    expect(container.textContent).not.toMatch(/[⌘⇧]/);
    expect(container.textContent).toMatch(/Shift\s*Command\s*Z/);
    expect(container.querySelectorAll("svg")).toHaveLength(2);
  });

  it("leaves other platforms' words alone", () => {
    const commands: Command[] = [{ id: "undo", label: "Undo", keys: ["Mod+Z"], run: () => {} }];
    const { container } = renderWithStrata(<CommandLegend commands={commands} platform="other" />);
    expect(container.textContent).toContain("Ctrl+Z");
    expect(container.querySelector("svg")).toBeNull();
  });
});
