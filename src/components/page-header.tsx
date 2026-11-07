import * as React from "react";

// The top of every Operate screen: a noun title at 24px (never "Welcome back"), its scope, the
// screen's main action, and the finding. The finding is the one fact in today's data that most
// needs attention; it sits where it is read first, beside the action it drives.

export function PageHeader({
  title,
  scope,
  actions,
  finding,
  as: Heading = "h1",
}: {
  title: string;
  /** The title's element: h1 on a screen, h2 where the header is shown inside another page. */
  as?: "h1" | "h2";
  /** What the screen covers: a date, a range, a filter. */
  scope?: React.ReactNode;
  actions?: React.ReactNode;
  finding?: { text: React.ReactNode; action?: React.ReactNode };
}) {
  return (
    <header className="grid gap-4">
      <div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-3">
        <div className="grid min-w-0 gap-0.5">
          <Heading className="type-title text-balance">{title}</Heading>
          {scope && <p className="type-body-sm text-muted-foreground">{scope}</p>}
        </div>
        {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
      </div>
      {finding && (
        <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-3 border-y border-border py-3">
          <p className="max-w-prose min-w-0 type-body text-pretty">{finding.text}</p>
          {finding.action}
        </div>
      )}
    </header>
  );
}
