import { beforeEach, describe, expect, it } from "vitest";
import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ViewOptions, sortRows, useViewOptions, type ViewOptionsConfig } from "../../src";
import { renderWithStrata } from "../../src/testing";

type P = { name: string; taken: string | null; hour: string };
const rows: P[] = [
  { name: "IMG_10", taken: "2019-03-02", hour: "09:00" },
  { name: "IMG_2", taken: "2019-03-01", hour: "08:00" },
  { name: "IMG_1", taken: null, hour: "08:00" },
  { name: "IMG_3", taken: "2019-03-03", hour: "09:00" },
];
const config = (extra: Partial<ViewOptionsConfig<P>> = {}): ViewOptionsConfig<P> => ({
  id: "t",
  sorts: [
    { key: "name", label: "Name", value: (r) => r.name },
    { key: "taken", label: "Date taken", value: (r) => r.taken, directions: ["Oldest first", "Newest first"] },
  ],
  groups: [{ key: "hour", label: "Hour", of: (r) => r.hour }],
  size: { min: 96, max: 240, step: 12, default: 144 },
  aspects: ["square", "landscape"],
  layouts: true,
  filterText: (r) => r.name,
  ...extra,
});

function Host({ cfg, onRows }: { cfg: ViewOptionsConfig<P>; onRows?: (r: P[]) => void }) {
  const view = useViewOptions(cfg);
  const shown = view.apply(rows);
  onRows?.(shown);
  return (
    <>
      <ViewOptions view={view} shown={shown.length} total={rows.length} />
      <ul>{shown.map((r) => <li key={r.name}>{r.name}</li>)}</ul>
      <p data-testid="size">{view.size}</p>
      <p data-testid="groups">{view.grouped(shown).map((g) => `${g.heading}:${g.rows.length}`).join(",")}</p>
    </>
  );
}
const names = () => screen.getAllByRole("listitem").map((e) => e.textContent);

beforeEach(() => localStorage.clear());

describe("sortRows", () => {
  it("is natural for strings, puts null last either way and is stable", () => {
    expect(sortRows(rows, (r) => r.name).map((r) => r.name)).toEqual(["IMG_1", "IMG_2", "IMG_3", "IMG_10"]);
    expect(sortRows(rows, (r) => r.taken).map((r) => r.name)).toEqual(["IMG_2", "IMG_10", "IMG_3", "IMG_1"]);
    expect(sortRows(rows, (r) => r.taken, true).map((r) => r.name)).toEqual(["IMG_3", "IMG_10", "IMG_2", "IMG_1"]);
  });
});

describe("ViewOptions", () => {
  it("sorts, names the direction for the key, and reverses", async () => {
    const user = userEvent.setup();
    renderWithStrata(<Host cfg={config()} />);
    expect(names()).toEqual(["IMG_1", "IMG_2", "IMG_3", "IMG_10"]);
    await user.selectOptions(screen.getByRole("combobox", { name: "Sort by" }), "taken");
    expect(names()).toEqual(["IMG_2", "IMG_10", "IMG_3", "IMG_1"]);
    await user.click(screen.getByRole("button", { name: "Oldest first" }));
    expect(names()).toEqual(["IMG_3", "IMG_10", "IMG_2", "IMG_1"]);
    expect(screen.getByRole("button", { name: "Newest first" })).toBeInTheDocument();
  });

  it("filters and says how many: 3 of 4", async () => {
    const user = userEvent.setup();
    renderWithStrata(<Host cfg={config()} />);
    expect(screen.getByRole("status")).toHaveTextContent("4");
    await user.type(screen.getByRole("searchbox", { name: "Filter" }), "img_1");
    expect(names()).toEqual(["IMG_1", "IMG_10"]);
    expect(screen.getByRole("status")).toHaveTextContent("2 of 4");
  });

  it("groups in the order the sorted rows first show them", async () => {
    const user = userEvent.setup();
    renderWithStrata(<Host cfg={config()} />);
    expect(screen.getByTestId("groups")).toHaveTextContent(":4");
    await user.selectOptions(screen.getByRole("combobox", { name: "Group by" }), "hour");
    expect(screen.getByTestId("groups")).toHaveTextContent("08:00:2,09:00:2");
  });

  it("moves the size with the keys, clamps it, and remembers it", async () => {
    const user = userEvent.setup();
    const { unmount } = renderWithStrata(<Host cfg={config()} />);
    screen.getByRole("slider", { name: "Tile size" }).focus();
    await user.keyboard("+");
    expect(screen.getByTestId("size")).toHaveTextContent("156");
    await user.keyboard("{Home}-");
    expect(screen.getByTestId("size")).toHaveTextContent("96");
    await user.keyboard("{End}");
    expect(screen.getByTestId("size")).toHaveTextContent("240");
    unmount();
    renderWithStrata(<Host cfg={config()} />);
    expect(screen.getByTestId("size")).toHaveTextContent("240");
  });

  it("works when storage is blocked", () => {
    const real = Storage.prototype.getItem;
    Storage.prototype.getItem = () => {
      throw new Error("blocked");
    };
    try {
      renderWithStrata(<Host cfg={config()} />);
      expect(names()).toHaveLength(4);
    } finally {
      Storage.prototype.getItem = real;
    }
  });

  it("reads and writes the address: ?sort=taken-desc&group=hour&size=180", async () => {
    const user = userEvent.setup();
    renderWithStrata(<Host cfg={config({ url: true })} />, { route: "/?sort=taken-desc&group=hour&size=180" });
    expect(names()).toEqual(["IMG_3", "IMG_10", "IMG_2", "IMG_1"]);
    expect(screen.getByTestId("size")).toHaveTextContent("180");
    expect(screen.getByTestId("groups")).toHaveTextContent("09:00:2,08:00:2");
    await user.selectOptions(screen.getByRole("combobox", { name: "Sort by" }), "name");
    expect(names()).toEqual(["IMG_1", "IMG_2", "IMG_3", "IMG_10"]);
  });
});
