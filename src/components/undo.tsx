import * as React from "react";
import { Button } from "./button";

// Destructive actions take effect visibly at once and commit after a window, with Undo in reach.
// For reversible removals this beats a confirm dialog: the dialog interrupts every time to protect
// against the rare mistake, and people learn to click through it. Keep a confirm dialog for
// actions that cannot be undone (deleting an account, firing a kiln).

type Pending = { id: string; message: string; commit: () => void };

export function useUndoable(windowMs = 8000) {
  const [pending, setPending] = React.useState<Pending | null>(null);
  const current = React.useRef<Pending | null>(null);
  const timer = React.useRef<number | undefined>(undefined);

  const set = React.useCallback((p: Pending | null) => {
    current.current = p;
    setPending(p);
  }, []);

  const schedule = React.useCallback(
    (next: Pending) => {
      window.clearTimeout(timer.current);
      current.current?.commit(); // a second removal commits the first
      set(next);
      timer.current = window.setTimeout(() => {
        current.current?.commit();
        set(null);
      }, windowMs);
    },
    [set, windowMs],
  );

  const undo = React.useCallback(() => {
    window.clearTimeout(timer.current);
    set(null);
  }, [set]);

  React.useEffect(() => () => window.clearTimeout(timer.current), []);
  return { pending, schedule, undo };
}

// The bar lives in a polite live region that is always mounted, so screen readers hear the message
// when it appears. It is fixed to the bottom of the viewport; a page that uses it keeps that much
// bottom padding so the bar never covers the focused row.
export function UndoBar({
  pending,
  onUndo,
  inline = false,
}: {
  pending: Pending | null;
  onUndo: () => void;
  /** Render in the flow instead of fixed to the viewport; for the state-matrix page. */
  inline?: boolean;
}) {
  return (
    <div
      aria-live="polite"
      className={
        inline ? "flex" : "pointer-events-none fixed inset-x-0 bottom-4 z-50 flex justify-center px-4"
      }
    >
      {pending && (
        <div className="pointer-events-auto flex max-w-lg items-center gap-4 rounded-overlay bg-foreground py-2 pr-2 pl-4 text-background shadow-overlay">
          <p className="min-w-0 type-body-sm">{pending.message}</p>
          <Button size="sm" variant="ghost" className="text-background hover:bg-neutral-11" onClick={onUndo}>
            Undo
          </Button>
        </div>
      )}
    </div>
  );
}
