import * as React from "react";
import { ToggleButton as AriaToggleButton, ToggleButtonGroup } from "react-aria-components";
import type { IconComponent } from "../lib/icon";
import { cn } from "../lib/utils";
import { Tooltip } from "./tooltip";

// On/off and one-of-a-few controls for what acts on the view: grid, snap, quality, view mode,
// density. `Toggle` is one pressed-or-not button (`aria-pressed`); `ToggleGroup` is a single-choice
// set of them for 2 to 7 short options that switch a view (components.md §3.3; for 2 to 5 options
// that each need a sentence use `ChoiceGroup`).
//
// The chosen state must be seen without colour and must not look like the view's one filled
// primary button (patterns.md §2, the one-filled-button rule): chosen is an ink border on a
// neutral tint, with the label unchanged in weight (no layout shift), never `bg-primary`. An
// icon-only toggle cannot be written without its name: `label` is required, becomes the accessible
// name and is shown as a tooltip, as for `IconButton`. Toggles are used tens of times a day, so
// they get the press and colour transitions and nothing more (character.md §3).

const base =
  "inline-flex shrink-0 cursor-pointer items-center justify-center gap-2 whitespace-nowrap rounded-control border type-label transition-state press [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0 " +
  "border-input bg-background text-muted-foreground hover:bg-muted hover:text-foreground " +
  "selected:border-foreground selected:bg-muted selected:text-foreground " +
  "disabled:pointer-events-none disabled:opacity-50";

const sizes = { default: "h-(--control-h)", sm: "h-(--control-h-sm)" } as const;
type Size = keyof typeof sizes;

/** Props for `Toggle`. */
export type ToggleProps = {
  /** The name, always. Shown as the text unless `icon` is given with `iconOnly`, then it is the accessible name and the tooltip. */
  label: string;
  icon?: IconComponent;
  /** Show only the icon; `label` stays the name and tooltip. */
  iconOnly?: boolean;
  pressed?: boolean;
  defaultPressed?: boolean;
  onChange?: (pressed: boolean) => void;
  disabled?: boolean;
  size?: Size;
  className?: string;
};

function Face({ label, icon: Icon, iconOnly, pad }: { label: string; icon?: IconComponent; iconOnly?: boolean; pad: string }) {
  return (
    <>
      {Icon && <Icon aria-hidden />}
      {!iconOnly && <span className={pad}>{label}</span>}
    </>
  );
}

/** A button that is pressed or not (`aria-pressed`). Chosen reads as an ink border on a tint, never as the filled primary. */
export function Toggle({ label, icon, iconOnly = false, pressed, defaultPressed, onChange, disabled, size = "default", className }: ToggleProps) {
  const button = (
    <AriaToggleButton
      isSelected={pressed}
      defaultSelected={defaultPressed}
      onChange={onChange}
      isDisabled={disabled}
      aria-label={icon && iconOnly ? label : undefined}
      className={cn(base, sizes[size], icon && iconOnly ? (size === "sm" ? "size-(--control-h-sm)" : "size-(--control-h)") : "px-3", className)}
    >
      <Face label={label} icon={icon} iconOnly={iconOnly && Boolean(icon)} pad="" />
    </AriaToggleButton>
  );
  return icon && iconOnly ? <Tooltip label={label}>{button}</Tooltip> : button;
}

/** One option of a `ToggleGroup`. */
export type ToggleOption = { value: string; label: string; icon?: IconComponent; iconOnly?: boolean };

/** Props for `ToggleGroup`. */
export type ToggleGroupProps = {
  /** Names the group for screen readers: "Preview quality". Required. */
  label: string;
  options: readonly ToggleOption[];
  value: string;
  onChange: (value: string) => void;
  size?: Size;
  className?: string;
};

/** A single-choice set of toggle buttons for 2 to 7 short options that switch a view. One is always chosen; arrow keys move between them. */
export function ToggleGroup({ label, options, value, onChange, size = "default", className }: ToggleGroupProps) {
  return (
    <ToggleButtonGroup
      aria-label={label}
      selectionMode="single"
      disallowEmptySelection
      selectedKeys={[value]}
      onSelectionChange={(keys) => {
        const next = [...keys][0];
        if (next !== undefined) onChange(String(next));
      }}
      className={cn("inline-flex gap-0.5 rounded-surface border border-border bg-background p-0.5", className)}
    >
      {options.map((o) => {
        const iconOnly = Boolean(o.icon && o.iconOnly);
        const item = (
          <AriaToggleButton
            id={o.value}
            aria-label={iconOnly ? o.label : undefined}
            className={cn(
              base,
              // Inside the group the segments are 4px, the outer 6px less its 2px padding; the group's own
              // hairline replaces each segment's, and the chosen one keeps the ink border.
              "border-transparent bg-transparent selected:border-foreground",
              sizes[size],
              iconOnly ? (size === "sm" ? "size-(--control-h-sm)" : "size-(--control-h)") : "px-3",
            )}
          >
            <Face label={o.label} icon={o.icon} iconOnly={iconOnly} pad="" />
          </AriaToggleButton>
        );
        return iconOnly ? <Tooltip key={o.value} label={o.label}>{item}</Tooltip> : React.cloneElement(item, { key: o.value });
      })}
    </ToggleButtonGroup>
  );
}
