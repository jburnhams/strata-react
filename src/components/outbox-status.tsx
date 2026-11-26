import { CircleAlert, CloudOff, LoaderCircle } from "lucide-react";
import { Button } from "./button";
import { cn } from "../lib/utils";
import { format } from "../lib/format";
import { useOutbox, type Outbox } from "../query/outbox";

// The sign that work is kept on this device and not yet on the server (`createOutbox`). Shaped like
// `SaveStatus`: quiet while all is well, words not a coloured dot, and the bad day said with what is
// still safe.
// - Nothing at all while nothing waits and nothing was refused: the routine case, a write sent in a
//   moment, shows no sign (character by frequency, ux-research `ux-character.md`).
// - Writes waiting: how many, in the app's noun ("3 answers kept on this device"), why ("The server
//   could not be reached."), when it tries again on its own (a clock time, which does not go stale on
//   screen) and "Send now". The count is what a grown-up checks before closing the laptop.
// - A refused write is the one thing a person must hear about, since it will never be sent: each is
//   listed with its label and the server's reason, until dismissed. Announced politely, once.
// - Storage the browser would not give (`persisted` false): said, because closing the page then loses them.
//
// Checked: React Aria has no part for a pending-sync sign; this is text, a button and a live region.

/** Props for `OutboxStatus`. */
export type OutboxStatusProps = {
  outbox: Outbox;
  /** What a write is, singular, for `format.count`: "answer" gives "3 answers kept on this device". */
  noun: string;
  className?: string;
};

/** Says how many writes wait on this device and why, with Send now, and lists any the server refused; renders nothing while all is sent. */
export function OutboxStatus({ outbox, noun, className }: OutboxStatusProps) {
  const s = useOutbox(outbox);
  if (s.waiting === 0 && s.refused.length === 0) return null;
  const count = format.count(s.waiting, noun);
  return (
    <div className={cn("grid gap-2 type-body-sm", className)}>
      {s.waiting > 0 && (
        <p role="status" className="flex flex-wrap items-center gap-x-3 gap-y-1 text-muted-foreground">
          {s.sending ? (
            <LoaderCircle aria-hidden className="size-4 shrink-0 motion-safe:animate-spin" />
          ) : (
            <CloudOff aria-hidden className="size-4 shrink-0" />
          )}
          <span>
            {s.sending ? `Sending ${count}…` : `${count} kept on this device.`}
            {!s.sending && s.problem && ` ${s.problem}`}
            {!s.sending && s.retryAt && ` Trying again at ${format.clock(s.retryAt)}.`}
            {!s.persisted && " They are kept only while this page is open."}
          </span>
          {!s.sending && (
            <Button size="sm" onClick={() => void outbox.flush()}>
              Send now
            </Button>
          )}
        </p>
      )}
      {s.refused.length > 0 && (
        <div role="status" className="grid gap-1 text-danger">
          <p className="flex flex-wrap items-center gap-x-3 gap-y-1">
            <CircleAlert aria-hidden className="size-4 shrink-0" />
            <span>
              {s.refused.length === 1
                ? `The server refused 1 ${noun}; it will not be sent.`
                : `The server refused ${format.count(s.refused.length, noun)}; they will not be sent.`}
            </span>
            <Button size="sm" variant="ghost" onClick={() => outbox.dismiss()}>
              Dismiss
            </Button>
          </p>
          <ul className="grid gap-1 pl-6">
            {s.refused.map((r) => (
              <li key={r.id}>
                {r.label ? `${r.label}: ` : ""}
                {r.reason}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
