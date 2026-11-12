import * as React from "react";
import { useQueryClient } from "@tanstack/react-query";
import { FolderPicker, fetchJson, useExpanded, useLoad, type Folder, type FolderPickerProps } from "../../src";

// The folder picker wired to the pretend disk through the real query bridge, for the stories and the
// tests alike: the reads are `useLoad` over `fetchJson`, the write is a POST then an invalidation.

export function useFolders(path: string | null) {
  return useLoad<readonly Folder[]>({
    queryKey: ["folders", path ?? "/"],
    queryFn: async () => (await fetchJson<{ folders: Folder[] }>(`/api/folders?path=${encodeURIComponent(path ?? "/")}`)).folders,
    retry: false,
  });
}

export function FolderChooser({ start = null, onChoose, ...rest }: { start?: string | null; onChoose?: (path: string) => void } & Partial<FolderPickerProps>) {
  const client = useQueryClient();
  const [value, setValue] = React.useState<string | null>(start);
  const expanded = useExpanded({ initial: start ? [start] : [] });
  return (
    <FolderPicker
      label="Choose a folder for the project"
      useFolders={useFolders}
      value={value}
      onChange={setValue}
      onChoose={onChoose ?? (() => undefined)}
      expanded={expanded}
      recent={["/home/ada/Projects/kiln-room", "/media/backup"]}
      onCreate={async (parent, name) => {
        await fetchJson("/api/folders", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ parent, name }) });
        await client.invalidateQueries({ queryKey: ["folders", parent] });
      }}
      {...rest}
    />
  );
}
