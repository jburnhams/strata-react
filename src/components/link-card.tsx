import * as React from "react";
import { Link, type To } from "react-router";
import { ArrowUpRight } from "lucide-react";
import { cn } from "../lib/utils";

// A card that is a way to somewhere: an app on a homepage, a project in a list of projects.
// strata-react issue #25 asked for it after jburnhams/homepage built `AppCard` by hand. A card is
// right here because each destination *is* a separate object a person picks (ux-research
// ui-library/patterns.md §3); a section of a screen is not, and gets space and hairlines instead.
// - The whole card is the target, but it is one link with a short name. The link sits on the
//   title and its `::after` covers the card, so a pointer can press anywhere while a screen reader
//   hears "Kiln log, link" and then the description and status marks as its description, instead
//   of a link named with every word on the card. There is one tab stop per card.
// - Because the whole card is one link, nothing else on it can be interactive (a button or a
//   second link inside a link is invalid and unreachable). `marks` is for `Status` words only.
// - Status marks are words (`Status`), never a coloured dot in a corner.
// - `to` is a route in this app (React Router's `Link`); `href` leaves it (a plain anchor) and is
//   marked with an arrow, so a person knows before pressing that they will leave.
// - Hover and focus change the border and draw the ring around the card, not the title. There is
//   no lift, scale or shadow: elevation is for what floats above the page, and a card on a
//   homepage is pressed many times a day (ux-research ux-character.md, character by frequency).

/** A destination card's props: `to` for a route in this app, or `href` for anywhere else, never both. */
export type LinkCardProps = (
  | {
      /** A route in this app, followed with React Router. */
      to: To;
      href?: undefined;
    }
  | {
      /** Somewhere outside this app; the card shows an arrow. */
      href: string;
      to?: undefined;
    }
) & {
  /** The destination's name, and the link's accessible name. */
  title: string;
  /** One sentence on what is there. Read as the link's description. */
  description?: string;
  /** `Status` words about the destination ("Running", "Updated today"). Nothing interactive. */
  marks?: React.ReactNode;
  /** The title's element. h3 under a section heading; h2 when the cards are the page's sections. */
  as?: "h2" | "h3" | "h4";
  className?: string;
};

/** A destination as a card that is one link: its title is the link's name, the description and status marks are its description, and the whole card is the target. */
export function LinkCard({ title, description, marks, as: Heading = "h3", className, ...destination }: LinkCardProps) {
  const descriptionId = React.useId();
  const marksId = React.useId();
  const describedBy = [description && descriptionId, marks && marksId].filter(Boolean).join(" ") || undefined;
  const linkClass =
    "rounded-control outline-none after:absolute after:inset-0 after:rounded-surface";

  return (
    <div
      className={cn(
        "relative grid content-start gap-1.5 rounded-surface border border-border bg-background p-4 transition-state",
        "hover:border-muted-foreground has-focus-visible:outline-2 has-focus-visible:outline-offset-2 has-focus-visible:outline-ring",
        className,
      )}
    >
      <Heading className="flex items-start justify-between gap-3 type-heading text-foreground">
        {destination.href !== undefined ? (
          <>
            <a href={destination.href} aria-describedby={describedBy} className={linkClass}>
              {title}
            </a>
            <ArrowUpRight aria-hidden className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
          </>
        ) : (
          <Link to={destination.to} aria-describedby={describedBy} className={linkClass}>
            {title}
          </Link>
        )}
      </Heading>
      {description && (
        <p id={descriptionId} className="type-body-sm text-pretty text-muted-foreground">
          {description}
        </p>
      )}
      {marks && (
        <div id={marksId} className="mt-1.5 flex flex-wrap gap-2">
          {marks}
        </div>
      )}
    </div>
  );
}

/** A labelled list of `LinkCard`s in a grid: one column on a phone, up to three on a wide screen. */
export function LinkCardList({ label, children, className }: { label: string; children: React.ReactNode; className?: string }) {
  return (
    <ul aria-label={label} className={cn("grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3", className)}>
      {React.Children.toArray(children).map((child, i) => (
        <li key={React.isValidElement(child) && child.key != null ? child.key : i} className="grid">
          {child}
        </li>
      ))}
    </ul>
  );
}
