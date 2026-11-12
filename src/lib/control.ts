// Control sizes, one set for everything that sits in a toolbar or a property row: `default` is
// --control-h and `sm` is --control-h-sm, so two controls of the same size name are the same height
// in every density (issue #117). Button, IconButton, Toggle, ToggleGroup, Input, NativeSelect and
// NumberField all take it as `size`.

/** The size names a control takes: `default` (--control-h) or `sm` (--control-h-sm). */
export type ControlSize = "default" | "sm";

/** The height class of each control size. */
export const controlHeight: Record<ControlSize, string> = {
  default: "h-(--control-h)",
  sm: "h-(--control-h-sm)",
};
