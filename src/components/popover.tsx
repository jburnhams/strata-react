import * as React from "react";
import { Dialog, DialogTrigger, Popover as AriaPopover } from "react-aria-components";
import { cn } from "../lib/utils";
import { overlaySurface } from "../lib/overlay";

// A popover holds a small form or a choice anchored to the control that opened it (a colour, a
// sort, a few filters) where a dialog would take the whole screen. Unlike a tooltip it may hold
// anything interactive. React Aria keeps it inside the viewport (flips and shifts at the edges),
// closes it on Escape and on a press outside, and returns focus to the trigger. It is a labelled
// `dialog`, so `label` is required: an unnamed floating region is the same defect as an unnamed
// icon button. It is portalled to the body on `layer-overlay`, so panes and sticky headers cannot
// clip or cover it.

/** Props for `Popover`. */
export type PopoverProps = {
  /** What the popover is, as a screen reader names it: "Line colour", "Filters". Required. */
  label: string;
  /** The control that opens it (a `Button`); it gets `aria-expanded` and focus back on close. */
  trigger: React.ReactElement;
  children: React.ReactNode;
  side?: "top" | "right" | "bottom" | "left";
  /** Where along the trigger it lines up. Default `start`. */
  align?: "start" | "center" | "end";
  /** Controlled open state. */
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  /** Width of the surface. Default `md` (18rem). */
  size?: "sm" | "md" | "lg";
  className?: string;
};

const widths = { sm: "w-52", md: "w-72", lg: "w-96" } as const;

/** A floating panel anchored to its trigger, for a small form or choice. Requires a `label`; closes on Escape and outside press, and returns focus. */
export function Popover({ label, trigger, children, side = "bottom", align = "start", open, onOpenChange, size = "md", className }: PopoverProps) {
  const placement = (align === "center" ? side : `${side} ${align}`) as React.ComponentProps<typeof AriaPopover>["placement"];
  return (
    <DialogTrigger isOpen={open} onOpenChange={onOpenChange}>
      {trigger}
      <AriaPopover placement={placement} offset={6} className={cn("layer-overlay p-3", widths[size], overlaySurface, className)}>
        <Dialog aria-label={label} className="outline-none">
          {children}
        </Dialog>
      </AriaPopover>
    </DialogTrigger>
  );
}
