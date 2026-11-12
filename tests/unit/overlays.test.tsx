import { describe, expect, it } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Button, IconButton, Tooltip } from "../../src";
import { Trash2 } from "lucide-react";

describe("Tooltip", () => {
  it("opens on keyboard focus, not only hover, and closes on Escape", async () => {
    const user = userEvent.setup();
    render(
      <Tooltip label="Delete clip" hint="Del">
        <Button>Clip</Button>
      </Tooltip>,
    );
    await user.tab();
    const tip = await screen.findByRole("tooltip");
    expect(tip).toHaveTextContent("Delete clip");
    expect(tip).toHaveTextContent("Del");
    await user.keyboard("{Escape}");
    await waitFor(() => expect(screen.queryByRole("tooltip")).toBeNull());
  });

  it("opens on hover and is not clipped by an overflow parent (it is portalled out)", async () => {
    const user = userEvent.setup();
    render(
      <div style={{ overflow: "hidden" }} data-testid="clip">
        <IconButton icon={Trash2} label="Delete clip" hint="Del" />
      </div>,
    );
    // React Aria opens on hover only after it has seen a real pointer (it tracks input modality).
    await user.click(document.body);
    await user.hover(screen.getByRole("button", { name: "Delete clip" }));
    const tip = await screen.findByRole("tooltip", {}, { timeout: 2000 });
    expect(screen.getByTestId("clip").contains(tip)).toBe(false);
  });
});
