import * as React from "react";
import { CircleAlert, CircleCheck, Info, TriangleAlert } from "lucide-react";
import type { IconComponent } from "../lib/icon";
import { cn } from "../lib/utils";
import type { Tone } from "./status";

// An alert is one inline sentence about a problem or a fact, where it applies: a failed export
// under the export, a stale reading above the chart. It is how an error a person must act on is
// shown, with its recovery as `action`; a toast is not (components.md §3.13, patterns.md §7).
//
// Drawn as a pale tint of its tone with its icon and, for `title`, a heavier first line: never a
// coloured stripe down one side of a rounded box (the tell in ux-slop-taxonomy), and never colour
// alone, since the icon and the words carry the tone. `role="alert"` interrupts a screen reader,
// so it is on only when the alert appears in response to something the person just did
// (`announce`); a banner that is simply there on load is a plain region the reader finds in order.

/** Props for `Alert`. */
export type AlertProps = {
  tone: Exclude<Tone, "neutral">;
  /** A short first line, when the sentence needs one: "Export failed". */
  title?: string;
  /** The sentence, in the product's words: what happened and what to do. */
  children: React.ReactNode;
  /** One recovery, a `Button` ("Try again"). */
  action?: React.ReactNode;
  /** It appeared because of something the person just did (a failed submit): announce it at once (`role="alert"`). */
  announce?: boolean;
  className?: string;
};

const tones: Record<Exclude<Tone, "neutral">, { box: string; icon: IconComponent }> = {
  info: { box: "bg-info-subtle text-info", icon: Info },
  success: { box: "bg-success-subtle text-success", icon: CircleCheck },
  warning: { box: "bg-warning-subtle text-warning", icon: TriangleAlert },
  danger: { box: "bg-danger-subtle text-danger", icon: CircleAlert },
};

/** An inline sentence about a problem or a fact, in a tone with an icon, with one optional action. `announce` makes it `role="alert"` for a result of the person's own action. */
export function Alert({ tone, title, children, action, announce = false, className }: AlertProps) {
  const { box, icon: Icon } = tones[tone];
  return (
    <div role={announce ? "alert" : "region"} aria-label={announce ? undefined : title ?? "Notice"} className={cn("flex items-start gap-3 rounded-surface px-3 py-2.5", box, className)}>
      <Icon aria-hidden className="mt-0.5 size-4 shrink-0" />
      <div className="grid min-w-0 flex-1 gap-0.5">
        {title && <p className="type-label">{title}</p>}
        <div className="type-body-sm">{children}</div>
      </div>
      {action && <div className="shrink-0 self-center">{action}</div>}
    </div>
  );
}
