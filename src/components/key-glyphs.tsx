import * as React from "react";
import { ArrowBigUp, ArrowDown, ArrowLeft, ArrowRight, ArrowUp, ChevronUp, Command, Option, type LucideIcon } from "lucide-react";

// Keys drawn as icons where a font cannot be trusted to have them (strata-react issue #136, from
// strata-vid). The arrows (← → ↑ ↓) and the macOS modifiers (⌘ ⌃ ⌥ ⇧) are outside the latin subset of
// the bundled variable fonts, so a legend drew them in whatever face the machine had: different on
// every machine, and `strata-visual` fails a shot with text in a system font. Lucide's icons are
// SVG, so they draw the same everywhere and take the text colour. Each is hidden from assistive
// technology and followed by its name in screen-reader-only text ("left arrow", "Command"), so the
// keycap reads as words rather than as a symbol each screen reader pronounces its own way.
// Checked: React Aria has no keyboard-shortcut display beyond the `Keyboard` slot (which only
// labels the text it is given), so this is the glyph mapping the slot's content needs.

const GLYPHS: Record<string, { icon: LucideIcon; name: string }> = {
  "←": { icon: ArrowLeft, name: "left arrow" },
  "→": { icon: ArrowRight, name: "right arrow" },
  "↑": { icon: ArrowUp, name: "up arrow" },
  "↓": { icon: ArrowDown, name: "down arrow" },
  "⌘": { icon: Command, name: "Command" },
  "⌃": { icon: ChevronUp, name: "Control" },
  "⌥": { icon: Option, name: "Option" },
  "⇧": { icon: ArrowBigUp, name: "Shift" },
};
const PATTERN = new RegExp(`([${Object.keys(GLYPHS).join("")}])`);

/** Key text with its arrows and modifier symbols drawn as icons, each with its name for screen readers. Other text is left as it is. */
export function KeyText({ children }: { children: string }) {
  return (
    <>
      {children.split(PATTERN).map((part, i) => {
        const glyph = GLYPHS[part];
        if (!glyph) return part ? <React.Fragment key={i}>{part}</React.Fragment> : null;
        const Icon = glyph.icon;
        return (
          <React.Fragment key={i}>
            <Icon aria-hidden className="inline size-[1em] align-[-0.125em]" />
            <span className="sr-only">{glyph.name} </span>
          </React.Fragment>
        );
      })}
    </>
  );
}
