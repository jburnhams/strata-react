import { Pause } from "lucide-react";
import { format } from "../lib/format";
import { cn } from "../lib/utils";
import type { Poll } from "../query/poll";
import { Toggle } from "./toggle";

// The control of a screen that re-reads on its own (strata-react issue #344): one button to stop the
// view moving, and the time it was last read. Both come from the `Poll` that `useLoad({ poll })`
// uses, so a screen writes neither the state nor the line.
// - The button's name is fixed, "Pause updates", and it is pressed while paused (`Toggle`,
//   `aria-pressed`). A name that changes to "Resume updates" *and* is pressed reads as the opposite
//   to a screen reader ("Resume updates, pressed"); one name with a pressed state says what the
//   button does and what is so now. The words beside it carry the state for everyone else.
// - The line reads "Updated 12:00" while it runs and "Paused. Last updated 12:00" while it is paused,
//   in a polite `status` that is not announced on every read: it changes text on each poll, so it is
//   `aria-live="off"` and the person finds it by reading, not by being told every five seconds.
// - Not a filled button: it acts on the view, like the other toggles, so it never takes the view's
//   one filled button (patterns.md §2).

/** The pause control of a polled screen: a "Pause updates" toggle and when the readings were last taken ("Updated 12:00"). Takes the `Poll` from `usePoll`. */
export function PauseButton({ poll, hideUpdated = false, className }: { poll: Poll; hideUpdated?: boolean; className?: string }) {
  const when = poll.updatedAt ? format.clock(poll.updatedAt) : null;
  return (
    <div className={cn("inline-flex flex-wrap items-center gap-x-3 gap-y-1", className)}>
      {!hideUpdated && (
        <span role="status" aria-live="off" className="type-caption text-muted-foreground tabular-nums">
          {poll.paused ? (when ? `Paused. Last updated ${when}` : "Paused") : when ? `Updated ${when}` : "Not read yet"}
        </span>
      )}
      <Toggle label="Pause updates" icon={Pause} size="sm" pressed={poll.paused} onChange={() => poll.toggle()} />
    </div>
  );
}
