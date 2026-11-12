import * as React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { Tree, ancestorsOf, parentOf, useExpanded, type Load } from "../../src";
import { renderWithStrata } from "../../src/testing";
import { resetFolders } from "../../stories/fixtures/folders";
import { FolderChooser } from "../../stories/screens/folder-chooser";
import { server } from "../utils/server";

afterEach(resetFolders);

const row = (name: string | RegExp) => screen.findByRole("row", { name: typeof name === "string" ? new RegExp(`^${name}$`) : name });

describe("path helpers", () => {
  it("finds a parent and the ancestors a tree must open", () => {
    expect(parentOf("/home/ada/Projects")).toBe("/home/ada");
    expect(parentOf("/home")).toBeNull();
    expect(ancestorsOf("/home/ada/Projects")).toEqual(["/home", "/home/ada"]);
    expect(ancestorsOf("/home")).toEqual([]);
  });
});

describe("FolderPicker", () => {
  it("lists the top, and reads a folder's children only when it is opened", async () => {
    const seen: string[] = [];
    server.events.on("request:start", ({ request }) => void (new URL(request.url).pathname === "/api/folders" && request.method === "GET" && seen.push(new URL(request.url).searchParams.get("path")!)));
    const user = userEvent.setup();
    renderWithStrata(<FolderChooser />);
    expect(screen.getByRole("status", { name: /loading/i })).toBeInTheDocument();
    await row("archive");
    expect(seen).toEqual(["/"]);
    await user.click(within(await row("home")).getByRole("button"));
    await row("ada");
    expect(seen).toEqual(["/", "/home"]);
    await user.click(within(await row("home")).getByRole("button")); // close
    await user.click(within(await row("home")).getByRole("button")); // open again: the cache answers
    await row("ada");
    expect(seen).toEqual(["/", "/home"]);
  });

  it("shows a count beside a folder and the full name as a title", async () => {
    renderWithStrata(<FolderChooser />);
    const home = await row("home");
    expect(home).toHaveTextContent("2");
    expect(within(home).getByTitle("home")).toBeInTheDocument();
  });

  it("shows a skeleton row while a folder loads, and Try again on a failed one, in place", async () => {
    const user = userEvent.setup();
    renderWithStrata(<FolderChooser start="/home/ada" />);
    await user.click(within(await row("locked")).getByRole("button"));
    expect(await screen.findByText(/do not have permission to open \/home\/ada\/locked/)).toBeInTheDocument();
    server.use(http.get("/api/folders", () => HttpResponse.json({ folders: [] })));
    await user.click(screen.getByRole("button", { name: "Try again" }));
    expect(await screen.findByText("No folders")).toBeInTheDocument();
  });

  it("opens the ancestors of a chosen folder, names the path as a breadcrumb and goes up", async () => {
    const user = userEvent.setup();
    renderWithStrata(<FolderChooser start="/home/ada/Projects" />);
    expect(await row("Projects")).toHaveAttribute("aria-selected", "true");
    const path = screen.getByRole("navigation", { name: "Folder path" });
    expect(within(path).getByRole("button", { name: "Projects" })).toHaveAttribute("aria-current", "location");
    await user.click(screen.getByRole("button", { name: "Up one folder" }));
    expect(await row(/^ada/)).toHaveAttribute("aria-selected", "true");
    await user.click(within(path).getByRole("button", { name: "home" }));
    expect(await row(/^home/)).toHaveAttribute("aria-selected", "true");
    expect(screen.getByRole("button", { name: "Up one folder" })).toBeEnabled();
    await user.click(screen.getByRole("button", { name: "Up one folder" }));
    expect(screen.getByRole("button", { name: "Up one folder" })).toBeDisabled();
  });

  it("goes to a typed path and opens its ancestors; Escape leaves the field", async () => {
    const user = userEvent.setup();
    renderWithStrata(<FolderChooser />);
    await row("archive");
    await user.click(screen.getByRole("button", { name: "Edit path" }));
    const box = screen.getByRole("textbox", { name: "Folder path" });
    await user.type(box, "/home/ada/Projects/film-2026/{Enter}");
    expect(screen.queryByRole("textbox", { name: "Folder path" })).toBeNull();
    expect(await row(/^film-2026/)).toHaveAttribute("aria-selected", "true");
    await user.click(screen.getByRole("button", { name: "Edit path" }));
    await user.keyboard("{Escape}");
    expect(screen.queryByRole("textbox", { name: "Folder path" })).toBeNull();
  });

  it("walks the tree by keyboard: Right opens, Down goes in, Left goes out and closes, type-ahead finds a folder, Enter chooses", async () => {
    const user = userEvent.setup();
    renderWithStrata(<FolderChooser />);
    await user.click(await row("archive"));
    await user.keyboard("{ArrowDown}");
    expect(await row("home")).toHaveFocus();
    expect(await row("home")).toHaveAttribute("aria-expanded", "false");
    await user.keyboard("{ArrowRight}");
    expect(await row("home")).toHaveAttribute("aria-expanded", "true");
    await row("ada");
    await user.keyboard("{ArrowDown}"); // into the first child
    expect(await row("ada")).toHaveFocus();
    await user.keyboard("{ArrowLeft}"); // out to the parent
    expect(await row("home")).toHaveFocus();
    await user.keyboard("{ArrowLeft}"); // close it
    expect(await row("home")).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByRole("row", { name: "ada" })).toBeNull();
    await user.keyboard("sr");
    expect(await row("srv")).toHaveFocus();
    await user.keyboard("{Enter}");
    expect(await row("srv")).toHaveAttribute("aria-selected", "true");
    expect(screen.getByRole("button", { name: "Choose this folder" })).toBeEnabled();
  });

  it("makes a folder, chooses it, and shows the server's refusal on the field", async () => {
    const user = userEvent.setup();
    renderWithStrata(<FolderChooser start="/home/ada/Projects" />);
    await row("Projects");
    const name = screen.getByRole("textbox", { name: "New folder" });
    await user.type(name, "notes{Enter}");
    expect(await screen.findByText(/A folder named notes already exists in \/home\/ada\/Projects\./, { selector: "p" })).toBeInTheDocument();
    expect(name).toBeInvalid();
    await user.clear(name);
    await user.type(name, "bad/name{Enter}");
    expect(await screen.findByText(/cannot contain/, { selector: "p" })).toBeInTheDocument();
    await user.clear(name);
    await user.type(name, "fresh{Enter}");
    expect(await row(/^fresh/)).toHaveAttribute("aria-selected", "true");
    expect(screen.queryByText(/already exists/)).toBeNull();
  });

  it("says a blank name is missing before asking the server", async () => {
    const user = userEvent.setup();
    renderWithStrata(<FolderChooser start="/home" />);
    await row("home");
    await user.click(screen.getByRole("button", { name: "Make folder" }));
    expect(await screen.findByText("Name the new folder.")).toBeInTheDocument();
  });

  it("has Choose this folder as the one filled button, waiting for a folder", async () => {
    const user = userEvent.setup();
    const onChoose = vi.fn();
    renderWithStrata(<FolderChooser onChoose={onChoose} />);
    await row("archive");
    expect(screen.getByRole("button", { name: "Choose this folder" })).toBeDisabled();
    expect(screen.getByRole("textbox", { name: "New folder" })).toBeDisabled();
    await user.click(await row("archive"));
    expect(document.querySelectorAll('[data-variant="default"]')).toHaveLength(1);
    await user.click(screen.getByRole("button", { name: "Choose this folder" }));
    expect(onChoose).toHaveBeenCalledWith("/archive");
  });

  it("goes to a recent folder in one press", async () => {
    const user = userEvent.setup();
    renderWithStrata(<FolderChooser />);
    await row("archive");
    await user.click(within(screen.getByRole("group", { name: "Recent folders" })).getByRole("button", { name: "/media/backup" }));
    expect(await row(/^backup/)).toHaveAttribute("aria-selected", "true");
  });

  it("draws only the visible rows of a folder of 500", async () => {
    renderWithStrata(<FolderChooser start="/media/library" />);
    await row("episode-001");
    const rows = screen.getAllByRole("row");
    expect(rows.length).toBeLessThan(60);
    expect(screen.queryByRole("row", { name: /episode-500/ })).toBeNull();
  });

  it("shows the server's reason when the top level fails, with Try again", async () => {
    server.use(http.get("/api/folders", () => HttpResponse.json({ detail: "You are not allowed to browse this server." }, { status: 403 })));
    renderWithStrata(<FolderChooser />);
    expect(await screen.findByText(/not allowed to browse this server/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Try again" })).toBeInTheDocument();
  });
});

describe("Tree", () => {
  type N = { id: string; name: string; leaf?: boolean };
  const done = (data: N[]): Load<readonly N[]> => ({ status: "ready", data });

  function Demo({ onSelect }: { onSelect: (k: string) => void }) {
    const expanded = useExpanded();
    const [selected, setSelected] = React.useState<string | null>(null);
    return (
      <Tree<N>
        label="Sections"
        roots={done([{ id: "a", name: "Alpha" }, { id: "b", name: "Beta", leaf: true }])}
        useChildren={(n) => done([{ id: `${n.id}1`, name: `${n.name} one`, leaf: true }])}
        nodeKey={(n) => n.id}
        nodeLabel={(n) => n.name}
        isBranch={(n) => !n.leaf}
        selected={selected}
        onSelect={(k) => { setSelected(k); onSelect(k); }}
        expanded={expanded}
        emptyRow="Nothing here"
      />
    );
  }

  it("offers an expander only on branches, and reports a selection with its key", async () => {
    const user = userEvent.setup();
    const onSelect = vi.fn();
    renderWithStrata(<Demo onSelect={onSelect} />);
    const alpha = await row("Alpha");
    expect(within(alpha).getByRole("button")).toBeInTheDocument();
    expect(within(await row("Beta")).queryByRole("button")).toBeNull();
    await user.click(within(alpha).getByRole("button"));
    await user.click(await row("Alpha one"));
    expect(onSelect).toHaveBeenLastCalledWith("a1");
    await waitFor(() => expect(screen.getByRole("treegrid", { name: "Sections" })).toBeInTheDocument());
  });
});
