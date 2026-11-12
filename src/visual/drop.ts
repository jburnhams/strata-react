// Dropping files on a target in a visual flow (strata-react issue #136, from strata-vid).
// Why not the obvious ways: a `DataTransfer` built in the page has no file-system entry, and React
// Aria's drop handling skips a file item whose `webkitGetAsEntry()` returns null (it reads the entry
// to tell a file from a folder); the file chooser instead gives each file the `lastModified` of the
// moment of the run, so any date the app shows from it changes every run. So the drop is built here:
// the bytes, name, type and a fixed `lastModified` go into real `File`s, and the data transfer the
// events carry answers `webkitGetAsEntry()` with a file entry. Native drag events are dispatched, so
// the app's handlers (React's or React Aria's) see what a browser's drop gives them.
import type { Locator, Page } from "playwright";

/** A file to drop. */
export interface DroppedFile {
  name: string;
  /** The file's bytes, or its text. */
  content: string | Uint8Array;
  /** MIME type. Default "application/octet-stream". */
  type?: string;
  /** Milliseconds since the epoch. Fixed by default (2026-01-01 UTC), so a date shown from the file never changes between runs. */
  lastModified?: number;
}

/** What `dropFiles` uses when a file gives no `lastModified`. */
export const DROPPED_FILE_MODIFIED = Date.UTC(2026, 0, 1);

/**
 * Drops files on a target as a person dragging them in from the desktop would: `dragenter`,
 * `dragover` and `drop`, with a data transfer that holds the files and file-system entries. The
 * target is a selector or a Playwright `Locator`; it must be on screen.
 */
export async function dropFiles(page: Page, target: string | Locator, files: DroppedFile[]): Promise<void> {
  const locator = typeof target === "string" ? page.locator(target).first() : target.first();
  const payload = files.map((f) => ({
    name: f.name,
    type: f.type ?? "application/octet-stream",
    lastModified: f.lastModified ?? DROPPED_FILE_MODIFIED,
    bytes: Array.from(typeof f.content === "string" ? new TextEncoder().encode(f.content) : f.content),
  }));
  await locator.evaluate((element, list) => {
    const made = list.map((f) => new File([new Uint8Array(f.bytes)], f.name, { type: f.type, lastModified: f.lastModified }));
    const items = made.map((file) => ({
      kind: "file" as const,
      type: file.type,
      getAsFile: () => file,
      getAsString: () => {},
      webkitGetAsEntry: () => ({
        isFile: true,
        isDirectory: false,
        name: file.name,
        fullPath: `/${file.name}`,
        file: (ok: (f: File) => void) => ok(file),
      }),
    }));
    const transfer = { dropEffect: "copy", effectAllowed: "all", types: ["Files"], files: made, items, getData: () => "", setData: () => {}, clearData: () => {}, setDragImage: () => {} };
    const rect = element.getBoundingClientRect();
    const at = { clientX: rect.left + rect.width / 2, clientY: rect.top + rect.height / 2 };
    for (const type of ["dragenter", "dragover", "drop"]) {
      const event = new DragEvent(type, { bubbles: true, cancelable: true, ...at });
      Object.defineProperty(event, "dataTransfer", { value: transfer });
      element.dispatchEvent(event);
    }
  }, payload);
}
