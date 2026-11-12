import { beforeEach, describe, expect, it } from "vitest";
import { act, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { EmptyState, Input, Inspector, InspectorSection, NumberField, PropertyList, PropertyRow } from "../../src";
import { renderWithStrata } from "../../src/testing";

const KEY = "test-inspector";
beforeEach(() => window.localStorage.clear());

function Panel({ title = "Moonbeam bowl", selectionKey = "p1", storageKey = KEY }: { title?: string | null; selectionKey?: string; storageKey?: string }) {
  return (
    <Inspector title={title} kind="Piece" selectionKey={selectionKey} storageKey={storageKey} empty={<EmptyState title="Nothing selected">Select a piece to see its glaze and firing.</EmptyState>}>
      <InspectorSection id="glaze" title="Glaze">
        <PropertyRow label="Glaze name"><Input defaultValue="Celadon" /></PropertyRow>
      </InspectorSection>
      <InspectorSection id="firing" title="Firing" defaultOpen={false}>
        <PropertyRow label="Cone"><Input defaultValue="6" /></PropertyRow>
      </InspectorSection>
    </Inspector>
  );
}

describe("Inspector", () => {
  it("is a region named by the selection's heading, and teaches the next action when nothing is selected", () => {
    const { rerender } = renderWithStrata(<Panel />);
    const region = screen.getByRole("complementary", { name: "Moonbeam bowl" });
    expect(within(region).getByRole("heading", { level: 2, name: "Moonbeam bowl" })).toBeInTheDocument();
    rerender(<Panel title={null} />);
    expect(screen.getByRole("complementary", { name: "Properties" })).toBeInTheDocument();
    expect(screen.getByText("Select a piece to see its glaze and firing.")).toBeInTheDocument();
    expect(screen.queryByRole("heading", { level: 2 })).not.toBeInTheDocument();
  });

  it("does not mount a closed section's body, and restores it on opening", async () => {
    const user = userEvent.setup();
    renderWithStrata(<Panel />);
    const firing = screen.getByRole("button", { name: "Firing" });
    expect(firing).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByRole("textbox", { name: "Cone" })).not.toBeInTheDocument();
    expect(screen.getByRole("textbox", { name: "Glaze name" })).toBeInTheDocument();
    await user.click(firing);
    expect(screen.getByRole("textbox", { name: "Cone" })).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Glaze" }));
    expect(screen.queryByRole("textbox", { name: "Glaze name" })).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Glaze" }));
    expect(screen.getByRole("textbox", { name: "Glaze name" })).toBeInTheDocument();
  });

  it("remembers which sections the person opened or closed between visits", async () => {
    const user = userEvent.setup();
    const first = renderWithStrata(<Panel />);
    await user.click(screen.getByRole("button", { name: "Firing" }));
    await user.click(screen.getByRole("button", { name: "Glaze" }));
    first.unmount();
    renderWithStrata(<Panel />);
    expect(screen.getByRole("button", { name: "Firing" })).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByRole("button", { name: "Glaze" })).toHaveAttribute("aria-expanded", "false");
  });

  it("falls back to the defaults when storage holds nonsense or throws", () => {
    window.localStorage.setItem(KEY, "{not json");
    renderWithStrata(<Panel />);
    expect(screen.getByRole("button", { name: "Glaze" })).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByRole("button", { name: "Firing" })).toHaveAttribute("aria-expanded", "false");
  });

  it("gives a new selection fresh controls instead of the last item's typed text", async () => {
    const user = userEvent.setup();
    const { rerender } = renderWithStrata(<Panel />);
    const input = screen.getByRole("textbox", { name: "Glaze name" });
    await user.clear(input);
    await user.type(input, "Tenmoku");
    rerender(<Panel title="Tea jar" selectionKey="p2" />);
    expect(screen.getByRole("textbox", { name: "Glaze name" })).toHaveValue("Celadon");
  });

  it("moves focus to the heading when the focused control leaves with the selection", async () => {
    const user = userEvent.setup();
    const { rerender } = renderWithStrata(<Panel />);
    await user.click(screen.getByRole("textbox", { name: "Glaze name" }));
    await act(async () => rerender(<Panel title="Tea jar" selectionKey="p2" />));
    expect(screen.getByRole("heading", { level: 2, name: "Tea jar" })).toHaveFocus();
  });

  it("leaves focus alone when it was not in the panel", async () => {
    const user = userEvent.setup();
    const { rerender } = renderWithStrata(
      <>
        <button>Outside</button>
        <Panel />
      </>,
    );
    await user.click(screen.getByRole("button", { name: "Outside" }));
    rerender(
      <>
        <button>Outside</button>
        <Panel title="Tea jar" selectionKey="p2" />
      </>,
    );
    expect(screen.getByRole("button", { name: "Outside" })).toHaveFocus();
  });
});

describe("InspectorSection", () => {
  it("works outside an Inspector, with actions beside the toggle and not inside it", async () => {
    const user = userEvent.setup();
    renderWithStrata(
      <InspectorSection id="tracks" title="Extra tracks" actions={<button>Add track</button>}>
        <p>Two tracks</p>
      </InspectorSection>,
    );
    const toggle = screen.getByRole("button", { name: "Extra tracks" });
    expect(within(toggle).queryByRole("button")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Add track" })).toBeInTheDocument();
    await user.click(toggle);
    expect(screen.queryByText("Two tracks")).not.toBeInTheDocument();
  });

  it("opens and closes from the keyboard", async () => {
    const user = userEvent.setup();
    renderWithStrata(<Panel />);
    await user.tab();
    await user.keyboard("{Enter}");
    expect(screen.getByRole("button", { name: "Glaze" })).toHaveAttribute("aria-expanded", "false");
    await user.keyboard(" ");
    expect(screen.getByRole("button", { name: "Glaze" })).toHaveAttribute("aria-expanded", "true");
  });
});

describe("PropertyRow", () => {
  function Row({ value, onReset }: { value: number | null; onReset: () => void }) {
    return (
      <PropertyRow label="Volume" hint="Up to 500%." modified={value !== 100} onReset={onReset}>
        <NumberField value={value} onChange={() => {}} min={0} max={500} unit="%" />
      </PropertyRow>
    );
  }

  it("labels its control and shows a named Reset only while the value differs from the default", async () => {
    const user = userEvent.setup();
    let reset = 0;
    const { rerender } = renderWithStrata(<Row value={100} onReset={() => reset++} />);
    expect(screen.getByRole("textbox", { name: "Volume" })).toHaveAccessibleDescription(/Up to 500%/);
    expect(screen.queryByRole("button", { name: "Reset volume" })).not.toBeInTheDocument();
    rerender(<Row value={150} onReset={() => reset++} />);
    await user.click(screen.getByRole("button", { name: "Reset volume" }));
    expect(reset).toBe(1);
  });

  it("explains a refused value under the row, from the control", async () => {
    const user = userEvent.setup();
    renderWithStrata(<Row value={100} onReset={() => {}} />);
    const input = screen.getByRole("textbox", { name: "Volume" });
    await user.clear(input);
    await user.type(input, "900");
    await user.tab();
    expect(input).toBeInvalid();
    expect(screen.getByText(/Enter a value from/)).toBeInTheDocument();
  });
});

describe("PropertyList", () => {
  it("is a description list: terms with their values", () => {
    renderWithStrata(
      <PropertyList
        label="Video details"
        items={[
          { term: "Container", value: "MP4" },
          { term: "Frame rate", value: "29.97", unit: "fps" },
          { term: "Created", value: null },
        ]}
      />,
    );
    // jsdom's role map has no description-list role, so check the structure a browser exposes as one.
    const list = screen.getByLabelText("Video details");
    expect(list.tagName).toBe("DL");
    expect([...list.querySelectorAll("dt")].map((t) => t.textContent)).toEqual(["Container", "Frame rate", "Created"]);
    expect([...list.querySelectorAll("dd")].map((d) => d.textContent)).toEqual(["MP4", "29.97\u00a0fps", "–Not known"]);
  });

  it("prints a missing value as an en dash that a screen reader hears as not known", () => {
    const { container } = renderWithStrata(<PropertyList items={[{ term: "Created", value: undefined }, { term: "Codec", value: "" }]} />);
    const dds = container.querySelectorAll("dd");
    expect(dds[0]).toHaveTextContent("–Not known");
    expect(dds[0].querySelector("[aria-hidden]")).toHaveTextContent("–");
    expect(dds[1]).toHaveTextContent("–");
  });

  it("joins a unit with a non-breaking space and keeps the whole of a long value available", () => {
    const long = "run-02-final-cut-with-a-very-long-descriptive-file-name-for-the-festival-submission.mp4";
    const { container } = renderWithStrata(
      <PropertyList
        items={[
          { term: "Frame rate", value: "29.97", unit: "fps" },
          { term: "File", value: long },
        ]}
      />,
    );
    expect(container.querySelectorAll("dd")[0].textContent).toBe("29.97 fps");
    expect(container.querySelector(`[title="${long}"]`)).toHaveClass("truncate");
    expect(container.querySelectorAll("dt")[1]).toHaveTextContent("File");
  });
});
