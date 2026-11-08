// A whole History screen composed from Strata. The one question: "How did my work come out of
// the last firings?" The finding: how many pieces came out cracked or crazed across the firings
// shown. Each firing is a table row that opens to show whose work was in it; that detail is its
// own request (`/api/firings/:id/work`), made only when the row is opened, and the open rows are
// in the URL (?open=f-0411), so a member can send a link to one firing's results.

import { CalendarClock, Check, Flame, Layers, TriangleAlert, Users } from "lucide-react";
import {
  AppShell,
  DataTable,
  DataView,
  EmptyState,
  PageHeader,
  Skeleton,
  Status,
  TableSkeleton,
  fetchJson,
  format,
  useExpanded,
  useLoad,
  type Column,
  type IconComponent,
  type Tone,
} from "../../src";
import { firedWork, firingTypes, firings, glazeNames, kilns, minuteToDate, type FiredWork, type Firing, type Outcome } from "../fixtures/kiln";
import { api, type FiringPage } from "../mocks/handlers";

const nav = [
  { to: "/", label: "Kiln room", icon: Flame, end: true },
  { to: "/bookings", label: "Bookings", icon: CalendarClock },
  { to: "/firings", label: "Firings", icon: Layers },
  { to: "/members", label: "Members", icon: Users },
];

const outcomes: Record<Outcome, { tone: Tone; icon: IconComponent; label: string }> = {
  whole: { tone: "success", icon: Check, label: "Came out whole" },
  crazed: { tone: "warning", icon: TriangleAlert, label: "Crazed" },
  cracked: { tone: "danger", icon: TriangleAlert, label: "Cracked" },
};

const firingName = (f: Firing) => `${firingTypes[f.type].label} in ${kilns[f.kiln].name.split(",")[0]}`;

const columns: Column<Firing>[] = [
  { key: "ended", header: "Ended", cell: (f) => format.shortDay.format(minuteToDate(f.endedMin)), className: "whitespace-nowrap" },
  { key: "firing", header: "Firing", cell: firingName, truncate: true },
  { key: "pieces", header: "Pieces", cell: (f) => format.integer(f.pieces), numeric: true },
  { key: "peak", header: "Peak", cell: (f) => format.celsius(f.peakC), numeric: true },
];

/** Mirrors the detail's rows, so the open row does not jump when the work arrives. */
function WorkSkeleton() {
  return (
    <div aria-hidden className="grid max-w-xl">
      {Array.from({ length: 3 }, (_, i) => (
        <div key={i} className="flex items-center gap-4 py-1.5">
          <Skeleton className="h-3.5 flex-1" />
          <Skeleton className="h-3.5 w-16" />
          <Skeleton className="h-3.5 w-28" />
        </div>
      ))}
    </div>
  );
}

/** Whose work was in one firing. Its own request, made when the firing's row (or Disclosure) opens. */
export function FiringWork({ firing }: { firing: Firing }) {
  const load = useLoad({ queryKey: ["firings", firing.id, "work"], queryFn: () => fetchJson<FiredWork[]>(api.firingWork(firing.id)) });
  return (
    <DataView
      state={load}
      isEmpty={(work) => work.length === 0}
      skeleton={<WorkSkeleton />}
      empty={<p className="type-body-sm text-muted-foreground">Nothing was recorded in this firing. Test firings are logged empty.</p>}
    >
      {(work) => (
        <ul aria-label={`Work in ${firingName(firing)}`} className="grid max-w-xl type-body-sm">
          {work.map((w) => {
            const o = outcomes[w.outcome];
            return (
              <li key={w.id} className="flex items-center gap-4 py-1.5">
                <span className="min-w-0 flex-1 truncate">
                  {w.member}, {glazeNames[w.glaze].toLowerCase()}
                </span>
                <span className="w-16 text-right tabular-nums">{format.count(w.pieces, "piece")}</span>
                <span className="w-32">
                  <Status tone={o.tone} icon={o.icon}>
                    {o.label}
                  </Status>
                </span>
              </li>
            );
          })}
        </ul>
      )}
    </DataView>
  );
}

export function FiringHistoryScreen() {
  const load = useLoad({
    queryKey: ["firings", "recent"],
    queryFn: () => fetchJson<FiringPage>(`${api.firings}?limit=8`).then((p) => p.firings),
  });
  const expanded = useExpanded({ param: "open" });

  // The finding is counted from the fixture here so the header does not wait on eight detail
  // requests; a real API would return the count with the firings.
  const shown = load.status === "ready" ? load.data : firings.slice(0, 8);
  const flawed = shown.flatMap(firedWork).filter((w) => w.outcome !== "whole").reduce((n, w) => n + w.pieces, 0);

  return (
    <AppShell product="Back Lane Clay" nav={nav}>
      <div className="grid max-w-5xl gap-8 pb-16">
        <PageHeader
          title="Firings"
          scope="The last eight firings"
          finding={{ text: `${format.count(flawed, "piece")} came out cracked or crazed. Open a firing to see whose.` }}
        />
        <DataView
          state={load}
          isEmpty={(f) => f.length === 0}
          skeleton={<TableSkeleton rows={8} columns={5} />}
          empty={<EmptyState title="No firings yet">Each firing is logged here when its kiln cools below 200 °C.</EmptyState>}
        >
          {(rows) => (
            <DataTable
              caption="The last eight firings"
              columns={columns}
              rows={rows}
              rowKey={(f) => f.id}
              expansion={{ ...expanded, rowLabel: (f) => `Work in ${firingName(f)}, ${format.shortDay.format(minuteToDate(f.endedMin))}`, detail: (f) => <FiringWork firing={f} /> }}
            />
          )}
        </DataView>
      </div>
    </AppShell>
  );
}
