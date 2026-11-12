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

import { HttpResponse, http } from "msw";
import { AlertDialog, Dialog, Popover } from "../../src";
import { server } from "../utils/server";
import { renderWithStrata } from "../../src/testing";

describe("Dialog", () => {
  it("opens from its trigger by role and title, moves focus in, and returns it on Escape", async () => {
    const user = userEvent.setup();
    render(
      <Dialog title="Export video" description="Choose a size." trigger={<Button>Export</Button>} actions={(close) => <Button onPress={close}>Done</Button>}>
        <p>Body</p>
      </Dialog>,
    );
    const trigger = screen.getByRole("button", { name: "Export" });
    await user.click(trigger);
    const dialog = await screen.findByRole("dialog", { name: "Export video" });
    expect(dialog).toHaveTextContent("Choose a size.");
    expect(dialog.contains(document.activeElement)).toBe(true);
    await user.keyboard("{Escape}");
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    await waitFor(() => expect(trigger).toHaveFocus());
  });

  it("closes from its close control and from an action built with the close render prop", async () => {
    const user = userEvent.setup();
    render(<Dialog title="Rename" trigger={<Button>Open</Button>} actions={(close) => <Button onPress={close}>Save name</Button>} />);
    await user.click(screen.getByRole("button", { name: "Open" }));
    await user.click(await screen.findByRole("button", { name: "Close" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    await user.click(screen.getByRole("button", { name: "Open" }));
    await user.click(await screen.findByRole("button", { name: "Save name" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  });

  it("closes on a press outside", async () => {
    const user = userEvent.setup();
    render(<Dialog title="Rename" trigger={<Button>Open</Button>} />);
    await user.click(screen.getByRole("button", { name: "Open" }));
    await screen.findByRole("dialog");
    await user.click(document.body);
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  });

  it("cannot be closed while work runs (closable false): no close control, Escape or outside press", async () => {
    const user = userEvent.setup();
    render(<Dialog title="Exporting" open closable={false} />);
    await screen.findByRole("dialog", { name: "Exporting" });
    expect(screen.queryByRole("button", { name: "Close" })).toBeNull();
    await user.keyboard("{Escape}");
    await user.click(document.body);
    expect(screen.getByRole("dialog")).toBeInTheDocument();
  });

  it("keeps the title for screen readers only with hideTitle, and makes the page behind inert", async () => {
    render(
      <>
        <Button>Behind</Button>
        <Dialog title="Shortcuts" hideTitle open />
      </>,
    );
    const dialog = await screen.findByRole("dialog", { name: "Shortcuts" });
    expect(screen.getByText("Shortcuts")).toHaveClass("sr-only");
    expect(screen.queryByRole("button", { name: "Behind" })).toBeNull(); // hidden from the tree while modal
    expect(dialog).toBeInTheDocument();
  });

  it("is a sheet at the end edge with placement end", async () => {
    render(<Dialog title="Details" open placement="end" />);
    const dialog = await screen.findByRole("dialog", { name: "Details" });
    expect(dialog.parentElement).toHaveClass("rounded-r-none", "h-full");
  });
});

describe("AlertDialog", () => {
  function Harness({ onConfirm }: { onConfirm: () => void | Promise<unknown> }) {
    return <AlertDialog title="Delete 3 firings?" description="This cannot be undone." confirm="Delete 3 firings" onConfirm={onConfirm} trigger={<Button>Delete</Button>} />;
  }

  it("is an alertdialog that focuses the safe choice and ignores an outside press", async () => {
    const user = userEvent.setup();
    renderWithStrata(<Harness onConfirm={() => undefined} />);
    await user.click(screen.getByRole("button", { name: "Delete" }));
    const dialog = await screen.findByRole("alertdialog", { name: "Delete 3 firings?" });
    expect(screen.getByRole("button", { name: "Cancel" })).toHaveFocus();
    await user.click(document.body);
    expect(dialog).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Cancel" }));
    await waitFor(() => expect(screen.queryByRole("alertdialog")).toBeNull());
  });

  it("closes on Escape while focus is inside, since Cancel is the safe choice", async () => {
    const user = userEvent.setup();
    renderWithStrata(<Harness onConfirm={() => undefined} />);
    await user.click(screen.getByRole("button", { name: "Delete" }));
    await screen.findByRole("alertdialog");
    await user.keyboard("{Escape}");
    await waitFor(() => expect(screen.queryByRole("alertdialog")).toBeNull());
  });

  it("repeats the verb on the confirm button, runs it once and closes", async () => {
    const user = userEvent.setup();
    const calls: number[] = [];
    renderWithStrata(<Harness onConfirm={() => void calls.push(1)} />);
    await user.click(screen.getByRole("button", { name: "Delete" }));
    await user.click(await screen.findByRole("button", { name: "Delete 3 firings" }));
    expect(calls).toHaveLength(1);
    await waitFor(() => expect(screen.queryByRole("alertdialog")).toBeNull());
  });

  it("stays open with the server's reason when an async confirm fails, over real HTTP via MSW", async () => {
    server.use(http.delete("/api/firings", () => HttpResponse.json({ detail: "Firing 2 is running." }, { status: 409 })));
    const user = userEvent.setup();
    const { fetchJson } = await import("../../src");
    renderWithStrata(<Harness onConfirm={() => fetchJson("/api/firings", { method: "DELETE" })} />);
    await user.click(screen.getByRole("button", { name: "Delete" }));
    await user.click(await screen.findByRole("button", { name: "Delete 3 firings" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Firing 2 is running.");
    expect(screen.getByRole("alertdialog")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Delete 3 firings" })).toBeEnabled();
  });
});

describe("Popover", () => {
  it("opens beside its trigger with a name, closes on Escape and returns focus", async () => {
    const user = userEvent.setup();
    render(
      <Popover label="Line colour" trigger={<Button>Colour</Button>}>
        <input aria-label="Hex" />
      </Popover>,
    );
    const trigger = screen.getByRole("button", { name: "Colour" });
    expect(trigger).toHaveAttribute("aria-expanded", "false");
    await user.click(trigger);
    const pop = await screen.findByRole("dialog", { name: "Line colour" });
    expect(trigger).toHaveAttribute("aria-expanded", "true");
    expect(pop.contains(document.activeElement)).toBe(true);
    await user.keyboard("{Escape}");
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    await waitFor(() => expect(trigger).toHaveFocus());
  });

  it("closes on a press outside and is not clipped by an overflow parent", async () => {
    const user = userEvent.setup();
    render(
      <div style={{ overflow: "hidden" }} data-testid="clip">
        <Popover label="Filters" trigger={<Button>Filters</Button>}>
          <p>Body</p>
        </Popover>
      </div>,
    );
    await user.click(screen.getByRole("button", { name: "Filters" }));
    const pop = await screen.findByRole("dialog", { name: "Filters" });
    expect(screen.getByTestId("clip").contains(pop)).toBe(false);
    await user.click(document.body);
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  });
});
