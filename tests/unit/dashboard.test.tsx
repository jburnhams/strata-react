import { describe, expect, it } from "vitest";
import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useLocation } from "react-router";
import { ColorSchemeChoice, CompositionBar, LinkCard, LinkCardList, Meter, Status, crossedThreshold, format, useColorScheme } from "../../src";
import { renderWithStrata } from "../../src/testing";
import { server } from "../utils/server";
import { http, HttpResponse } from "msw";
import { api, serverUnreachable } from "../../stories/mocks/handlers";
import { diskThresholds } from "../../stories/fixtures/server";
import { StudioServerScreen } from "../../stories/screens/studio-server";

describe("Meter", () => {
  it("is a meter named for what it measures, with the reading in words", () => {
    renderWithStrata(<Meter label="Disk /" value={18} max={64} />);
    const meter = screen.getByRole("meter", { name: "Disk /" });
    expect(meter).toHaveAttribute("aria-valuenow", "18");
    expect(meter).toHaveAttribute("aria-valuemax", "64");
    expect(meter).toHaveAttribute("aria-valuetext", "28% used");
    expect(meter).not.toHaveAttribute("aria-describedby");
  });

  it("says a crossed threshold as a status word and describes the meter with it", () => {
    renderWithStrata(<Meter label="/srv/photos" value={431} max={466} thresholds={diskThresholds} detail="431 GB of 466 GB" />);
    const meter = screen.getByRole("meter", { name: "/srv/photos" });
    expect(meter).toHaveAccessibleDescription("Nearly full 431 GB of 466 GB");
    expect(screen.getByText("Nearly full")).toHaveClass("text-danger");
  });

  it("shows no status word below every threshold", () => {
    renderWithStrata(<Meter label="/" value={0.3} thresholds={diskThresholds} />);
    expect(screen.queryByText("Filling up")).toBeNull();
    expect(screen.queryByText("Nearly full")).toBeNull();
  });

  it("keeps the label as the accessible name with hideLabel, and uses the caller's value text", () => {
    renderWithStrata(<Meter label="Shelves booked" hideLabel value={0.625} valueText="10 of 16 booked" />);
    expect(screen.getByRole("meter", { name: "Shelves booked" })).toHaveAttribute("aria-valuetext", "10 of 16 booked");
    expect(screen.queryByText("Shelves booked")).toBeNull();
  });

  it("clamps a reading past the scale", () => {
    renderWithStrata(<Meter label="Quota" value={12} max={10} />);
    expect(screen.getByRole("meter")).toHaveAttribute("aria-valuetext", "100% used");
  });
});

describe("crossedThreshold", () => {
  it("picks the most severe threshold reached", () => {
    expect(crossedThreshold(0.5, diskThresholds)).toBeUndefined();
    expect(crossedThreshold(0.8, diskThresholds)?.label).toBe("Filling up");
    expect(crossedThreshold(0.95, diskThresholds)?.label).toBe("Nearly full");
  });

  it("turns round when lower is worse", () => {
    const battery = [
      { at: 0.3, tone: "warning", label: "Order a battery" },
      { at: 0.1, tone: "danger", label: "Replace now" },
    ] as const;
    expect(crossedThreshold(0.5, [...battery], "lower")).toBeUndefined();
    expect(crossedThreshold(0.2, [...battery], "lower")?.label).toBe("Order a battery");
    expect(crossedThreshold(0.05, [...battery], "lower")?.label).toBe("Replace now");
  });
});

describe("CompositionBar", () => {
  const parts = [
    { key: "used", label: "Used by apps", value: 4 },
    { key: "cached", label: "Cached files", value: 6 },
  ];

  it("names every part with its amount and share in a table, in the order given", () => {
    renderWithStrata(<CompositionBar label="Memory" parts={parts} formatValue={(v) => `${v} GB`} />);
    const table = screen.getByRole("table", { name: "Memory" });
    const rows = within(table).getAllByRole("row").slice(1);
    expect(rows.map((r) => r.textContent)).toEqual(["Used by apps4 GB40%", "Cached files6 GB60%"]);
    expect(within(table).getByRole("rowheader", { name: "Used by apps" })).toBeInTheDocument();
    expect(within(table).getByRole("columnheader", { name: "Share" })).toBeInTheDocument();
  });

  it("names the remainder when the parts do not fill the total", () => {
    renderWithStrata(<CompositionBar label="Memory" parts={parts} total={16} restLabel="Free" formatValue={(v) => `${v} GB`} />);
    const free = screen.getByRole("rowheader", { name: "Free" }).closest("tr")!;
    expect(free).toHaveTextContent("6 GB38%");
  });

  it("asks for a colour, or an Other part, past the fifth chart token", () => {
    const six = Array.from({ length: 6 }, (_, i) => ({ key: `p${i}`, label: `Part ${i + 1}`, value: 1 }));
    expect(() => renderWithStrata(<CompositionBar label="Too many" parts={six} formatValue={String} />)).toThrow(/Other/);
    six[5] = { ...six[5], colour: "var(--muted-foreground)" } as (typeof six)[number];
    renderWithStrata(<CompositionBar label="Six" parts={six} formatValue={String} />);
    expect(screen.getByRole("table", { name: "Six" })).toBeInTheDocument();
  });

  it("fills the track with fractional values (flex factors are shares)", () => {
    const { container } = renderWithStrata(
      <CompositionBar label="Split" parts={[{ key: "a", label: "A", value: 0.2 }, { key: "b", label: "B", value: 0.3 }]} formatValue={String} />,
    );
    const segments = [...container.querySelectorAll<HTMLElement>("figure > [aria-hidden] > div")];
    expect(segments.map((el) => el.style.flexGrow)).toEqual(["0.4", "0.6"]);
  });

  it("copes with a whole of nothing", () => {
    renderWithStrata(<CompositionBar label="Nothing" parts={[{ key: "a", label: "A", value: 0 }]} formatValue={String} />);
    expect(screen.getByRole("rowheader", { name: "A" }).closest("tr")).toHaveTextContent("A00%");
  });
});

describe("LinkCard", () => {
  it("is one link named by its title and described by the rest", async () => {
    function Where() {
      return <output data-testid="path">{useLocation().pathname}</output>;
    }
    renderWithStrata(
      <>
        <LinkCard to="/bookings" title="Kiln bookings" description="Book shelves." marks={<Status tone="success">Running</Status>} />
        <Where />
      </>,
    );
    const link = screen.getByRole("link", { name: "Kiln bookings" });
    expect(link).toHaveAccessibleDescription("Book shelves. Running");
    expect(screen.getAllByRole("link")).toHaveLength(1);
    expect(screen.getByRole("heading", { level: 3, name: "Kiln bookings" })).toBeInTheDocument();
    await userEvent.click(link);
    expect(screen.getByTestId("path")).toHaveTextContent("/bookings");
  });

  it("is a plain link with href", () => {
    renderWithStrata(<LinkCard href="https://glazes.example" title="Glaze library" as="h2" />);
    const link = screen.getByRole("link", { name: "Glaze library" });
    expect(link).toHaveAttribute("href", "https://glazes.example");
    expect(link).not.toHaveAttribute("aria-describedby");
    expect(screen.getByRole("heading", { level: 2 })).toBeInTheDocument();
  });

  it("lists cards as items of a named list", () => {
    renderWithStrata(
      <LinkCardList label="Apps">
        <LinkCard to="/a" title="A" />
        <LinkCard to="/b" title="B" />
      </LinkCardList>,
    );
    expect(within(screen.getByRole("list", { name: "Apps" })).getAllByRole("listitem")).toHaveLength(2);
  });
});

describe("ColorSchemeChoice compact", () => {
  function Readout() {
    const { preference } = useColorScheme();
    return <p data-testid="pref">{preference}</p>;
  }

  it("is a radio group named Appearance, with each segment named in words", async () => {
    renderWithStrata(
      <>
        <ColorSchemeChoice compact />
        <Readout />
      </>,
    );
    const group = screen.getByRole("radiogroup", { name: "Appearance" });
    const radios = within(group).getAllByRole("radio");
    expect(radios.map((r) => r.getAttribute("aria-label"))).toEqual(["Match this device", "Light", "Dark"]);
    await userEvent.click(within(group).getByRole("radio", { name: "Dark" }));
    expect(screen.getByTestId("pref")).toHaveTextContent("dark");
    expect(within(group).getByRole("radio", { name: "Dark" })).toBeChecked();
    expect(document.documentElement).toHaveClass("dark");
  });

  it("takes the product's words and legend", () => {
    renderWithStrata(<ColorSchemeChoice compact legend="Screens" labels={{ dark: { label: "Night" } }} />);
    expect(within(screen.getByRole("radiogroup", { name: "Screens" })).getByRole("radio", { name: "Night" })).toBeInTheDocument();
  });

  it("keeps the settings-page list when not compact", () => {
    renderWithStrata(<ColorSchemeChoice />);
    expect(screen.getByRole("group", { name: "Theme" })).toBeInTheDocument();
  });
});

describe("Studio server screen (served by MSW)", () => {
  it("leads with the disk past its threshold, then apps, disks and memory", async () => {
    renderWithStrata(<StudioServerScreen />);
    expect(await screen.findByText(/\/srv\/photos \(glaze test photos\) is 92% full/)).toBeInTheDocument();
    expect(screen.getAllByRole("link")).toHaveLength(4);
    expect(screen.getByRole("meter", { name: "/srv/photos space used" })).toHaveAccessibleDescription(/Nearly full/);
    expect(screen.getByRole("meter", { name: "/ space used" })).toHaveAccessibleDescription(`${format.bytes(18.4e9)} of ${format.bytes(64e9)}`);
    expect(screen.getByRole("table", { name: /16\sGB in all/ })).toBeInTheDocument();
    expect(screen.getByRole("radiogroup", { name: "Appearance" })).toBeInTheDocument();
  });

  it("shows the empty state when the agent reports nothing", async () => {
    server.use(http.get(api.server, () => HttpResponse.json({ disks: [], apps: [], memory: { total: 0, used: 0, cached: 0, buffers: 0 } })));
    renderWithStrata(<StudioServerScreen />);
    expect(await screen.findByText("The status agent has nothing to report")).toBeInTheDocument();
  });

  it("says when the status agent cannot be reached", async () => {
    server.use(serverUnreachable);
    renderWithStrata(<StudioServerScreen />);
    expect(await screen.findByRole("alert")).toHaveTextContent("502");
  });
});
