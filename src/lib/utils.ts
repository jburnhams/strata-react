import { clsx, type ClassValue } from "clsx";
import { extendTailwindMerge } from "tailwind-merge";

// Teach tailwind-merge that `type-*` utilities are font sizes. Without this, cn() cannot tell
// `type-label` from a colour and may drop one of two classes that both survive in CSS; with stock
// shadcn the same bug drops `text-muted-foreground` next to a custom `text-*` size.
export const typeSteps = ["caption", "label", "body-sm", "body", "heading", "title", "figure", "display"] as const;

// The radius roles too, so `rounded-pill` at a call site (a round avatar Thumbnail) replaces a
// component's `rounded-control` instead of both surviving and CSS order picking one.
const radiusRoles = ["control", "surface", "overlay", "pill"] as const;

const twMerge = extendTailwindMerge({
  extend: {
    theme: { radius: [...radiusRoles] },
    classGroups: {
      "font-size": [{ type: [...typeSteps] }],
    },
  },
});

/** clsx + tailwind-merge, taught that `type-*` utilities are font sizes and `rounded-control`, `-surface`, `-overlay`, `-pill` are radii. */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
