// Pinning the face a page's system fonts resolve to (issue #342). An app on a home server may
// choose `system-ui` on purpose so a page never waits on a font download, and then `systemFonts:
// "allow"` was the only way to take a baseline: it drew whichever face the machine resolved
// `system-ui` to (DejaVu Sans on CI, Inter or Cantarell on a developer's machine), and every text
// diff failed. The runner now gives Chromium a fontconfig file of its own, whose only font
// directory holds the files the config names and which answers every family the page asks for
// (`system-ui`, `sans-serif`, `ui-monospace`, a name nothing has) with the pinned family. Checked
// against Chromium's own report of the faces that painted text: with and without the file,
// `system-ui` was "Inter" and became "DejaVu Sans", `sans-serif` "Liberation Sans" → "DejaVu Sans",
// `monospace` "DejaVu Sans Mono" → "DejaVu Sans". Nothing is shipped to users: the files are the
// runner's, not the page's.
//
// Linux only: macOS and Windows resolve system-ui through the platform, not fontconfig. A run there
// says so and reports system fonts as warnings; baselines are recorded where CI runs them.
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, join, resolve } from "node:path";

/** A system face to pin, from `VisualConfig.systemFonts`. */
export interface PinnedSystemFont {
  /** The family name inside the font files, e.g. `"DejaVu Sans"`. Every system family the page uses resolves to it. */
  pin: string;
  /** Font files (`.ttf`, `.otf`) holding that family, relative to the config file: the regular face and any bold or italic the page uses. */
  files: readonly string[];
}

/** A pinned face made ready for a launch. */
export interface PinnedFonts {
  /** Environment for Chromium: points fontconfig at the generated file. */
  env: Record<string, string>;
  /** The family that now stands for every system family; text drawn in it is not a system-font fault. */
  family: string;
  /** Removes the generated folder. */
  dispose(): void;
}

const xml = (s: string) => s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

/** Writes the fontconfig that pins `font` and returns what a launch needs. Throws when a file is missing. */
export function pinSystemFont(font: PinnedSystemFont, cwd: string): PinnedFonts {
  if (!font.pin || !font.files.length) throw new Error("systemFonts.pin needs the family name and at least one font file");
  const dir = mkdtempSync(join(tmpdir(), "strata-visual-fonts-"));
  try {
    const fonts = join(dir, "fonts");
    mkdirSync(fonts);
    for (const file of font.files) {
      const from = resolve(cwd, file);
      if (!existsSync(from)) throw new Error(`systemFonts.pin: ${from} not found`);
      copyFileSync(from, join(fonts, basename(from)));
    }
    // The one `<dir>` is the copy, so nothing else on the machine is a candidate; the match rewrites
    // any family asked for to the pinned one, which is how the generic names reach it.
    writeFileSync(
      join(dir, "fonts.conf"),
      `<?xml version="1.0"?>
<!DOCTYPE fontconfig SYSTEM "fonts.dtd">
<fontconfig>
  <dir>${xml(fonts)}</dir>
  <cachedir>${xml(join(dir, "cache"))}</cachedir>
  <match target="pattern"><edit name="family" mode="assign_replace"><string>${xml(font.pin)}</string></edit></match>
</fontconfig>
`,
    );
    return { env: { FONTCONFIG_FILE: join(dir, "fonts.conf") }, family: font.pin, dispose: () => rmSync(dir, { recursive: true, force: true }) };
  } catch (e) {
    rmSync(dir, { recursive: true, force: true });
    throw e;
  }
}
