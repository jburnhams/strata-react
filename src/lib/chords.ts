// Chords: a shortcut written once ("Mod+Shift+Z") and shown per platform (⌘⇧Z on macOS, Ctrl+Shift+Z
// elsewhere). `Mod` is the platform's command key: Meta on macOS, Ctrl everywhere else. The other
// modifiers are Ctrl, Meta, Alt and Shift. The key is a `KeyboardEvent.key` value, compared without
// case ("z" and "Z" are the same key; Shift is part of the chord when written).
//
// Matching is exact on the modifiers: "Mod+Z" is not "Mod+Shift+Z", so Undo and Redo cannot both
// fire. Shift is ignored for a symbol key ("?" is typed with Shift on most layouts), and Alt is
// matched on the physical key for letters, since Alt+Z types "Ω" on a Mac.

/** `"mac"` or `"other"`: which modifier glyphs to draw and what `Mod` means. */
export type Platform = "mac" | "other";

/** The platform this page runs on, read from the browser (`mac` for macOS and iOS). Server and test default: `other`. */
export function detectPlatform(): Platform {
  if (typeof navigator === "undefined") return "other";
  const nav = navigator as Navigator & { userAgentData?: { platform?: string } };
  const text = nav.userAgentData?.platform ?? nav.platform ?? "";
  return /mac|iphone|ipad|ipod/i.test(text) ? "mac" : "other";
}

type Parsed = { ctrl: boolean; meta: boolean; alt: boolean; shift: boolean; key: string };

/** Splits "Mod+Shift+Z" into modifiers and key for a platform. A bare "+" key is written "Mod++". */
export function parseChord(chord: string, platform: Platform = detectPlatform()): Parsed {
  const parts = chord.endsWith("++") ? [...chord.slice(0, -2).split("+").filter(Boolean), "+"] : chord.split("+");
  const key = parts.pop() ?? "";
  const mods = new Set(parts.map((p) => p.toLowerCase()));
  const mod = mods.has("mod");
  return {
    ctrl: mods.has("ctrl") || (mod && platform !== "mac"),
    meta: mods.has("meta") || (mod && platform === "mac"),
    alt: mods.has("alt"),
    shift: mods.has("shift"),
    key,
  };
}

const symbol = (key: string) => key.length === 1 && key.toUpperCase() === key.toLowerCase();

/** Whether a key event is this chord. Exact on Ctrl, Meta and Alt; Shift is exact for letters and named keys. */
export function matchesChord(e: Pick<KeyboardEvent, "key" | "code" | "ctrlKey" | "metaKey" | "altKey" | "shiftKey">, chord: string, platform: Platform = detectPlatform()): boolean {
  const c = parseChord(chord, platform);
  if (e.ctrlKey !== c.ctrl || e.metaKey !== c.meta || e.altKey !== c.alt) return false;
  if (!symbol(c.key) && e.shiftKey !== c.shift) return false;
  if (symbol(c.key) && c.shift && !e.shiftKey) return false;
  if (e.key.toLowerCase() === c.key.toLowerCase()) return true;
  return c.alt && /^[a-z]$/i.test(c.key) && e.code === `Key${c.key.toUpperCase()}`;
}

const NAMES: Record<string, { mac: string; other: string }> = {
  ArrowUp: { mac: "↑", other: "↑" },
  ArrowDown: { mac: "↓", other: "↓" },
  ArrowLeft: { mac: "←", other: "←" },
  ArrowRight: { mac: "→", other: "→" },
  Escape: { mac: "⎋", other: "Esc" },
  Enter: { mac: "↩", other: "Enter" },
  Backspace: { mac: "⌫", other: "Backspace" },
  Delete: { mac: "⌦", other: "Delete" },
  " ": { mac: "Space", other: "Space" },
  Tab: { mac: "⇥", other: "Tab" },
  Home: { mac: "↖", other: "Home" },
  End: { mac: "↘", other: "End" },
};

/** A chord as a person reads it on this platform: "⌘⇧Z" on macOS, "Ctrl+Shift+Z" elsewhere. */
export function formatChord(chord: string, platform: Platform = detectPlatform()): string {
  const c = parseChord(chord, platform);
  const key = NAMES[c.key]?.[platform] ?? (c.key.length === 1 ? c.key.toUpperCase() : c.key);
  if (platform === "mac") return `${c.ctrl ? "⌃" : ""}${c.alt ? "⌥" : ""}${c.shift ? "⇧" : ""}${c.meta ? "⌘" : ""}${key}`;
  return [c.ctrl && "Ctrl", c.meta && "Meta", c.alt && "Alt", c.shift && "Shift", key].filter(Boolean).join("+");
}

// Chords the browser or the OS uses for itself. An app takes one over only on purpose (`claim` on
// the command): silently stealing Ctrl+S from a person who wanted the browser's own is a choice.
const RESERVED = [
  "Mod+S", "Mod+P", "Mod+F", "Mod+G", "Mod+O", "Mod+N", "Mod+T", "Mod+W", "Mod+R", "Mod+L", "Mod+D", "Mod+Q", "Mod+H",
  "Mod+J", "Mod+U", "Mod+Shift+T", "Mod+Shift+N", "Mod+Shift+W", "Alt+ArrowLeft", "Alt+ArrowRight", "F5", "F11", "F12",
];

/** Whether the browser uses this chord for itself, so a command may take it only with `claim`. */
export function isReservedChord(chord: string, platform: Platform = detectPlatform()): boolean {
  const c = parseChord(chord, platform);
  return RESERVED.some((r) => {
    const p = parseChord(r, platform);
    return p.ctrl === c.ctrl && p.meta === c.meta && p.alt === c.alt && p.shift === c.shift && p.key.toLowerCase() === c.key.toLowerCase();
  });
}
