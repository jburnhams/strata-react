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
