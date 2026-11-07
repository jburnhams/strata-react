import type { IconComponent } from "../lib/icon";
import { cn } from "../lib/utils";

// Status is a word first. `children` is required and must be a string, so a status can never be a
// bare coloured dot. The tint and ink come from the fixed status roles, which are kept apart from
// the brand accent: pale tint, dark ink of the same hue, never a saturated chip with white text.
// No pulsing variant exists; nothing on a status mark moves unless the data behind it is live.

export type Tone = "neutral" | "info" | "success" | "warning" | "danger";

const tones: Record<Tone, string> = {
  neutral: "bg-muted text-muted-foreground",
  info: "bg-info-subtle text-info",
  success: "bg-success-subtle text-success",
  warning: "bg-warning-subtle text-warning",
  danger: "bg-danger-subtle text-danger",
};

/** A status as a word on a pale tint of its tone, with an optional icon. Never colour alone. */
export function Status({
  tone,
  icon: Icon,
  children,
  className,
}: {
  tone: Tone;
  icon?: IconComponent;
  children: string;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 whitespace-nowrap rounded-pill py-0.5 pr-2.5 pl-2 type-caption font-medium",
        tones[tone],
        className,
      )}
    >
      {Icon && <Icon aria-hidden className="size-3.5 shrink-0" />}
      {children}
    </span>
  );
}
