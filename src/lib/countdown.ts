import * as React from "react";

// A whole-second count down, for the 3-2-1 before something happens by itself: Flashtap's Next, which
// moves on to the next round, and `Glimpse`, which shows its pictures after it. It came from Flashtap
// (its PlayScreen kept the same hook) once a second screen needed it.
// - The count is reset in render when it starts (React's "adjust state on a prop change"), not in the
//   effect, so the first frame of a second run draws its first number, never the last run's 1.
// - `onDone` is read through a ref, so a caller's new function on each render does not restart it.
// - It returns null while it is not counting, so a caller cannot draw a stale number by mistake.

/**
 * Counts down `seconds` whole seconds while `running`, then calls `onDone` once: the seconds left (never below 1), or
 * null when not counting (not running, or 0 seconds: the caller waits for a tap instead). Running false and true again
 * starts again from `seconds`.
 */
export function useCountdown(running: boolean, seconds: number, onDone: () => void): number | null {
  const counting = running && seconds > 0;
  const [left, setLeft] = React.useState(seconds);
  const [was, setWas] = React.useState(false);
  if (counting !== was) {
    setWas(counting);
    if (counting) setLeft(seconds);
  }
  const latest = React.useRef(onDone);
  React.useEffect(() => {
    latest.current = onDone;
  });
  React.useEffect(() => {
    if (!counting) return;
    let n = seconds;
    const t = setInterval(() => {
      n -= 1;
      setLeft(n);
      if (n <= 0) {
        clearInterval(t);
        latest.current();
      }
    }, 1000);
    return () => clearInterval(t);
  }, [counting, seconds]);
  return counting ? Math.max(left, 1) : null;
}
