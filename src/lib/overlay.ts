// The look every floating surface shares (Dialog, Popover, and later Menu and Toast): the popover
// role pair, an overlay radius, one hairline and the one shadow that exists for what floats
// (components.md §3.11). One string, so a menu and a popover cannot drift apart.
export const overlaySurface =
  "rounded-overlay border border-border bg-popover text-popover-foreground shadow-overlay enter-overlay";
