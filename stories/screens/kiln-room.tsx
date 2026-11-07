// A whole Operate screen composed from Strata, as a product would write it. The one question:
// "Is my work out of the kiln yet?" The finding: kiln 2 is cooling and will be safe to open at a
// time computed from the readings. Data comes from the API through TanStack Query (useLoad), so
// the stories can put the server into each state with MSW.

import { useQueryClient } from "@tanstack/react-query";
import { CalendarClock, Flame, Layers, Users } from "lucide-react";
import {
  AppShell,
  Button,
  DataTable,
  DataView,
  EmptyState,
  LineChart,
  Metric,
  MetricStrip,
  PageHeader,
  TableSkeleton,
  UndoBar,
  fetchJson,
  format,
  useLoad,
  useUndoable,
  type Column,
} from "../../src";
import { bookingColumns } from "../fixtures/columns";
import {
  NOW_MIN,
  SAFE_TO_OPEN_C,
  heatScale,
  kiln1Shelves,
  minuteToDate,
  planned,
  readings,
  safeAtMin,
  type Booking,
} from "../fixtures/kiln";
import { api } from "../mocks/handlers";

const nav = [
  { to: "/", label: "Kiln room", icon: Flame, end: true },
  { to: "/bookings", label: "Bookings", icon: CalendarClock },
  { to: "/shelves", label: "Shelves", icon: Layers },
  { to: "/members", label: "Members", icon: Users },
];

export function KilnRoomScreen() {
  const load = useLoad({ queryKey: ["bookings"], queryFn: () => fetchJson<Booking[]>(api.bookings) });
  const queryClient = useQueryClient();
  const undoable = useUndoable();

  // The hook owns which rows are out of view, through Undo, a failed withdrawal, and the refetch.
  const rows = load.status === "ready" ? load.data.filter((b) => !undoable.isRemoved(b.id)) : [];
  const inKiln2 = rows.filter((b) => b.kiln === 2 && b.state === "cooling");
  const pieces = inKiln2.reduce((n, b) => n + b.pieces, 0);
  const now = readings[readings.length - 1];
  const safeAt = format.clock.format(minuteToDate(safeAtMin));

  const columns: Column<Booking>[] = [
    ...bookingColumns,
    {
      key: "action",
      header: "",
      cell: (b) =>
        b.state === "booked" ? (
          <Button
            size="sm"
            variant="ghost"
            onClick={() =>
              undoable.schedule({
                id: b.id,
                message: `Withdrew ${b.member}'s ${format.count(b.pieces, "piece")} from kiln ${b.kiln}.`,
                failure: `${b.member}'s booking is back in kiln ${b.kiln}: the withdrawal did not go through.`,
                commit: async () => {
                  await fetchJson(`${api.bookings}/${b.id}`, { method: "DELETE" });
                  await queryClient.invalidateQueries({ queryKey: ["bookings"] });
                },
              })
            }
          >
            Withdraw
          </Button>
        ) : null,
    },
  ];

  return (
    <AppShell product="Back Lane Clay" nav={nav}>
      <div className="grid max-w-6xl gap-8 pb-16">
        <PageHeader
          title="Kiln room"
          scope={`${format.day.format(minuteToDate(NOW_MIN))}, ${format.clock.format(minuteToDate(NOW_MIN))}`}
          actions={<Button variant="default">Book a firing</Button>}
          finding={{
            text:
              load.status === "ready"
                ? `Kiln 2 is cooling at ${format.celsius(now.y)} and will be safe to open at about ${safeAt}. ${format.count(pieces, "piece")} from ${format.count(inKiln2.length, "member")} are inside.`
                : `Kiln 2 is cooling at ${format.celsius(now.y)} and will be safe to open at about ${safeAt}.`,
            action: <Button size="sm">Tell me when it's open</Button>,
          }}
        />
        <MetricStrip label="Kiln room now">
          <Metric label="Kiln 2 temperature" value={format.integer.format(now.y)} unit="°C" note={`Safe to open below ${format.celsius(SAFE_TO_OPEN_C)}`} />
          <Metric label="Pieces waiting in kiln 2" value={load.status === "ready" ? format.integer.format(pieces) : "–"} note="Summed from the table below" />
          <Metric
            label="Shelves free in Friday's bisque"
            value={format.integer.format(kiln1Shelves.total - kiln1Shelves.booked)}
            unit={`of ${kiln1Shelves.total}`}
            note="Book by 17:00 on Thursday"
          />
        </MetricStrip>
        <section className="grid gap-3">
          <h2 className="type-heading">Kiln 2's glaze firing</h2>
          <LineChart
            label="Kiln 2 temperature since 08:00 Wednesday"
            series={readings}
            seriesLabel="Measured"
            planned={planned}
            plannedLabel="Programmed"
            band={{ below: SAFE_TO_OPEN_C, label: `Safe to open below ${format.celsius(SAFE_TO_OPEN_C)}` }}
            colourScale={heatScale}
            colourScaleLabel="coloured as the kiln glows"
            formatX={(m) => format.shortDay.format(minuteToDate(m))}
            formatY={(t) => format.celsius(t)}
            xTicks={Array.from({ length: Math.floor(NOW_MIN / 360) + 1 }, (_, i) => i * 360)}
          />
        </section>
        <section className="grid gap-3">
          <h2 className="type-heading">Work in the kilns</h2>
          <DataView
            state={load}
            isEmpty={(r) => r.length === 0}
            skeleton={<TableSkeleton rows={4} columns={6} />}
            empty={
              <EmptyState title="All three kilns are cold" action={<Button>Book a firing</Button>}>
                Nothing is booked, firing or cooling.
              </EmptyState>
            }
          >
            {() => <DataTable caption="Work in the kilns" columns={columns} rows={rows} rowKey={(b) => b.id} sortParam="sort" />}
          </DataView>
        </section>
      </div>
      <UndoBar undoable={undoable} />
    </AppShell>
  );
}
