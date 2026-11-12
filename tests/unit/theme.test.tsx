import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { act, render, screen } from "@testing-library/react";
import { renderToString } from "react-dom/server";
import { hydrateRoot } from "react-dom/client";
import userEvent from "@testing-library/user-event";
import * as React from "react";
import { COLOR_SCHEME_STORAGE_KEY, ColorSchemeChoice, ThemeProvider, colorSchemeScript, useColorScheme } from "../../src";
import { renderWithStrata } from "../../src/testing";

// jsdom has no matchMedia. This stands in for the operating system's setting the way the layout
// shims in tests/utils/setup.ts stand in for layout: a browser API jsdom lacks, not a module mock.
class FakeSystem {
  dark = false;
  listeners = new Set<() => void>();
  install() {
    window.matchMedia = ((query: string) => ({
      media: query,
      get matches() {
        return system.dark;
      },
      addEventListener: (_: string, fn: () => void) => system.listeners.add(fn),
      removeEventListener: (_: string, fn: () => void) => system.listeners.delete(fn),
    })) as unknown as typeof window.matchMedia;
  }
  set(dark: boolean) {
    this.dark = dark;
    for (const fn of this.listeners) fn();
  }
}
const system = new FakeSystem();
const isDark = () => document.documentElement.classList.contains("dark");

function Readout() {
  const { preference, scheme } = useColorScheme();
  return <p>{`${preference} ${scheme}`}</p>;
}

beforeEach(() => {
  system.dark = false;
  system.listeners.clear();
  system.install();
  window.localStorage.clear();
});
afterEach(() => {
  // @ts-expect-error jsdom has none; remove the stand-in
  delete window.matchMedia;
});

describe("ThemeProvider", () => {
  it("follows the system by default, and keeps following it", () => {
    render(
      <ThemeProvider>
        <Readout />
      </ThemeProvider>,
    );
    expect(screen.getByText("system light")).toBeInTheDocument();
    expect(isDark()).toBe(false);
    act(() => system.set(true));
    expect(screen.getByText("system dark")).toBeInTheDocument();
    expect(isDark()).toBe(true);
  });

  it("persists a chosen scheme and restores it on the next visit", async () => {
    const user = userEvent.setup();
    const { unmount } = render(
      <ThemeProvider>
        <ColorSchemeChoice />
        <Readout />
      </ThemeProvider>,
    );
    const group = screen.getByRole("radiogroup", { name: "Theme" });
    expect(screen.getByRole("radio", { name: /Match this device/ })).toBeChecked();
    await user.click(screen.getByRole("radio", { name: "Dark" }));
    expect(group).toBeInTheDocument();
    expect(isDark()).toBe(true);
    expect(window.localStorage.getItem(COLOR_SCHEME_STORAGE_KEY)).toBe("dark");
    unmount();
    expect(isDark()).toBe(false);

    render(
      <ThemeProvider>
        <Readout />
      </ThemeProvider>,
    );
    expect(screen.getByText("dark dark")).toBeInTheDocument();
    expect(isDark()).toBe(true);
  });

  it("hydrates server markup without a mismatch, then applies the stored choice", async () => {
    window.localStorage.setItem(COLOR_SCHEME_STORAGE_KEY, "dark");
    const ui = (
      <ThemeProvider>
        <Readout />
      </ThemeProvider>
    );
    const container = document.createElement("div");
    container.innerHTML = renderToString(ui);
    document.body.append(container);
    expect(container.textContent).toBe("system light");
    const errors: unknown[] = [];
    let root: ReturnType<typeof hydrateRoot> | undefined;
    await act(async () => {
      root = hydrateRoot(container, ui, { onRecoverableError: (e) => errors.push(e) });
    });
    expect(errors).toEqual([]);
    expect(container.textContent).toBe("dark dark");
    expect(isDark()).toBe(true);
    act(() => root!.unmount());
    container.remove();
  });

  it("an explicit light choice wins over a dark system", () => {
    system.dark = true;
    window.localStorage.setItem(COLOR_SCHEME_STORAGE_KEY, "light");
    render(
      <ThemeProvider>
        <Readout />
      </ThemeProvider>,
    );
    expect(screen.getByText("light light")).toBeInTheDocument();
    expect(isDark()).toBe(false);
  });

  it("ignores a stored value that is not a preference", () => {
    window.localStorage.setItem(COLOR_SCHEME_STORAGE_KEY, "sepia");
    render(
      <ThemeProvider defaultPreference="dark">
        <Readout />
      </ThemeProvider>,
    );
    expect(screen.getByText("dark dark")).toBeInTheDocument();
  });

  it("still works when storage throws", async () => {
    const user = userEvent.setup();
    const original = Object.getOwnPropertyDescriptor(window, "localStorage")!;
    Object.defineProperty(window, "localStorage", {
      configurable: true,
      get() {
        throw new DOMException("The operation is insecure.", "SecurityError");
      },
    });
    try {
      render(
        <ThemeProvider>
          <ColorSchemeChoice />
          <Readout />
        </ThemeProvider>,
      );
      await user.click(screen.getByRole("radio", { name: "Dark" }));
      expect(screen.getByText("dark dark")).toBeInTheDocument();
      expect(isDark()).toBe(true);
    } finally {
      Object.defineProperty(window, "localStorage", original);
    }
  });

  it("follows a choice made in another tab", () => {
    render(
      <ThemeProvider>
        <Readout />
      </ThemeProvider>,
    );
    act(() => {
      window.dispatchEvent(new StorageEvent("storage", { key: COLOR_SCHEME_STORAGE_KEY, newValue: "dark" }));
    });
    expect(screen.getByText("dark dark")).toBeInTheDocument();
  });

  it("sets the class on a target element instead of the root", () => {
    function Panel() {
      const [panel, setPanel] = React.useState<HTMLDivElement | null>(null);
      return (
        <div ref={setPanel} data-testid="panel">
          <ThemeProvider target={panel} defaultPreference="dark" storageKey={null}>
            <Readout />
          </ThemeProvider>
        </div>
      );
    }
    render(<Panel />);
    expect(screen.getByTestId("panel")).toHaveClass("dark");
    expect(isDark()).toBe(false);
  });

  it("useColorScheme outside a provider says so", () => {
    expect(() => render(<Readout />)).toThrow("useColorScheme must be used inside a ThemeProvider.");
  });

  it("renderWithStrata renders a chosen scheme without touching storage", () => {
    renderWithStrata(<Readout />, { colorScheme: "dark" });
    expect(screen.getByText("dark dark")).toBeInTheDocument();
    expect(isDark()).toBe(true);
    expect(window.localStorage.getItem(COLOR_SCHEME_STORAGE_KEY)).toBeNull();
  });
});

describe("colorSchemeScript", () => {
  const run = (script: string) => new Function(script)();

  it("sets dark before React from a stored choice", () => {
    window.localStorage.setItem(COLOR_SCHEME_STORAGE_KEY, "dark");
    run(colorSchemeScript());
    expect(isDark()).toBe(true);
    document.documentElement.classList.remove("dark");
  });

  it("follows the system when nothing is stored", () => {
    system.dark = true;
    run(colorSchemeScript());
    expect(isDark()).toBe(true);
    document.documentElement.classList.remove("dark");
    system.dark = false;
    run(colorSchemeScript());
    expect(isDark()).toBe(false);
  });

  it("uses the given key and default", () => {
    window.localStorage.setItem("other", "dark");
    run(colorSchemeScript("mine", "light"));
    expect(isDark()).toBe(false);
  });
});
