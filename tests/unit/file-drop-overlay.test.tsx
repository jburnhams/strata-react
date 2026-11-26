import { describe, expect, it, vi } from "vite-plus/test";
import { act, fireEvent, screen } from "@testing-library/react";
import {
  FileDropOverlay,
  Pane,
  Split,
  Workspace,
  useWorkspaceState,
  STRATA_DRAG_TYPE,
} from "../../src";
import { renderWithStrata } from "../../src/testing";

// Issue #368: a window-wide drop of files with an overlay that names what it takes.

const dragOf = (types: string[], files: File[] = []) => ({
  dataTransfer: {
    types,
    files,
    items: files.map((f) => ({ kind: "file", getAsFile: () => f })),
    dropEffect: "none",
  },
});
const over = (types: string[] = ["Files"]) =>
  act(() => void fireEvent.dragEnter(document.body, dragOf(types)));

describe("FileDropOverlay", () => {
  it("shows what it takes while files are dragged over the window, and goes when they leave", () => {
    renderWithStrata(<FileDropOverlay onFiles={() => {}} acceptLabel="PAK files" />);
    expect(screen.queryByText(/Drop to add/)).toBeNull();
    over();
    expect(screen.getByText("Drop to add PAK files")).toBeInTheDocument();
    act(() => void fireEvent.dragLeave(document.body, dragOf(["Files"])));
    expect(screen.queryByText(/Drop to add/)).toBeNull();
  });

  it("stays while the pointer crosses the window's children (enter and leave come in pairs)", () => {
    renderWithStrata(<FileDropOverlay onFiles={() => {}} acceptLabel="PAK files" />);
    over();
    over();
    act(() => void fireEvent.dragLeave(document.body, dragOf(["Files"])));
    expect(screen.getByText("Drop to add PAK files")).toBeInTheDocument();
    act(() => void fireEvent.dragLeave(document.body, dragOf(["Files"])));
    expect(screen.queryByText(/Drop to add/)).toBeNull();
  });

  it("calls onFiles with the dropped files and hides", () => {
    const onFiles = vi.fn();
    renderWithStrata(<FileDropOverlay onFiles={onFiles} acceptLabel="PAK files" />);
    const file = new File(["x"], "pak0.pak");
    over();
    act(() => void fireEvent.drop(document.body, dragOf(["Files"], [file])));
    expect(onFiles).toHaveBeenCalledWith([file]);
    expect(screen.queryByText(/Drop to add/)).toBeNull();
  });

  it("allows the drop (cancels dragover) for files only", () => {
    renderWithStrata(<FileDropOverlay onFiles={() => {}} acceptLabel="files" />);
    expect(fireEvent.dragOver(document.body, dragOf(["Files"]))).toBe(false);
    expect(fireEvent.dragOver(document.body, dragOf(["text/plain"]))).toBe(true);
  });

  it("ignores the app's own drags (DragSource's type and refuseTypes) and text", () => {
    const onFiles = vi.fn();
    renderWithStrata(
      <FileDropOverlay
        onFiles={onFiles}
        acceptLabel="files"
        refuseTypes={["application/x-clip"]}
      />,
    );
    over(["Files", STRATA_DRAG_TYPE]);
    over(["Files", "application/x-clip"]);
    over(["text/plain"]);
    expect(screen.queryByText(/Drop to add/)).toBeNull();
    act(
      () =>
        void fireEvent.drop(
          document.body,
          dragOf(["Files", STRATA_DRAG_TYPE], [new File(["x"], "a")]),
        ),
    );
    expect(onFiles).not.toHaveBeenCalled();
  });

  it("does nothing while disabled", () => {
    renderWithStrata(<FileDropOverlay onFiles={() => {}} acceptLabel="files" disabled />);
    over();
    expect(screen.queryByText(/Drop to add/)).toBeNull();
  });
});

describe("Workspace onFiles", () => {
  it("is the same overlay, mounted by the workspace", () => {
    const onFiles = vi.fn();
    function Tool() {
      const state = useWorkspaceState();
      return (
        <Workspace label="Explorer" state={state} onFiles={onFiles} acceptLabel="PAK files">
          <Split direction="row">
            <Pane id="stage" name="Stage" grow>
              Stage
            </Pane>
          </Split>
        </Workspace>
      );
    }
    renderWithStrata(<Tool />);
    over();
    expect(screen.getByText("Drop to add PAK files")).toBeInTheDocument();
    const file = new File(["x"], "pak.pak");
    act(() => void fireEvent.drop(document.body, dragOf(["Files"], [file])));
    expect(onFiles).toHaveBeenCalledWith([file]);
  });
});
