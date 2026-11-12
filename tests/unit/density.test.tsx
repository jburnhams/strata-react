import { describe, expect, it } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Trash2 } from "lucide-react";
import { Button, ContextMenu, Density, Dialog, IconButton, Input, Menu, NativeSelect, NumberField, ThemeProvider, Toggle } from "../../src";

const root = document.documentElement;

describe("Density (issue #117)", () => {
  it("ThemeProvider density sets the attribute on the root and takes it off again", () => {
    const { unmount } = render(<ThemeProvider density="compact" storageKey={null}><p>app</p></ThemeProvider>);
    expect(root).toHaveAttribute("data-density", "compact");
    unmount();
    expect(root).not.toHaveAttribute("data-density");
  });

  it("sets nothing when no density is chosen, and restores an attribute the page already had", () => {
    root.setAttribute("data-density", "default");
    const { unmount } = render(<ThemeProvider storageKey={null}><p>app</p></ThemeProvider>);
    expect(root).toHaveAttribute("data-density", "default");
    unmount();
    const again = render(<Density page value="compact"><p>app</p></Density>);
    expect(root).toHaveAttribute("data-density", "compact");
    again.unmount();
    expect(root).toHaveAttribute("data-density", "default");
    root.removeAttribute("data-density");
  });

  it("a region wraps its children in an element that carries the density, and `default` steps back inside a compact page", () => {
    render(
      <Density page value="compact">
        <Density value="default" className="region">
          <p>dense inspector</p>
        </Density>
      </Density>,
    );
    const region = screen.getByText("dense inspector").parentElement!;
    expect(region).toHaveAttribute("data-density", "default");
    expect(region).toHaveClass("region");
    expect(region.closest("[data-density]")).toBe(region);
  });

  describe("overlays portal out of the app's root, so only a page-level density reaches them", () => {
    it("a Dialog and a Menu are inside the root when the page is compact", async () => {
      const user = userEvent.setup();
      render(
        <ThemeProvider density="compact" storageKey={null}>
          <Dialog title="Export video" open />
          <Menu label="Edit" trigger={<Button>Edit</Button>} items={[{ id: "split", label: "Split", run: () => undefined }]} />
        </ThemeProvider>,
      );
      const dialog = await screen.findByRole("dialog", { name: "Export video" });
      expect(dialog.closest("[data-density]")).toBe(root);
      expect(root).toHaveAttribute("data-density", "compact");
      void user;
    });

    it("a context menu is inside the root when the page is compact", async () => {
      render(
        <ThemeProvider density="compact" storageKey={null}>
          <ContextMenu label="Clip actions" items={[{ id: "split", label: "Split", run: () => undefined }]}>
            <div>Clip</div>
          </ContextMenu>
        </ThemeProvider>,
      );
      fireEvent.contextMenu(screen.getByText("Clip"));
      const menu = await screen.findByRole("menu");
      expect(menu.closest("[data-density]")).toBe(root);
    });

    it("a region does not reach an overlay opened from inside it: the confirm is the app's, at the page's density", async () => {
      render(
        <Density value="compact">
          <Dialog title="Delete clip?" open />
        </Density>,
      );
      const dialog = await screen.findByRole("dialog", { name: "Delete clip?" });
      expect(dialog.closest("[data-density]")).toBeNull();
    });
  });
});

describe("one set of control sizes (issue #117)", () => {
  it("every control that takes `size` has the same two heights", () => {
    render(
      <>
        <IconButton icon={Trash2} label="Delete small" size="sm" />
        <IconButton icon={Trash2} label="Delete" />
        <Toggle label="Mute small" iconOnly icon={Trash2} size="sm" />
        <Input aria-label="Small input" size="sm" />
        <Input aria-label="Input" />
        <NativeSelect aria-label="Small select" size="sm"><option>One</option></NativeSelect>
        <NativeSelect aria-label="Select"><option>One</option></NativeSelect>
        <NumberField aria-label="Small number" size="sm" value={1} onChange={() => undefined} />
        <NumberField aria-label="Number" value={1} onChange={() => undefined} />
      </>,
    );
    const small = [
      screen.getByRole("button", { name: "Delete small" }),
      screen.getByRole("button", { name: "Mute small" }),
      screen.getByRole("textbox", { name: "Small input" }),
      screen.getByRole("combobox", { name: "Small select" }),
      screen.getByRole("textbox", { name: "Small number" }).parentElement!,
    ];
    const normal = [
      screen.getByRole("button", { name: "Delete" }),
      screen.getByRole("textbox", { name: "Input" }),
      screen.getByRole("combobox", { name: "Select" }),
      screen.getByRole("textbox", { name: "Number" }).parentElement!,
    ];
    for (const el of small) expect(el.className, el.outerHTML).toMatch(/\b(size|h)-\(--control-h-sm\)/);
    for (const el of normal) expect(el.className, el.outerHTML).toMatch(/\b(size|h)-\(--control-h\)/);
  });

  it("does not pass the native `size` attribute on, since `size` is a control size here", () => {
    render(<Input aria-label="Name" size="sm" />);
    expect(screen.getByRole("textbox", { name: "Name" })).not.toHaveAttribute("size");
  });
});
