import * as React from "react";
import { Switch as AriaSwitch } from "react-aria-components";
import { cn } from "../lib/utils";

// A switch is for a setting that applies the moment it is flipped (show the grid, enable the
// heatmap), never for one that needs a Save: that is a Checkbox in a form (components.md §3.3).
// The label and the control are one target. "On" is shown by position and by a tick in the thumb
// as well as by colour, so it survives a colour-blind reading. `role="switch"` and its on state
// come from React Aria. `detail` is the description, not part of the name: React Aria puts all the
// text inside the switch into its label, so the label span names the control (`aria-labelledby`)
// and the detail is pointed at by `aria-describedby`, as `Checkbox` and `Field` do (issue #152).
// Used many times a day, so only a short colour and position transition.

/** Props for `Switch`. */
export type SwitchProps = {
  /** What it turns on, as the visible label: "Show elevation profile". Required. */
  label: string;
  /** A muted second line under the label. */
  detail?: string;
  on?: boolean;
  defaultOn?: boolean;
  onChange?: (on: boolean) => void;
  disabled?: boolean;
  className?: string;
};

/** An on/off setting that applies at once, its label and control one target. */
export function Switch({ label, detail, on, defaultOn, onChange, disabled, className }: SwitchProps) {
  const id = React.useId();
  return (
    <AriaSwitch
      isSelected={on}
      defaultSelected={defaultOn}
      onChange={onChange}
      isDisabled={disabled}
      aria-labelledby={`${id}-label`}
      aria-describedby={detail ? `${id}-detail` : undefined}
      className={cn("group inline-flex min-h-6 cursor-pointer items-start gap-3 disabled:cursor-not-allowed disabled:opacity-50", className)}
    >
      <span
        aria-hidden
        className={cn(
          "mt-0.5 flex h-5 w-9 shrink-0 items-center rounded-pill border border-input bg-muted p-0.5 transition-state",
          "group-selected:border-primary group-selected:bg-primary",
          "group-focus-visible:outline-2 group-focus-visible:outline-offset-2 group-focus-visible:outline-ring",
        )}
      >
        <span className="grid size-3.5 place-items-center rounded-pill bg-background text-primary group-selected:translate-x-4">
          <span className="hidden size-1.5 rounded-pill bg-primary group-selected:block" />
        </span>
      </span>
      <span className="grid">
        <span id={`${id}-label`} className="type-body">{label}</span>
        {detail && <span id={`${id}-detail`} className="type-body-sm text-muted-foreground">{detail}</span>}
      </span>
    </AriaSwitch>
  );
}
