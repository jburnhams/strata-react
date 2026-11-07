// A triage screen composed from Strata, as a product would write it: the technician checks each
// booking before loading the kilns, approving it or returning it to the member. The one question:
// "Which bookings still need checking?" The finding: how many are left, and how many pieces that
// is. It is worked from the keyboard (j/k to move, a to approve, r to return, z to undo), and the
// same shortcut list drives the handler and the legend. Answers are reversible, so they take
// effect at once with Undo (useUndoable), not behind a confirm dialog. Data comes through
// useLoad → DataView, so the stories put the server into each state with MSW.

import * as React from "react";
import {
  ActiveList,
  Button,
  DataView,
  EmptyState,
  KeysLegend,
  PageHeader,
  Skeleton,
  UndoBar,
  fetchJson,
  format,
  useActiveItem,
  useHotkeys,
  useLoad,
  useUndoable,
  type Shortcut,
} from "../../src";
import { glazeNames, type Booking } from "../fixtures/kiln";
import { api } from "../mocks/handlers";

export function ReviewBookingsScreen({ initial }: { initial?: string }) {
  const load = useLoad({ queryKey: ["bookings"], queryFn: () => fetchJson<Booking[]>(api.bookings) });
  const [answered, setAnswered] = React.useState<Set<string>>(new Set());
  const { pending, schedule, undo } = useUndoable();

  const queue = load.status === "ready" ? load.data.filter((b) => !answered.has(b.id)) : [];
  const active = useActiveItem(queue, (b) => b.id, { initial, noun: "booking" });
  const pieces = queue.reduce((n, b) => n + b.pieces, 0);

  const answer = (b: Booking | null, verb: "Approved" | "Returned") => {
    if (!b) return;
    setAnswered((s) => new Set(s).add(b.id));
    const what = `${b.member}'s ${format.count(b.pieces, "piece")}`;
    schedule({
      id: b.id,
      message: verb === "Approved" ? `Approved ${what}.` : `Returned ${what} to them.`,
      commit: () => undefined, // the product's mutation goes here
    });
  };
  const restore = () => {
    if (!pending) return;
    setAnswered((s) => {
      const n = new Set(s);
      n.delete(pending.id);
      return n;
    });
    undo();
  };

  const nothing = active.activeItem === null;
  const shortcuts: Shortcut[] = [
    ...active.shortcuts,
    { keys: ["a"], label: "Approve", run: () => answer(active.activeItem, "Approved"), disabled: nothing },
    { keys: ["r"], label: "Return to member", run: () => answer(active.activeItem, "Returned"), disabled: nothing },
    { keys: ["z"], label: "Undo", run: restore, disabled: !pending },
  ];
  useHotkeys(shortcuts);

  return (
    <main className="mx-auto grid max-w-3xl gap-6 p-6 pb-24">
      <PageHeader
        title="Bookings to check"
        scope="Before loading, Thursday 5 November"
        finding={
          load.status === "ready" && queue.length > 0
            ? { text: `${format.count(queue.length, "booking")} left to check, ${format.count(pieces, "piece")} in all.` }
            : undefined
        }
      />
      <DataView
        state={load}
        isEmpty={() => queue.length === 0}
        skeleton={
          <div className="grid gap-px">
            {Array.from({ length: 5 }, (_, i) => (
              <Skeleton key={i} className="h-14" />
            ))}
          </div>
        }
        empty={
          <EmptyState title="Every booking is checked">
            New bookings appear here as members make them. Load the kilns from the kiln room.
          </EmptyState>
        }
      >
        {() => (
          <ActiveList label="Bookings to check" active={active} empty={null}>
            {(b) => (
              <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-2">
                <div className="grid min-w-0 gap-0.5">
                  <p className="type-label">{b.member}</p>
                  <p className="type-body-sm text-muted-foreground">
                    {format.count(b.pieces, "piece")}, {b.firing}, {glazeNames[b.glaze]}, kiln {b.kiln}
                  </p>
                </div>
                <div className="flex gap-2">
                  <Button size="sm" onClick={() => answer(b, "Approved")}>
                    Approve
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => answer(b, "Returned")}>
                    Return
                  </Button>
                </div>
              </div>
            )}
          </ActiveList>
        )}
      </DataView>
      {load.status === "ready" && queue.length > 0 && <KeysLegend shortcuts={shortcuts} />}
      <UndoBar pending={pending} onUndo={restore} />
    </main>
  );
}
