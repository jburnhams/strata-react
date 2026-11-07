import * as React from "react";
import { Check } from "lucide-react";
import { cn } from "../lib/utils";

// The completion moment: what a person sees after finishing something that took effort (a
// booking, a submission, an import). It is the one place on an Operate product where the library
// spends its delight budget (character.md §3), so it is a component with rules rather than a
// confetti call:
// - `title` says what happened, in the past tense, with the object: "Booked: 6 pieces in kiln 2".
// - `next` is required. A finish that does not say what happens now is a dead end, however
//   pleasant.
// - `figure` is optional and must be drawn from the person's own data in the subject's terms
//   (their pieces on a shelf, their route on a map), never a stock illustration.
// - The part of the figure that is the person's result enters once, with the `enter-moment`
//   utility (500ms, hard ease-out, no overshoot): their pieces set down on the shelf. Reduced
//   motion makes it instant. Nothing loops and nothing plays a sound.
// - Focus moves to the heading on mount, so keyboard and screen-reader users land on the result.

export function Done({
  title,
  next,
  figure,
  actions,
  focusOnMount = true,
  className,
}: {
  /** What happened, past tense, with its object. */
  title: string;
  /** What the person does now, or what happens next and when. */
  next: React.ReactNode;
  /** A drawing of the result made from the person's data in the subject's own terms. */
  figure?: React.ReactNode;
  actions?: React.ReactNode;
  /** Off only where the result is not the page's subject (the state-matrix page). */
  focusOnMount?: boolean;
  className?: string;
}) {
  const heading = React.useRef<HTMLHeadingElement>(null);
  const titleId = React.useId();
  React.useEffect(() => {
    if (focusOnMount) heading.current?.focus();
  }, [focusOnMount]);
  return (
    <section aria-labelledby={titleId} className={cn("grid gap-5", className)}>
      <div className="grid gap-2">
        <h1 id={titleId} ref={heading} tabIndex={-1} className="flex items-start gap-2 type-title">
          <Check aria-hidden className="mt-1 size-6 shrink-0 text-success" />
          {title}
        </h1>
        <div className="max-w-prose type-body text-muted-foreground">{next}</div>
      </div>
      {figure}
      {actions && <div className="flex flex-wrap items-center gap-3">{actions}</div>}
    </section>
  );
}
