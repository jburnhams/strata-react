import { afterEach, beforeEach, describe, expect, it } from "vite-plus/test";
import { act, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import {
  PALETTE_STORAGE_KEY,
  PaletteChoice,
  ThemeProvider,
  palettes,
  paletteScript,
  usePalette,
} from "../../src";

// A palette is chosen independently of the colour scheme (2026-11-25): the provider sets `data-palette` on
// the root, keeps the choice in localStorage and follows other tabs, as it does for the scheme.

const attribute = () => document.documentElement.getAttribute("data-palette");

function Readout() {
  return <p data-testid="palette">{usePalette().palette}</p>;
}

beforeEach(() => {
  window.localStorage.clear();
  document.documentElement.removeAttribute("data-palette");
});
afterEach(() => {
  window.localStorage.clear();
  document.documentElement.removeAttribute("data-palette");
});

describe("palettes as themes", () => {
  it("sets the default palette on the root and offers every shipped palette by name", () => {
    render(
      <ThemeProvider>
        <PaletteChoice />
      </ThemeProvider>,
    );
    expect(attribute()).toBe("petrol");
    const group = screen.getByRole("radiogroup", { name: "Palette" });
    expect(group).toBeInTheDocument();
    for (const p of palettes)
      expect(screen.getByRole("radio", { name: new RegExp(p.label) })).toBeInTheDocument();
    expect(screen.getByRole("radio", { name: /Petrol and marigold/ })).toBeChecked();
  });

  it("changes the palette on the root and keeps it for the next visit", async () => {
    const user = userEvent.setup();
    const { unmount } = render(
      <ThemeProvider>
        <PaletteChoice />
        <Readout />
      </ThemeProvider>,
    );
    await user.click(screen.getByRole("radio", { name: /Pine and coral/ }));
    expect(attribute()).toBe("pine");
    expect(screen.getByTestId("palette")).toHaveTextContent("pine");
    expect(window.localStorage.getItem(PALETTE_STORAGE_KEY)).toBe("pine");
    unmount();
    expect(attribute()).toBeNull();
    render(
      <ThemeProvider>
        <Readout />
      </ThemeProvider>,
    );
    expect(screen.getByTestId("palette")).toHaveTextContent("pine");
    expect(attribute()).toBe("pine");
  });

  it("ignores a stored value that is not a palette name, and works with storage turned off", () => {
    window.localStorage.setItem(PALETTE_STORAGE_KEY, "<script>");
    render(
      <ThemeProvider defaultPalette="clay">
        <Readout />
      </ThemeProvider>,
    );
    expect(screen.getByTestId("palette")).toHaveTextContent("clay");
    expect(attribute()).toBe("clay");
  });

  it("keeps the choice for this visit only when told not to store it", async () => {
    const user = userEvent.setup();
    render(
      <ThemeProvider paletteStorageKey={null}>
        <PaletteChoice compact />
      </ThemeProvider>,
    );
    await user.click(screen.getByRole("radio", { name: "Cobalt and tangerine" }));
    expect(attribute()).toBe("cobalt");
    expect(window.localStorage.getItem(PALETTE_STORAGE_KEY)).toBeNull();
  });

  it("names every swatch in the compact form, and a group 'Palette'", () => {
    render(
      <ThemeProvider>
        <PaletteChoice compact />
      </ThemeProvider>,
    );
    expect(screen.getByRole("radiogroup", { name: "Palette" })).toBeInTheDocument();
    for (const p of palettes)
      expect(screen.getByRole("radio", { name: p.label })).toBeInTheDocument();
  });

  it("follows another tab changing the palette", () => {
    render(
      <ThemeProvider>
        <Readout />
      </ThemeProvider>,
    );
    act(() => {
      window.dispatchEvent(
        new StorageEvent("storage", { key: PALETTE_STORAGE_KEY, newValue: "steel" }),
      );
    });
    expect(screen.getByTestId("palette")).toHaveTextContent("steel");
    expect(attribute()).toBe("steel");
  });

  it("paletteScript sets the stored palette before the bundle runs, and falls back to the default", () => {
    window.localStorage.setItem(PALETTE_STORAGE_KEY, "clay");
    new Function(paletteScript())();
    expect(attribute()).toBe("clay");
    window.localStorage.setItem(PALETTE_STORAGE_KEY, "Not A Name");
    new Function(paletteScript())();
    expect(attribute()).toBe("petrol");
  });

  it("refuses usePalette outside a ThemeProvider", () => {
    const spy = () => render(<Readout />);
    expect(spy).toThrow(/ThemeProvider/);
  });
});
