import * as React from "react";
import { Eye } from "lucide-react";
import { useCountdown } from "../lib/countdown";
import { cn } from "../lib/utils";
import { Button } from "./button";

// Something shown for a moment and then hidden: Flashtap's "How many did you see?", where a few pictures are
// seen too briefly to count one by one, so a right answer is evidence of seeing how many at a glance. Its owner
// (2026-11-28) asked for a 3-2-1 before the pictures come, a timer while they are up, the pictures again after
// every wrong answer, and a one-tap "look again" that goes once used, with how long they stay and how many looks
// again are allowed set by the app's difficulty. Shaped that way because:
// - A countdown first (`count`, 3 by default): a learner looking at the answer tiles would otherwise miss a short
//   look entirely. Every look counts down, the first, one after a wrong answer (`again`) and one asked for
//   (`peeks`), since each time the eyes are somewhere else when it starts. The number is drawn, not spoken: the
//   app is usually saying the question then.
// - The time left is drawn as a bar as wide as the content that empties (`drain`, linear, as time is), so a
//   learner sees it is going before it goes. Under reduced motion the bar is empty at once; the content still hides on time.
// - Everything stays in one cell of a grid, each part kept (invisible, and inert where it can be pressed) when not
//   in use: the content, the count and, once offered, the look-again button. So the box never changes size and the
//   tiles under it never jump, even when the content is smaller than the button (Codex on #411).
// - Looks again are counted here, not by the app, so the button cannot be offered twice for one look; the app
//   lowers `peeks` (to 0 once the round is over) and the button goes.
// - A screen reader hears "Get ready" (`ready`) as the count starts and the `gone` sentence when it hides; the
//   content itself is the app's to label (a row of emoji is usually `aria-hidden`).
// - `onLook` tells the app each look as it starts showing, with why, so it can record looks as evidence.

/** Why a `Glimpse` is showing: its first look, one the app asked for (`again`) or a look again the person asked for. */
export type GlimpseWhy = "first" | "again" | "peek";

/** One look of a `Glimpse`: counted from 1 and why it came. */
export type GlimpseLook = { n: number; why: GlimpseWhy };

/** Props of `Glimpse`. */
export type GlimpseProps = {
  /** What is shown for a moment. */
  children: React.ReactNode;
  /** How long each look shows it, in milliseconds. */
  ms: number;
  /** Seconds counted down before each look (3 by default); 0 shows it at once. */
  count?: number;
  /** Change it (a counter) to show it again, with the count and the timer: after a wrong answer, say. */
  again?: number;
  /** Looks again the person may ask for once it has gone (0 by default); the button goes when they are used. */
  peeks?: number;
  /** The button's words ("Look again"). */
  peekLabel?: string;
  /** Said to a screen reader as the count starts ("Get ready to look."). */
  ready?: string;
  /** Said to a screen reader when it hides: "The pictures have gone." */
  gone: string;
  /** Each look, as it starts showing. */
  onLook?: (look: GlimpseLook) => void;
  className?: string;
};

type Phase = "counting" | "showing" | "gone";

/** Shows its content for `ms` after a 3-2-1, with a bar that empties as the time goes, then hides it, keeping its room; shown again when `again` changes, and `peeks` looks again on a button that goes once used. */
export function Glimpse({
  children,
  ms,
  count = 3,
  again = 0,
  peeks = 0,
  peekLabel = "Look again",
  ready = "Get ready to look.",
  gone,
  onLook,
  className,
}: GlimpseProps) {
  const first: Phase = count > 0 ? "counting" : "showing";
  const [phase, setPhase] = React.useState<Phase>(first);
  const [look, setLook] = React.useState<GlimpseLook>({ n: 1, why: "first" });
  const [used, setUsed] = React.useState(0);
  const start = (why: GlimpseWhy) => {
    setLook((l) => ({ n: l.n + 1, why }));
    setPhase(first);
  };
  // A new `again` starts a look in this render, so the frame that answers a wrong tap already counts down.
  const [seenAgain, setSeenAgain] = React.useState(again);
  if (again !== seenAgain) {
    setSeenAgain(again);
    start("again");
  }
  // Keyed by the look, so a new look that starts while one is still counting (`again` changes) counts from the top.
  const left = useCountdown(phase === "counting", count, () => setPhase("showing"), look.n);
  // Once looks again have been offered, the button's room stays, so the box does not shrink when the app takes them away.
  const [offered, setOffered] = React.useState(peeks > 0);
  if (peeks > 0 && !offered) setOffered(true);
  const latest = React.useRef(onLook);
  React.useEffect(() => {
    latest.current = onLook;
  });
  React.useEffect(() => {
    if (phase !== "showing") return;
    latest.current?.(look);
    const t = setTimeout(() => setPhase("gone"), ms);
    return () => clearTimeout(t);
  }, [phase, look, ms]);
  const canPeek = phase === "gone" && used < peeks;
  const said = phase === "counting" ? ready : phase === "gone" ? gone : "";
  return (
    <div data-glimpse={phase} className={cn("grid justify-items-center", className)}>
      {/* As wide as the content, so the bar under it is too. */}
      <div className="grid gap-3">
        <div className="grid place-items-center">
          <div className={cn("col-start-1 row-start-1", phase !== "showing" && "invisible")}>{children}</div>
          {/* The count and the button always hold their room (invisible, inert, hidden from the accessibility tree when
              not in use), so content smaller than either never makes the box grow or shrink between phases. */}
          {count > 0 && (
            <span
              aria-hidden
              data-countdown={left !== null || undefined}
              className={cn(
                "col-start-1 row-start-1 type-picture tabular-nums text-muted-foreground",
                left === null && "invisible",
              )}
            >
              {left ?? count}
            </span>
          )}
          {offered && (
            <div
              className={cn("col-start-1 row-start-1", !canPeek && "invisible")}
              aria-hidden={!canPeek || undefined}
              inert={!canPeek || undefined}
            >
              <Button
                onPress={() => {
                  setUsed((u) => u + 1);
                  start("peek");
                }}
              >
                <Eye aria-hidden />
                {peekLabel}
              </Button>
            </div>
          )}
        </div>
        <div
          aria-hidden
          className={cn("h-2 w-full overflow-hidden rounded-pill bg-muted", phase !== "showing" && "invisible")}
        >
          {phase === "showing" && (
            <div
              key={look.n}
              data-time-left
              className="drain h-full bg-primary"
              style={{ "--drain-ms": `${ms}ms` } as React.CSSProperties}
            />
          )}
        </div>
      </div>
      <span role="status" className="sr-only">
        {said}
      </span>
    </div>
  );
}
