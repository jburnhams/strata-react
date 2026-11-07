import * as React from "react";
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

/** Sets the `.dark` class strata.css keys on, from a system, light or dark preference that persists in localStorage when it can. */
export function ThemeProvider({
  children,
  defaultPreference = "system",
  storageKey = COLOR_SCHEME_STORAGE_KEY,
  target,
}: {
  children: React.ReactNode;
  /** The preference before a person has chosen one. */
  defaultPreference?: ColorSchemePreference;
  /** Where the choice is kept in localStorage; `null` keeps it for this visit only. */
  storageKey?: string | null;
  /**
   * The element that gets the `.dark` class; the document's root element when left out. A nested
   * target can turn a light page's panel dark, not the reverse: strata.css keys dark on any
   * `.dark` ancestor. Pass the element itself (keep it in state with a callback ref, since a
   * wrapping element's ref is not attached yet when this provider's effect first runs); `null`
   * means it has not mounted yet, and nothing is set until it has.
   */
  target?: HTMLElement | null;
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

  const value = React.useMemo(() => ({ preference, scheme, setPreference }), [preference, scheme, setPreference]);
  return <Context.Provider value={value}>{children}</Context.Provider>;
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
      <div
        role="radiogroup"
        aria-label={legend ?? "Appearance"}
        className={cn("inline-flex gap-0.5 rounded-surface border border-border bg-background p-0.5", className)}
      >
        {PREFERENCES.map((value) => {
          const Icon = icons[value];
          return (
            <label
              key={value}
              title={words[value].label}
              className={cn(
                // Outer 6px less 2px padding: the segments are 4px, as optical nesting asks.
                "grid size-(--control-h-sm) cursor-pointer place-items-center rounded-control text-muted-foreground transition-state",
                "hover:text-foreground has-checked:bg-muted has-checked:text-foreground",
                "has-focus-visible:outline-2 has-focus-visible:outline-offset-2 has-focus-visible:outline-ring",
              )}
            >
              <input
                type="radio"
                name={name}
                value={value}
                checked={preference === value}
                onChange={() => setPreference(value)}
                aria-label={words[value].label}
                className="sr-only"
              />
              <Icon aria-hidden className="size-4" />
            </label>
          );
        })}
      </div>
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
