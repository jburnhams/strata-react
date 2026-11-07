import * as React from "react";
import { CircleAlert, RotateCcw } from "lucide-react";
import { Button } from "./button";
import { cn } from "../lib/utils";

// Every view of remote data goes through DataView, and DataView will not type-check without a
// skeleton and an empty state. Generated UI renders the happy path; this makes the other three
// states part of the component's signature rather than a review comment.

export type Load<T> =
  | { status: "loading" }
  | { status: "error"; message: string; retry: () => void }
  | { status: "ready"; data: T };

export function DataView<T>({
  state,
  isEmpty,
  skeleton,
  empty,
  children,
  className,
}: {
  state: Load<T>;
  /** When the loaded data counts as empty. For arrays, `(rows) => rows.length === 0`. */
  isEmpty: (data: T) => boolean;
  /** Mirrors the final layout, so nothing jumps when data arrives. Not a centred spinner. */
  skeleton: React.ReactNode;
  /** What goes here and how to add it. An <EmptyState>, not an illustration. */
  empty: React.ReactNode;
  children: (data: T) => React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("min-w-0", className)} aria-busy={state.status === "loading" || undefined}>
      {state.status === "loading" && skeleton}
      {state.status === "error" && (
        <div role="alert" className="flex flex-wrap items-start gap-3 rounded-surface bg-danger-subtle p-4 text-danger">
          <CircleAlert aria-hidden className="mt-0.5 size-5 shrink-0" />
          <p className="min-w-0 flex-1 type-body">{state.message}</p>
          <Button size="sm" onClick={state.retry}>
            <RotateCcw aria-hidden />
            Try again
          </Button>
        </div>
      )}
      {state.status === "ready" && (isEmpty(state.data) ? empty : children(state.data))}
    </div>
  );
}

// An empty state teaches the next action. No illustration slot exists, on purpose.
export function EmptyState({ title, children, action }: { title: string; children?: React.ReactNode; action?: React.ReactNode }) {
  return (
    <div className="grid justify-items-start gap-2 border-y border-border py-6">
      <p className="type-heading">{title}</p>
      {children && <p className="max-w-prose type-body text-muted-foreground">{children}</p>}
      {action && <div className="mt-2">{action}</div>}
    </div>
  );
}

export function Skeleton({ className }: { className?: string }) {
  return <div aria-hidden className={cn("rounded-control bg-muted motion-safe:animate-pulse", className)} />;
}
