import { describe, expect, it, vi } from "vite-plus/test";
import * as React from "react";
import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Tree, useExpanded, type Load } from "../../src";
import { renderWithStrata } from "../../src/testing";

// Issue #364: `Expanded.toggle`, pressing a folder's row opening it instead of choosing it, and what
// `reveal` writes into the URL.

type N = { id: string; name: string; file?: boolean };
const ready = <T,>(data: T[]) =>
  ({ status: "ready", data, refreshing: false }) as unknown as Load<readonly T[]>;
const roots: N[] = [
  { id: "textures", name: "textures" },
  { id: "readme.txt", name: "readme.txt", file: true },
];
const kids = (id: string): N[] =>
  id === "textures" ? [{ id: "textures/clip.wal", name: "clip.wal", file: true }] : [];

function Host({
  onSelect,
  branchPress,
  reveal,
  param,
}: {
  onSelect: (key: string) => void;
  branchPress?: "select" | "toggle";
  reveal?: string[];
  param?: string;
}) {
  const expanded = useExpanded(param ? { param } : {});
  const [selected, setSelected] = React.useState<string | null>(null);
  return (
    <>
      <Tree<N>
        label="Files"
        roots={ready(roots)}
        useChildren={(n) => ready(kids(n.id))}
        nodeKey={(n) => n.id}
        nodeLabel={(n) => n.name}
        isBranch={(n) => !n.file}
        expanded={expanded}
        emptyRow="Empty"
        selected={selected}
        onSelect={(k) => {
          setSelected(k);
          onSelect(k);
        }}
        branchPress={branchPress}
        reveal={reveal}
      />
      <button onClick={() => expanded.toggle("textures")}>Flip textures</button>
      <output aria-label="open">{[...expanded.expanded].join(",")}</output>
    </>
  );
}
const rows = () => screen.getAllByRole("row").map((r) => r.textContent);

describe("Expanded.toggle", () => {
  it("opens a closed key and closes an open one", async () => {
    renderWithStrata(<Host onSelect={() => {}} />);
    await userEvent.click(screen.getByRole("button", { name: "Flip textures" }));
    expect(screen.getByLabelText("open")).toHaveTextContent("textures");
    expect(await screen.findByRole("row", { name: /clip\.wal/ })).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Flip textures" }));
    expect(screen.getByLabelText("open")).toHaveTextContent("");
  });
});

describe("branchPress", () => {
  it("chooses a folder like a file by default", async () => {
    const onSelect = vi.fn();
    renderWithStrata(<Host onSelect={onSelect} />);
    await userEvent.click(screen.getByRole("row", { name: /textures/ }));
    expect(onSelect).toHaveBeenCalledWith("textures");
  });

  it("with toggle, pressing a folder opens and closes it and does not choose it; a file is still chosen", async () => {
    const onSelect = vi.fn();
    renderWithStrata(<Host onSelect={onSelect} branchPress="toggle" />);
    await userEvent.click(screen.getByRole("row", { name: /textures/ }));
    expect(onSelect).not.toHaveBeenCalled();
    expect(await screen.findByRole("row", { name: /clip\.wal/ })).toBeInTheDocument();
    await userEvent.click(screen.getByRole("row", { name: /clip\.wal/ }));
    expect(onSelect).toHaveBeenLastCalledWith("textures/clip.wal");
    await userEvent.click(screen.getByRole("row", { name: /textures/ }));
    expect(rows().some((t) => t?.includes("clip.wal"))).toBe(false);
    expect(onSelect).toHaveBeenCalledTimes(1);
  });
});

describe("reveal and the URL", () => {
  it("writes the ancestors into the open param", async () => {
    renderWithStrata(
      <Host onSelect={() => {}} reveal={["textures", "textures/clip.wal"]} param="open" />,
    );
    expect(await screen.findByRole("row", { name: /clip\.wal/ })).toBeInTheDocument();
    expect(screen.getByLabelText("open")).toHaveTextContent("textures");
  });
});
