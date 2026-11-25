import * as React from "react";
import { useDensityOn, type DensityName } from "./density";
import { Radio, RadioGroup } from "react-aria-components";
import { Tooltip } from "./tooltip";
import { Monitor, Moon, Sun } from "lucide-react";
import type { IconComponent } from "../lib/icon";
import { cn } from "../lib/utils";
import { ChoiceGroup } from "./field";

// strata.css keys dark mode on a `.dark` ancestor (`@custom-variant dark (&:is(.dark *))`) and
// gives `.dark` its `color-scheme`, but nothing in the library set the class, so every app wrote
// the same matchMedia listener by hand (strata-listory did, in web/src/main.tsx). This is that
// listener, once:
// - Three choices, not two. "system" follows the operating system and keeps following it when it
//   changes at dusk; "light" and "dark" are a person's override. A toggle with only light and dark
//   loses the system setting the first time it is pressed.
// - The choice persists in localStorage, read and written inside try/catch. Storage throws in
//   private windows, with blocked site data and in sandboxed frames; the theme then simply does
//   not persist, and the page still renders. A stored value that is not one of the three is
//   ignored.
// - Another tab changing the choice changes this one too (the `storage` event).
// - The first render uses the default preference, as a server render would, and the stored choice
//   is applied in a layout effect, so server-rendered markup hydrates cleanly and nothing paints
//   with the wrong scheme (found in review).
// - The class is set in a layout effect, before paint. A page that must not flash light on first
//   load before React runs puts `colorSchemeScript()` in an inline script in its `<head>`.
// - `ColorSchemeChoice` is the picker for a settings page: a `ChoiceGroup` of the three, with
//   "Match this device" first because it is the default and the one most people should keep. A
//   product that wants the choice elsewhere (a menu item, a header button) builds it from
//   `useColorScheme`. Changing theme is rare, so the picker has no motion and no icon flourish.
// - `compact` is the same choice for an app with no settings page (a homepage, a single-page
//   tool), sized to sit in a header or footer: three segments with an icon each, named
//   "Appearance" (strata-react issue #25). They are still native radio buttons, so arrow keys move
//   the choice and a screen reader hears "Match this device, radio button, 1 of 3, Appearance".
//   Each segment is named by `aria-label` on its radio and shows the same words as a tooltip; the
//   icons are the familiar three (screen, sun, moon), and none of them is a toggle that loses the
//   system setting. The visible words are left out only because the icons are that well known.
// - A palette is chosen independently of the scheme (2026-11-25, Jonathan: "palettes as themes alongside
//   dark mode, each app an easy toggle"). The provider sets `data-palette` on the same element as `.dark`;
//   strata.css has a light and a dark block per palette keyed on it (`src/styles/palettes.css`), and the
//   default palette is the plain :root, so no attribute and `"petrol"` are the same. The palette persists
//   under its own key like the scheme does, with the same safeguards (storage in try/catch, a stored
//   value that is not a palette name is ignored, other tabs follow). `PaletteChoice` is the picker: each
//   option carries a swatch drawn in its own palette by scoping `data-palette` on the swatch, so a person
//   sees the colours before choosing; a swatch is never the only name, the words are always there.
// - Storybook's decorator and `renderWithStrata({ colorScheme })` run through this provider, so
//   stories and tests see the same class, in the same place, as an app.

/** What a person chose: follow the operating system, or a fixed light or dark theme. */
export type ColorSchemePreference = "system" | "light" | "dark";
/** The scheme in effect after "system" is resolved. */
export type ColorScheme = "light" | "dark";

/** The localStorage key `ThemeProvider` uses unless given another. */
export const COLOR_SCHEME_STORAGE_KEY = "strata-color-scheme";

const QUERY = "(prefers-color-scheme: dark)";
const PREFERENCES: readonly ColorSchemePreference[] = ["system", "light", "dark"];

/** A palette Strata ships: its name (the `data-palette` value) and the words `PaletteChoice` shows. */
export type PaletteOption = { name: string; label: string; detail?: string };

/** The palettes in `strata.css`: the default first, then four others. An app that adds its own in CSS passes its own list to `PaletteChoice`. */
export const palettes: readonly PaletteOption[] = [
  { name: "petrol", label: "Petrol and marigold", detail: "The default" },
  { name: "pine", label: "Pine and coral" },
  { name: "cobalt", label: "Cobalt and tangerine" },
  { name: "steel", label: "Steel and mint" },
  { name: "clay", label: "Clay and teal" },
];

/** The default palette: the plain `:root` look, with no override. */
export const DEFAULT_PALETTE = "petrol";

/** The localStorage key `ThemeProvider` keeps the palette under unless given another. */
export const PALETTE_STORAGE_KEY = "strata-palette";

const PALETTE_NAME = /^[a-z][a-z0-9-]{0,31}$/;

function isPalette(value: unknown): value is string {
  return typeof value === "string" && PALETTE_NAME.test(value);
}

function readStoredPalette(key: string | null): string | null {
  if (key === null) return null;
  try {
    const value = window.localStorage.getItem(key);
    return isPalette(value) ? value : null;
  } catch {
    return null;
  }
}

function writeStoredPalette(key: string | null, value: string) {
  if (key === null) return;
  try {
    window.localStorage.setItem(key, value);
  } catch {
    // Storage unavailable: the palette lasts this visit only.
  }
}

function isPreference(value: unknown): value is ColorSchemePreference {
  return typeof value === "string" && (PREFERENCES as readonly string[]).includes(value);
}

function readStored(key: string | null): ColorSchemePreference | null {
  if (key === null) return null;
  try {
    const value = window.localStorage.getItem(key);
    return isPreference(value) ? value : null;
  } catch {
    return null;
  }
}

function writeStored(key: string | null, value: ColorSchemePreference) {
  if (key === null) return;
  try {
    window.localStorage.setItem(key, value);
  } catch {
    // Storage unavailable (private window, blocked site data): the choice lasts this visit only.
  }
}

function media(): MediaQueryList | null {
  return typeof window !== "undefined" && typeof window.matchMedia === "function" ? window.matchMedia(QUERY) : null;
}

function subscribeSystem(onChange: () => void) {
  const list = media();
  if (!list) return () => undefined;
  list.addEventListener("change", onChange);
  return () => list.removeEventListener("change", onChange);
}

const systemSnapshot = (): ColorScheme => (media()?.matches ? "dark" : "light");
const serverSnapshot = (): ColorScheme => "light";

/** The operating system's colour scheme, kept current as it changes. Light where it cannot be read (the server, jsdom). */
export function useSystemColorScheme(): ColorScheme {
  return React.useSyncExternalStore(subscribeSystem, systemSnapshot, serverSnapshot);
}

/** What `useColorScheme` returns: the chosen preference, the scheme in effect, and a setter that persists the choice. */
export type ColorSchemeState = {
  preference: ColorSchemePreference;
  scheme: ColorScheme;
  setPreference: (preference: ColorSchemePreference) => void;
};

const Context = React.createContext<ColorSchemeState | null>(null);

/** What `usePalette` returns: the palette name in effect and a setter that persists it. */
export type PaletteState = { palette: string; setPalette: (palette: string) => void };

const PaletteContext = React.createContext<PaletteState | null>(null);

/** Sets the `.dark` class strata.css keys on, from a system, light or dark preference that persists in localStorage when it can. */
export function ThemeProvider({
  children,
  defaultPreference = "system",
  storageKey = COLOR_SCHEME_STORAGE_KEY,
  defaultPalette = DEFAULT_PALETTE,
  paletteStorageKey = PALETTE_STORAGE_KEY,
  target,
  density,
}: {
  children: React.ReactNode;
  /** The preference before a person has chosen one. */
  defaultPreference?: ColorSchemePreference;
  /** Where the choice is kept in localStorage; `null` keeps it for this visit only. */
  storageKey?: string | null;
  /** The palette before a person has chosen one: a `data-palette` name from `palettes` (or the app's own). Left out, the default palette. */
  defaultPalette?: string;
  /** Where the palette is kept in localStorage; `null` keeps it for this visit only. */
  paletteStorageKey?: string | null;
  /**
   * The element that gets the `.dark` class; the document's root element when left out. A nested
   * target can turn a light page's panel dark, not the reverse: strata.css keys dark on any
   * `.dark` ancestor. Pass the element itself (keep it in state with a callback ref, since a
   * wrapping element's ref is not attached yet when this provider's effect first runs); `null`
   * means it has not mounted yet, and nothing is set until it has.
   */
  target?: HTMLElement | null;
  /**
   * How much the screen packs in, set on the same element as the colour scheme (the root, so
   * overlays are reached): `compact` for a tool screen. See `Density`. Left out, nothing is set.
   */
  density?: DensityName;
}) {
  // The first render uses the default, as the server does, so a server-rendered tree hydrates
  // without a mismatch; the stored choice is read in a layout effect, which re-renders before the
  // browser paints, so a client-only app still never shows the default first.
  const [preference, setState] = React.useState<ColorSchemePreference>(defaultPreference);
  React.useLayoutEffect(() => {
    const stored = readStored(storageKey);
    if (stored) setState(stored);
  }, [storageKey]);
  const system = useSystemColorScheme();
  const scheme: ColorScheme = preference === "system" ? system : preference;

  const setPreference = React.useCallback(
    (next: ColorSchemePreference) => {
      setState(next);
      writeStored(storageKey, next);
    },
    [storageKey],
  );

  // Another tab changed the choice. A cleared key (`newValue` null) falls back to the default.
  React.useEffect(() => {
    if (storageKey === null) return;
    const onStorage = (event: StorageEvent) => {
      if (event.key !== storageKey && event.key !== null) return;
      const value = event.key === null ? null : event.newValue;
      setState(isPreference(value) ? value : defaultPreference);
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, [storageKey, defaultPreference]);

  React.useLayoutEffect(() => {
    const element = target === undefined ? document.documentElement : target;
    if (!element) return;
    element.classList.toggle("dark", scheme === "dark");
    return () => element.classList.remove("dark");
  }, [scheme, target]);

  // The palette follows the scheme's pattern: default first, the stored choice in a layout effect.
  const [palette, setPaletteState] = React.useState<string>(defaultPalette);
  React.useLayoutEffect(() => {
    const stored = readStoredPalette(paletteStorageKey);
    if (stored) setPaletteState(stored);
  }, [paletteStorageKey]);
  const setPalette = React.useCallback(
    (next: string) => {
      if (!isPalette(next)) return;
      setPaletteState(next);
      writeStoredPalette(paletteStorageKey, next);
    },
    [paletteStorageKey],
  );
  React.useEffect(() => {
    if (paletteStorageKey === null) return;
    const onStorage = (event: StorageEvent) => {
      if (event.key !== paletteStorageKey && event.key !== null) return;
      const value = event.key === null ? null : event.newValue;
      setPaletteState(isPalette(value) ? value : defaultPalette);
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, [paletteStorageKey, defaultPalette]);
  React.useLayoutEffect(() => {
    const element = target === undefined ? document.documentElement : target;
    if (!element) return;
    element.setAttribute("data-palette", palette);
    return () => element.removeAttribute("data-palette");
  }, [palette, target]);

  useDensityOn(density, target);

  const value = React.useMemo(() => ({ preference, scheme, setPreference }), [preference, scheme, setPreference]);
  const paletteValue = React.useMemo(() => ({ palette, setPalette }), [palette, setPalette]);
  return (
    <Context.Provider value={value}>
      <PaletteContext.Provider value={paletteValue}>{children}</PaletteContext.Provider>
    </Context.Provider>
  );
}

/** The person's colour-scheme preference, the scheme in effect, and a setter that persists it. Must be inside `ThemeProvider`. */
export function useColorScheme(): ColorSchemeState {
  const value = React.useContext(Context);
  if (!value) throw new Error("useColorScheme must be used inside a ThemeProvider.");
  return value;
}

/**
 * The body of an inline `<script>` for the page's `<head>` that sets `.dark` before the first
 * paint, from the stored choice or the operating system, so a dark page does not flash light while
 * the bundle loads. Pass the same key and default as the `ThemeProvider`.
 */
export function colorSchemeScript(
  storageKey: string = COLOR_SCHEME_STORAGE_KEY,
  defaultPreference: ColorSchemePreference = "system",
): string {
  const key = JSON.stringify(storageKey);
  const fallback = JSON.stringify(defaultPreference);
  return (
    `(function(){var p=${fallback};try{var s=localStorage.getItem(${key});` +
    `if(s==="system"||s==="light"||s==="dark")p=s}catch(e){}` +
    `var d=p==="dark"||(p==="system"&&window.matchMedia&&matchMedia(${JSON.stringify(QUERY)}).matches);` +
    `document.documentElement.classList.toggle("dark",!!d)})()`
  );
}

/** The words `ColorSchemeChoice` shows for each preference. */
export type ColorSchemeLabels = Record<ColorSchemePreference, { label: string; detail?: string }>;

const defaultLabels: ColorSchemeLabels = {
  system: { label: "Match this device", detail: "Light or dark as your system setting changes" },
  light: { label: "Light" },
  dark: { label: "Dark" },
};

const icons: Record<ColorSchemePreference, IconComponent> = { system: Monitor, light: Sun, dark: Moon };

/** The three colour-scheme preferences as radio buttons, bound to the nearest `ThemeProvider`. A list for a settings page, or `compact` icon segments named "Appearance" for a header. */
export function ColorSchemeChoice({
  legend,
  labels = defaultLabels,
  compact = false,
  className,
}: {
  /** The group's name, as the page words it. Defaults to "Theme", or "Appearance" when `compact`. */
  legend?: string;
  /** Overrides the words for each choice, in the product's voice. */
  labels?: Partial<ColorSchemeLabels>;
  /** Three icon segments for a header or footer, for an app with no settings page. */
  compact?: boolean;
  /** Layout at the call site (compact only). */
  className?: string;
}) {
  const { preference, setPreference } = useColorScheme();
  const name = React.useId();
  const words = { ...defaultLabels, ...labels };
  if (compact) {
    return (
      <RadioGroup
        aria-label={legend ?? "Appearance"}
        orientation="horizontal"
        name={name}
        value={preference}
        onChange={(value) => {
          if (isPreference(value)) setPreference(value);
        }}
        className={cn("inline-flex gap-0.5 rounded-surface border border-border bg-background p-0.5", className)}
      >
        {PREFERENCES.map((value) => {
          const Icon = icons[value];
          return (
            <Tooltip key={value} label={words[value].label}>
            <Radio
              value={value}
              aria-label={words[value].label}
              className={cn(
                // Outer 6px less 2px padding: the segments are 4px, as optical nesting asks.
                "grid size-(--control-h-sm) cursor-pointer place-items-center rounded-control text-muted-foreground transition-state",
                "hover:text-foreground selected:bg-muted selected:text-foreground",
                "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring",
              )}
            >
              <Icon aria-hidden className="size-4" />
            </Radio>
            </Tooltip>
          );
        })}
      </RadioGroup>
    );
  }
  return (
    <ChoiceGroup
      legend={legend ?? "Theme"}
      name={name}
      value={preference}
      onChange={(value) => {
        if (isPreference(value)) setPreference(value);
      }}
      choices={PREFERENCES.map((value) => ({ value, ...words[value] }))}
    />
  );
}

/** The palette in effect and a setter that persists it. Must be inside `ThemeProvider`. */
export function usePalette(): PaletteState {
  const value = React.useContext(PaletteContext);
  if (!value) throw new Error("usePalette must be used inside a ThemeProvider.");
  return value;
}

/**
 * The body of an inline `<script>` for the page's `<head>` that sets `data-palette` before the first paint
 * from the stored choice, so a page does not flash the default palette while the bundle loads. Pass the
 * same key and default as the `ThemeProvider`; put it beside `colorSchemeScript()`.
 */
export function paletteScript(storageKey: string = PALETTE_STORAGE_KEY, defaultPalette: string = DEFAULT_PALETTE): string {
  const key = JSON.stringify(storageKey);
  const fallback = JSON.stringify(defaultPalette);
  return (
    `(function(){var p=${fallback};try{var s=localStorage.getItem(${key});` +
    `if(s&&/^[a-z][a-z0-9-]{0,31}$/.test(s))p=s}catch(e){}` +
    `document.documentElement.setAttribute("data-palette",p)})()`
  );
}

/**
 * The palettes as radio buttons, bound to the nearest `ThemeProvider`, each with a swatch drawn in its own
 * palette (primary and the one warm accent) so the colours are seen before they are chosen. A list for a
 * settings page, or `compact` swatches named "Palette" for a header. The words are always present (the
 * list shows them, the compact form names each swatch and shows the same words as a tooltip).
 */
export function PaletteChoice({
  legend,
  options = palettes,
  compact = false,
  className,
}: {
  /** The group's name, as the page words it. Defaults to "Palette". */
  legend?: string;
  /** The palettes offered: names that `strata.css` (or the app's own CSS) defines under `data-palette`, with their words. Defaults to `palettes`. */
  options?: readonly PaletteOption[];
  /** Swatches only, for a header or footer, for an app with no settings page. */
  compact?: boolean;
  /** Layout at the call site (compact only). */
  className?: string;
}) {
  const { palette, setPalette } = usePalette();
  const name = React.useId();
  const swatch = (option: PaletteOption) => (
    // Scoping the palette on the swatch draws it in its own colours, in light and in a dark page.
    <span data-palette={option.name} aria-hidden className="inline-flex size-5 shrink-0 overflow-hidden rounded-pill border border-border">
      <span className="w-1/2 bg-primary" />
      <span className="w-1/2 bg-secondary-9" />
    </span>
  );
  if (compact) {
    return (
      <RadioGroup
        aria-label={legend ?? "Palette"}
        orientation="horizontal"
        name={name}
        value={palette}
        onChange={setPalette}
        className={cn("inline-flex gap-0.5 rounded-surface border border-border bg-background p-0.5", className)}
      >
        {options.map((option) => (
          <Tooltip key={option.name} label={option.label}>
            <Radio
              value={option.name}
              aria-label={option.label}
              className={cn(
                "grid size-(--control-h-sm) cursor-pointer place-items-center rounded-control transition-state",
                "hover:bg-muted selected:bg-muted selected:ring-1 selected:ring-border",
                "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring",
              )}
            >
              {swatch(option)}
            </Radio>
          </Tooltip>
        ))}
      </RadioGroup>
    );
  }
  return (
    <ChoiceGroup
      legend={legend ?? "Palette"}
      name={name}
      value={palette}
      onChange={setPalette}
      choices={options.map((option) => ({ value: option.name, label: option.label, detail: option.detail, leading: swatch(option) }))}
    />
  );
}
