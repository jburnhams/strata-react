import * as React from "react";
import { Tooltip as AriaTooltip, TooltipTrigger } from "react-aria-components";
import { cn } from "../lib/utils";

// A tooltip names or explains a control; it is never the only place information lives. React Aria
// opens it on keyboard focus as well as hover (strata-vid's old hover-only tooltip hid it from
// keyboard users), after a short delay so a pointer crossing a toolbar does not flash every tip,
// and shares the delay between neighbouring tips. It holds only words: anything interactive is a
// Popover. It is portalled to the body, so a parent's overflow cannot clip it, and sits on the
// `layer-tip` layer above dialogs, since it can name a control inside one.
//
// `IconButton` uses it for its required `label`, so the name and the visible hint come from one
// string and cannot drift.

/** Props for `Tooltip`. */
export type TooltipProps = {
  /** The words: a control's name or one sentence about it. Not interactive. */
  label: React.ReactNode;
  /** A shortcut or other aside shown after the label, muted ("Ctrl+Z"). */
  hint?: React.ReactNode;
  /** The element that gets the tip. It must be a React Aria pressable or focusable (a Strata `Button` is). */
  children: React.ReactElement;
  /** Which side of the trigger it prefers; it flips when there is no room. Default `top`. */
  side?: "top" | "right" | "bottom" | "left";
  /** Milliseconds before it opens on hover. Focus opens it at once. Default 500. */
  delay?: number;
  /** A controlled open state, for a story or test that needs it shown. */
  open?: boolean;
  className?: string;
};

/** A hover-and-focus tooltip for a control, portalled above everything. Words only; not the only home of information. */
export function Tooltip({ label, hint, children, side = "top", delay = 500, open, className }: TooltipProps) {
  return (
    <TooltipTrigger delay={delay} closeDelay={0} isOpen={open}>
      {children}
      <AriaTooltip
        placement={side}
        offset={6}
        className={cn("layer-tip enter-overlay max-w-xs rounded-control bg-foreground px-2 py-1 type-caption text-background", className)}
      >
        {label}
        {hint != null && <span className="ml-2 opacity-70">{hint}</span>}
      </AriaTooltip>
    </TooltipTrigger>
  );
}
