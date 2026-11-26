import * as React from "react";
import {
  Button,
  ByteView,
  ColorSchemeChoice,
  Console,
  FileButton,
  Inspector,
  InspectorSection,
  Pane,
  PixelImage,
  PropertyList,
  Split,
  Tree,
  Workspace,
  WorkspaceBar,
  useExpanded,
  useWorkspaceState,
  type ConsoleLine,
  type Load,
} from "../../src";

// The Quake 2 explorer's shape (the app these issues came from): a tool screen. One question: what is
// in this archive, and what does the file I chose look like? The finding is the bar's status ("3 files,
// 19 KB"); the order is the next questions: which file (tree), what is it (inspector, picture), what are
// its bytes (hex), and what did the tool say (console). It is the composition story for WorkspaceBar,
// Tree `branchPress="toggle"`, Pane `flush`, Inspector, PixelImage, ByteView, Console and the
// `Workspace onFiles` drop, so the pieces are seen to fit, not only to exist.

type Entry = { path: string; name: string; folder: boolean; size?: number };
const entries: Entry[] = [
  { path: "textures", name: "textures", folder: true },
  { path: "textures/e1u1", name: "e1u1", folder: true },
  { path: "textures/e1u1/brick.wal", name: "brick.wal", folder: false, size: 4096 },
  { path: "maps", name: "maps", folder: true },
  { path: "maps/base1.bsp", name: "base1.bsp", folder: false, size: 12288 },
  { path: "readme.txt", name: "readme.txt", folder: false, size: 1536 },
];
const childrenOf = (path: string | null) =>
  entries.filter((e) => (e.path.includes("/") ? e.path.slice(0, e.path.lastIndexOf("/")) : null) === path);
const ready = (data: Entry[]): Load<readonly Entry[]> => ({ status: "ready", data, refreshing: false }) as never;

const brick = (() => {
  const out = new Uint8Array(32 * 32 * 4);
  for (let y = 0; y < 32; y++)
    for (let x = 0; x < 32; x++) {
      const mortar = y % 4 === 0 || (x + (Math.floor(y / 4) % 2) * 4) % 8 === 0;
      out.set(mortar ? [168, 160, 150, 255] : [150 + ((x * 7 + y * 3) % 24), 70, 52, 255], (y * 32 + x) * 4);
    }
  return out;
})();
const header = (() => {
  const out = new Uint8Array(256);
  out.set(new TextEncoder().encode("WAL brick"), 0);
  for (let i = 32; i < 256; i++) out[i] = (i * 29) % 251;
  return out;
})();

export function PakExplorer({
  initialFile = "textures/e1u1/brick.wal",
  narrow,
}: {
  initialFile?: string;
  narrow?: number;
}) {
  const ws = useWorkspaceState();
  const open = useExpanded({ initial: ["textures", "textures/e1u1"] });
  const [file, setFile] = React.useState<string | null>(initialFile);
  const [lines, setLines] = React.useState<ConsoleLine[]>([{ id: 1, text: "Opened pak0.pak: 6 entries" }]);
  const chosen = entries.find((e) => e.path === file);

  return (
    <div className="h-160">
      <Workspace
        label="Quake 2 explorer"
        state={ws}
        narrowBelow={narrow}
        onFiles={(files) =>
          setLines((l) => [
            ...l,
            { id: l.length + 1, text: `Dropped ${files.length} file${files.length === 1 ? "" : "s"}` },
          ])
        }
        acceptLabel="PAK files"
      >
        <WorkspaceBar
          title="Quake 2 explorer"
          status="pak0.pak, 6 entries, 19 KB"
          actions={
            <FileButton accept={[".pak"]} multiple onFiles={() => {}} variant="default" size="sm">
              Add PAK files
            </FileButton>
          }
          end={<ColorSchemeChoice compact />}
        />
        <Split direction="column">
          <Split direction="row">
            <Pane id="files" name="Files" size={260} min={200} collapsible flush>
              <Tree<Entry>
                label="Files"
                roots={ready(childrenOf(null))}
                useChildren={(n) => ready(childrenOf(n.path))}
                nodeKey={(n) => n.path}
                nodeLabel={(n) => n.name}
                isBranch={(n) => n.folder}
                expanded={open}
                emptyRow="Empty folder"
                selected={file}
                onSelect={(key) => setFile(key)}
                branchPress="toggle"
                height="30rem"
              />
            </Pane>
            <Pane id="bytes" name="Bytes" grow flush>
              <div className="p-3">
                {chosen && !chosen.folder ? (
                  <ByteView
                    label={chosen.name}
                    bytes={header}
                    highlight={[{ start: 0, end: 9, tone: "info", label: "name" }]}
                    height={220}
                  />
                ) : (
                  <p className="type-body-sm text-muted-foreground">Choose a file to see its bytes.</p>
                )}
              </div>
            </Pane>
            <Pane id="details" name="Details" size={280} min={220} collapsible>
              <Inspector
                title={chosen?.name ?? null}
                kind={chosen?.path.endsWith(".wal") ? "Texture" : "File"}
                empty={<p className="type-body-sm text-muted-foreground">Choose a file to see what it is.</p>}
                selectionKey={file ?? undefined}
              >
                {chosen?.path.endsWith(".wal") && (
                  <PixelImage label={chosen.name} width={32} height={32} rgba={brick} zoom={4} />
                )}
                <InspectorSection id="facts" title="Facts">
                  <PropertyList
                    items={[
                      { term: "Path", value: chosen?.path },
                      { term: "Size", value: chosen?.size?.toLocaleString("en-US"), unit: "bytes" },
                    ]}
                  />
                </InspectorSection>
              </Inspector>
            </Pane>
          </Split>
          <Pane id="console" name="Console" size={200} min={140} collapsible>
            <Console
              label="Explorer console"
              lines={lines}
              lineHeight={24}
              height={90}
              onCommand={(text) =>
                setLines((l) => [
                  ...l,
                  { id: l.length + 1, level: "echo", text },
                  { id: l.length + 2, text: `ran ${text}` },
                ])
              }
            />
          </Pane>
        </Split>
      </Workspace>
      <Button className="sr-only" onPress={() => ws.reset()}>
        Reset layout
      </Button>
    </div>
  );
}
