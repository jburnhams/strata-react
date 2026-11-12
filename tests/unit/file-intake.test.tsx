import { describe, expect, it, vi } from "vitest";
import { act, fireEvent, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { FileButton, FileDropZone, FileOutcomes, MissingFile, matchesAccept, useFileIntake, type FileIntakeOptions } from "../../src";
import { renderWithStrata } from "../../src/testing";

const accept = [".gpx", "video/*", "audio/*"];
const acceptLabel = "a video, an audio file or a GPX track";
const file = (name: string, type = "", bytes = 10) => new File([new Uint8Array(bytes)], name, { type });

function Library(props: Partial<FileIntakeOptions>) {
  const intake = useFileIntake({ accept, acceptLabel, ...props });
  return (
    <div>
      <FileDropZone title="Drag files here" acceptLabel={acceptLabel} onFiles={intake.add}>
        <FileButton accept={accept} multiple onFiles={intake.add}>
          Add files
        </FileButton>
      </FileDropZone>
      <FileOutcomes intake={intake} />
    </div>
  );
}

/** The drop target is the zone's own element; its named button is React Aria's hidden one for assistive technology. */
const zoneOf = () => screen.getByRole("button", { name: "Drag files here" }).closest<HTMLElement>("[data-rac]")!;

function drop(target: HTMLElement, files: File[]) {
  const items = files.map((f) => ({ kind: "file", type: f.type, getAsFile: () => f, getAsString: () => {}, webkitGetAsEntry: () => ({ isFile: true, isDirectory: false, name: f.name }) }));
  const dataTransfer = { types: ["Files"], items, files, dropEffect: "copy", effectAllowed: "all" };
  fireEvent.dragEnter(target, { dataTransfer });
  fireEvent.dragOver(target, { dataTransfer });
  fireEvent.drop(target, { dataTransfer });
}

describe("matchesAccept", () => {
  it("matches extensions, exact types and families, ignoring case", () => {
    expect(matchesAccept({ name: "Ride.GPX", type: "" }, accept)).toBe(true);
    expect(matchesAccept({ name: "a.mp4", type: "video/mp4" }, accept)).toBe(true);
    expect(matchesAccept({ name: "a.mp3", type: "audio/mpeg" }, ["audio/mpeg"])).toBe(true);
    expect(matchesAccept({ name: "a.wav", type: "audio/wav" }, ["audio/mpeg"])).toBe(false);
    expect(matchesAccept({ name: "notes.txt", type: "text/plain" }, accept)).toBe(false);
  });
});

describe("FileButton", () => {
  it("is a named button that opens the picker for the accepted types, and passes the chosen files", async () => {
    const user = userEvent.setup();
    const onFiles = vi.fn();
    const { container } = renderWithStrata(
      <FileButton accept={accept} multiple onFiles={onFiles}>
        Add files
      </FileButton>,
    );
    expect(screen.getByRole("button", { name: "Add files" })).toBeInTheDocument();
    const input = container.querySelector<HTMLInputElement>('input[type="file"]')!;
    expect(input).toHaveAttribute("accept", ".gpx,video/*,audio/*");
    expect(input).toHaveAttribute("multiple");
    const a = file("a.mp4", "video/mp4");
    await user.upload(input, a);
    expect(onFiles).toHaveBeenCalledWith([a]);
  });
});

describe("file intake", () => {
  it("adds accepted files and names each rejected one with its reason", async () => {
    const seen: string[] = [];
    renderWithStrata(<Library process={(f) => void seen.push(f.name)} />);
    drop(zoneOf(), [file("a.mp4", "video/mp4"), file("notes.txt", "text/plain"), file("ride.gpx")]);
    await waitFor(() => expect(screen.getAllByText("Added")).toHaveLength(2));
    expect(seen).toEqual(["a.mp4", "ride.gpx"]);
    expect(screen.getByText("Not added")).toBeInTheDocument();
    expect(screen.getByText(`notes.txt is not a type this accepts. Add ${acceptLabel}.`)).toBeInTheDocument();
  });

  it("rejects a file over the size limit with its size in the reason", async () => {
    const user = userEvent.setup();
    const { container } = renderWithStrata(<Library maxBytes={5 * 1024 * 1024} />);
    await user.upload(container.querySelector('input[type="file"]')!, file("big.mp4", "video/mp4", 6 * 1024 * 1024));
    expect(await screen.findByText("big.mp4 is 6.0 MB, over the 5.0 MB limit.")).toBeInTheDocument();
  });

  it("runs the app's own check and shows its reason in the product's words", async () => {
    const user = userEvent.setup();
    const { container } = renderWithStrata(
      <Library check={(f) => (f.name.endsWith(".avi") ? `${f.name} is not a video this browser can play. Convert it to MP4 and add it again.` : null)} />,
    );
    await user.upload(container.querySelector('input[type="file"]')!, [file("old.avi", "video/x-msvideo"), file("new.mp4", "video/mp4")]);
    expect(await screen.findByText(/old.avi is not a video this browser can play/)).toBeInTheDocument();
    await waitFor(() => expect(screen.getByText("Added")).toBeInTheDocument());
  });

  it("shows a file as still processing while the rest of the batch finishes, without blocking it", async () => {
    let release!: () => void;
    const gate = new Promise<void>((r) => (release = r));
    renderWithStrata(<Library process={(f) => (f.name === "slow.mp4" ? gate : undefined)} />);
    drop(zoneOf(), [file("slow.mp4", "video/mp4"), file("fast.mp4", "video/mp4")]);
    await waitFor(() => expect(screen.getByText("Added")).toBeInTheDocument());
    expect(screen.getByText("Adding…")).toBeInTheDocument();
    await act(async () => release());
    await waitFor(() => expect(screen.getAllByText("Added")).toHaveLength(2));
  });

  it("marks a throw as failed with its message, and retry runs it again", async () => {
    const user = userEvent.setup();
    let calls = 0;
    const { container } = renderWithStrata(
      <Library
        process={() => {
          if (++calls === 1) throw new Error("run-02.mp4 could not be read. Check the file and try again.");
        }}
      />,
    );
    await user.upload(container.querySelector('input[type="file"]')!, file("run-02.mp4", "video/mp4"));
    expect(await screen.findByText("Failed")).toBeInTheDocument();
    expect(screen.getByText("run-02.mp4 could not be read. Check the file and try again.")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Try again run-02.mp4" }));
    await waitFor(() => expect(screen.getByText("Added")).toBeInTheDocument());
    expect(calls).toBe(2);
  });

  it("takes one file at a time when asked, naming the extra", async () => {
    renderWithStrata(<Library multiple={false} />);
    drop(zoneOf(), [file("a.mp4", "video/mp4"), file("b.mp4", "video/mp4")]);
    expect(await screen.findByText("b.mp4 was not added: this takes one file at a time.")).toBeInTheDocument();
    expect(screen.getByText("Added")).toBeInTheDocument();
  });

  it("aborts processing that is still running when the screen goes away", async () => {
    const user = userEvent.setup();
    let aborted = false;
    const { container, unmount } = renderWithStrata(
      <Library
        process={(_f, { signal }) =>
          new Promise<void>((_res, rej) => signal.addEventListener("abort", () => ((aborted = true), rej(new Error("stopped")))))
        }
      />,
    );
    await user.upload(container.querySelector('input[type="file"]')!, file("a.mp4", "video/mp4"));
    expect(await screen.findByText("Adding…")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Dismiss a.mp4" })).not.toBeInTheDocument();
    unmount();
    expect(aborted).toBe(true);
  });

  it("announces one summary when a batch finishes, not one per file", async () => {
    renderWithStrata(<Library />);
    drop(zoneOf(), [file("a.mp4", "video/mp4"), file("b.mp4", "video/mp4"), file("c.txt", "text/plain")]);
    await waitFor(() => expect(screen.getByRole("status")).toHaveTextContent("2 added, 1 not added"));
  });

  it("dismisses finished rows", async () => {
    const user = userEvent.setup();
    renderWithStrata(<Library />);
    drop(zoneOf(), [file("c.txt", "text/plain")]);
    await user.click(await screen.findByRole("button", { name: "Dismiss c.txt" }));
    expect(screen.queryByText("c.txt")).not.toBeInTheDocument();
  });
});

describe("FileDropZone", () => {
  it("says what it takes while a drag is over it, then goes back, with the picker inside it", () => {
    renderWithStrata(<Library />);
    const zone = zoneOf();
    expect(within(zone).getByRole("button", { name: "Add files" })).toBeInTheDocument();
    const dataTransfer = { types: ["Files"], items: [{ kind: "file", type: "video/mp4", getAsFile: () => file("a.mp4") }], dropEffect: "copy", effectAllowed: "all" };
    fireEvent.dragEnter(zone, { dataTransfer });
    fireEvent.dragOver(zone, { dataTransfer });
    expect(screen.getByText(`Drop to add ${acceptLabel}`)).toBeInTheDocument();
    fireEvent.dragLeave(zone, { dataTransfer });
    expect(screen.getByText("Drag files here")).toBeInTheDocument();
  });
});

describe("MissingFile", () => {
  it("is a status word and a named relink that hands back the chosen file", async () => {
    const user = userEvent.setup();
    const onRelink = vi.fn();
    const { container } = renderWithStrata(<MissingFile name="run-02.mp4" accept={accept} onRelink={onRelink} />);
    expect(screen.getByText("File missing")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Relink run-02.mp4" })).toBeInTheDocument();
    const f = file("run-02.mp4", "video/mp4");
    await user.upload(container.querySelector('input[type="file"]')!, f);
    expect(onRelink).toHaveBeenCalledWith(f);
  });
});
