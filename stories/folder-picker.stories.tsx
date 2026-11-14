import type { Meta, StoryObj } from "@storybook/react-vite";
import { http, HttpResponse, delay } from "msw";
import { FolderChooser } from "./screens/folder-chooser";

// Issue #188: a folder browser over the server's disk, answered by the same MSW handlers the tests
// use. `/home/ada/slow-share` is slow, `/home/ada/locked` refuses, `/media/library` has 500 folders.

const meta = { title: "Data/FolderPicker", component: FolderChooser, parameters: { layout: "padded" } } satisfies Meta<typeof FolderChooser>;
export default meta;
type Story = StoryObj<typeof meta>;

/** Open on a deep folder: its ancestors are open in the tree, and the path is a breadcrumb. */
export const Chosen: Story = { args: { start: "/home/ada/Projects/film-2026" } };

/** Nothing chosen yet: Choose and New folder wait for a folder. */
export const Fresh: Story = {};

/** The top level never arrives: a skeleton, not a blank. */
export const Loading: Story = {
  parameters: { msw: { handlers: [http.get("/api/folders", async () => { await delay("infinite"); return HttpResponse.json({ folders: [] }); })] } },
};

/** The top level fails: the server's reason and Try again. */
export const Failed: Story = {
  parameters: { msw: { handlers: [http.get("/api/folders", () => HttpResponse.json({ detail: "You are not allowed to browse this server." }, { status: 403, statusText: "Forbidden" }))] } },
};

/** 500 folders under /media/library: virtualised when a level reaches 100. */
export const FiveHundred: Story = { args: { start: "/media/library" } };

// Issue #233: an app that makes a project in a folder of camera files, or opens one that is already
// a project. Projects carry a badge; opening one chooses it; every other folder says why not.
const makeProject = {
  chooseLabel: "Create project here",
  canChoose: (path: string, folder?: { badge?: string }) =>
    folder?.badge === "project" || path.endsWith("/rushes") ? (true as const) : "Open a folder that holds camera files, or an existing project.",
  onOpen: (folder: { badge?: string }) => (folder.badge === "project" ? ("choose" as const) : ("enter" as const)),
};

/** Projects are badged in the tree, and opening one chooses it at once instead of entering it. */
export const ProjectBadges: Story = { args: { start: "/home/ada/Projects", ...makeProject } };

/** A folder that holds nothing to make a project from: Create project here is disabled and says why beside it. */
export const CannotChoose: Story = { args: { start: "/home/ada/Pictures", ...makeProject } };

/** A folder that can have a project made in it: the listing's footer says what it found. */
export const FooterNote: Story = { args: { start: "/home/ada/Projects/film-2026/rushes", ...makeProject } };
