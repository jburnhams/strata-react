import * as React from "react";
import { Toolbar as AriaToolbar, Separator } from "react-aria-components";
import { cn } from "../lib/utils";
import { isTypingTarget } from "./hotkeys";

// A toolbar groups controls that act on what is shown (a preview's grid and quality, a timeline's
// snap, a table's density). React Aria gives it the WAI-ARIA toolbar keyboard model: one tab stop,
// arrow keys (and Home and End) move inside it, Tab leaves it. It needs a `label`, as an unnamed
// toolbar is announced as nothing. Groups inside it are separated by a hairline (`ToolbarSeparator`)
// rather than by space alone, so a row of eight small controls reads as three groups. It lays out
// as one wrapping row: when it runs out of width, controls wrap to the next line instead of being
// hidden behind an overflow menu, which keeps every control reachable with no extra state
// (an overflow menu is the later step, once the Menu exists).

// A slider keeps its own Home and End (to its ends), as a typing target keeps its own: a size slider
// in a toolbar (`ViewOptions`) would otherwise lose them to "first control".
const isRange = (t: EventTarget | null) => t instanceof HTMLInputElement && t.type === "range";

/** Props for `Toolbar`. */
export type ToolbarProps = {
  /** Names the toolbar for screen readers: "Preview options". Required. */
  label: string;
  orientation?: "horizontal" | "vertical";
  children: React.ReactNode;
  className?: string;
};

/** A group of controls with one tab stop and arrow-key movement (the WAI-ARIA toolbar pattern). Needs a `label`. */
export function Toolbar({ label, orientation = "horizontal", children, className }: ToolbarProps) {
  // React Aria's toolbar moves with the arrow keys; Home and End (to the first and last control) are
  // added here, as the WAI-ARIA toolbar pattern lists them. The capture phase runs before React
  // Aria's own handler, and a typing target (a number field inside the toolbar) keeps its Home and End.
  const jump = (e: React.KeyboardEvent<HTMLElement>) => {
    // Only events from inside the toolbar's own DOM: a Popover opened from a control here renders in
    // a portal, and its events still reach this handler through React's tree.
    if ((e.key !== "Home" && e.key !== "End") || isTypingTarget(e.target) || isRange(e.target) || !e.currentTarget.contains(e.target as Node)) return;
    const items = [...e.currentTarget.querySelectorAll<HTMLElement>("button, input, select, textarea, a[href], [tabindex]")].filter(
      (el) => !el.hasAttribute("disabled") && el.getAttribute("aria-disabled") !== "true" && el.tabIndex >= -1 && el.getAttribute("role") !== "separator",
    );
    const target = e.key === "Home" ? items[0] : items[items.length - 1];
    if (!target) return;
    e.preventDefault();
    e.stopPropagation();
    target.focus();
  };
  return (
    <div className="contents" onKeyDownCapture={jump}>
      <AriaToolbar
        aria-label={label}
        orientation={orientation}
        className={cn("flex flex-wrap items-center gap-1", orientation === "vertical" && "flex-col items-stretch", className)}
      >
        {children}
      </AriaToolbar>
    </div>
  );
}

/** A hairline between groups of controls inside a `Toolbar`. */
export function ToolbarSeparator({ className }: { className?: string }) {
  return <Separator className={cn("mx-1 h-5 w-px self-center border-0 bg-border", className)} />;
}
