import * as React from "react";
import { TriangleAlert, X } from "lucide-react";
import { Button, IconButton } from "./button";
import { toastTimeout } from "./toast";
import { cn } from "../lib/utils";
import { overlaySurface } from "../lib/overlay";

// The app-level ToastRegion uses React Aria's queue, which removes a toast immediately on close.
// A player warning stays in its own fullscreen subtree through its exit animation. It uses the
// shared toast timing and React Aria buttons, with a polite status region for the message.

/** A brief, non-blocking playback warning. Important playback failures use the player's error state. */
export type PlayerWarning = {
  title: string;
  description?: string;
  /** Milliseconds on screen. Defaults to the shared toast reading time. */
  timeout?: number;
  action?: { label: string; onPress: () => void };
};

/** The current warning event, including its identity so repeated warnings start a fresh timer. */
export type PlayerWarningEvent = PlayerWarning & { key: number };

/** Creates a warning channel for one player. Pass `warning` to MediaPlayer and call `warn` when a warning occurs. */
export function usePlayerWarnings() {
  const [warning, setWarning] = React.useState<PlayerWarningEvent>();
  const next = React.useRef(0);
  const warn = React.useCallback((message: PlayerWarning) => setWarning({ ...message, key: ++next.current }), []);
  return { warning, warn };
}

export function PlayerWarningToast({ warning }: { warning: PlayerWarning }) {
  const [phase, setPhase] = React.useState<"visible" | "leaving" | "gone">("visible");
  const titleId = React.useId();
  const delay = toastTimeout(warning);
  const dismiss = () => setPhase("leaving");
  React.useEffect(() => {
    if (phase !== "visible") return;
    const id = setTimeout(() => setPhase("leaving"), delay);
    return () => clearTimeout(id);
  }, [delay, phase]);

  React.useEffect(() => {
    if (phase !== "leaving") return;
    // The animation may be disabled by the host or by browser test tooling.
    const id = setTimeout(() => setPhase("gone"), 250);
    return () => clearTimeout(id);
  }, [phase]);

  if (phase === "gone") return null;
  return (
    <div
      className={cn("player-warning pointer-events-auto flex w-full max-w-sm items-start gap-3 p-3", overlaySurface)}
      role="group"
      aria-labelledby={titleId}
      data-leaving={phase === "leaving" || undefined}
      inert={phase === "leaving"}
      onAnimationEnd={(event) => {
        if (event.target === event.currentTarget && phase === "leaving" && event.animationName === "strata-player-warning-out") setPhase("gone");
      }}
    >
      <TriangleAlert aria-hidden className="mt-0.5 size-4 shrink-0 text-warning" />
      <div className="grid min-w-0 flex-1 justify-items-start gap-2">
        <div role="status" className="grid min-w-0 gap-0.5">
          <strong id={titleId} className="type-label">{warning.title}</strong>
          {warning.description && <span className="type-body-sm text-muted-foreground">{warning.description}</span>}
        </div>
        {warning.action && (
          <Button size="sm" onPress={() => { warning.action?.onPress(); dismiss(); }}>
            {warning.action.label}
          </Button>
        )}
      </div>
      <IconButton size="sm" variant="ghost" icon={X} label="Dismiss playback warning" onPress={dismiss} />
    </div>
  );
}
