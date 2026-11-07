// A status dashboard composed from Strata, as a homepage for a small server would be written
// (strata-react issue #25, from jburnhams/homepage). The one question: "Is anything on the studio
// server about to need me?" The finding: the disk that is past a threshold, with how much is left
// and what to do. Then the next questions in order: are the apps up (cards that go to each), which
// disk is filling (meters with thresholds, in a table), and where the memory is (a composition
// bar with its table). There is no settings page, so the colour scheme is the compact choice in
// the header.

import {
  ColorSchemeChoice,
  CompositionBar,
  DataTable,
  DataView,
  EmptyState,
  LinkCard,
  LinkCardList,
  Meter,
  PageHeader,
  Skeleton,
  Status,
  crossedThreshold,
  fetchJson,
  format,
  useLoad,
  type Column,
  type Tone,
} from "../../src";
import { diskThresholds, type App, type Disk, type ServerStatus } from "../fixtures/server";
import { api } from "../mocks/handlers";

const appTone: Record<App["state"], { tone: Tone; word: string }> = {
  running: { tone: "success", word: "Running" },
  updating: { tone: "info", word: "Updating" },
  stopped: { tone: "danger", word: "Stopped" },
};

/** "431 GB of 466 GB": both figures in the larger one's unit, so they read as one comparison. */
const ofSize = (used: number, size: number) => {
  const unit = format.byteUnit(size);
  return `${format.bytes(used, unit)} of ${format.bytes(size, unit)}`;
};

const diskColumns: Column<Disk>[] = [
  {
    key: "disk",
    header: "Disk",
    cell: (d) => (
      <span className="grid">
        <span className="font-mono">{d.mount}</span>
        <span className="text-muted-foreground">{d.purpose}</span>
      </span>
    ),
  },
  {
    key: "space",
    header: "Space used",
    className: "w-1/2",
    cell: (d) => (
      <Meter
        label={`${d.mount} space used`}
        hideLabel
        value={d.used}
        max={d.size}
        thresholds={diskThresholds}
        detail={ofSize(d.used, d.size)}
      />
    ),
  },
  { key: "free", header: "Free", numeric: true, cell: (d) => format.bytes(d.size - d.used), sort: (a, b) => a.size - a.used - (b.size - b.used) },
];

function Finding({ disks }: { disks: Disk[] }) {
  const worst = [...disks].sort((a, b) => b.used / b.size - a.used / a.size)[0];
  const share = worst.used / worst.size;
  const crossed = crossedThreshold(share, diskThresholds);
  if (!crossed) return <>Every disk has room: the fullest, {worst.mount}, is {format.percent(share)} used.</>;
  return (
    <>
      {worst.mount} ({worst.purpose.toLowerCase()}) is {format.percent(share)} full, with {format.bytes(worst.size - worst.used)} left.
      Move last year&apos;s photos to the backup disk before the spring glaze tests.
    </>
  );
}

function DashboardSkeleton() {
  return (
    <div className="grid gap-10">
      <Skeleton className="h-12 w-full" />
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {[0, 1, 2].map((i) => (
          <Skeleton key={i} className="h-32" />
        ))}
      </div>
      <Skeleton className="h-40 w-full" />
    </div>
  );
}

export function StudioServerScreen() {
  const load = useLoad({ queryKey: ["server"], queryFn: () => fetchJson<ServerStatus>(api.server) });

  return (
    <main className="mx-auto grid max-w-5xl gap-10 px-4 py-8 sm:px-8">
      <PageHeader
        title="Studio server"
        scope="kilnroom-office · checked every minute"
        actions={<ColorSchemeChoice compact />}
        finding={load.status === "ready" ? { text: <Finding disks={load.data.disks} /> } : undefined}
      />
      <DataView
        state={load}
        isEmpty={(s) => s.apps.length === 0 && s.disks.length === 0}
        skeleton={<DashboardSkeleton />}
        empty={<EmptyState title="The status agent has nothing to report">Start it on the server with <code className="font-mono">systemctl start status-agent</code>.</EmptyState>}
      >
        {(s) => (
          <div className="grid gap-10">
            <section aria-labelledby="apps" className="grid gap-3">
              <h2 id="apps" className="type-heading">
                Apps
              </h2>
              <LinkCardList label="Apps on this server">
                {s.apps.map((app) => {
                  const state = appTone[app.state];
                  const marks = (
                    <>
                      <Status tone={state.tone}>{state.word}</Status>
                      <span className="type-caption text-muted-foreground">{app.updated}</span>
                    </>
                  );
                  return app.external ? (
                    <LinkCard key={app.id} href={app.path} title={app.name} description={app.description} marks={marks} />
                  ) : (
                    <LinkCard key={app.id} to={app.path} title={app.name} description={app.description} marks={marks} />
                  );
                })}
              </LinkCardList>
            </section>
            <section aria-labelledby="disks" className="grid gap-3">
              <h2 id="disks" className="type-heading">
                Disks
              </h2>
              <DataTable caption="Disks" columns={diskColumns} rows={s.disks} rowKey={(d) => d.id} />
            </section>
            <section aria-labelledby="memory" className="grid max-w-xl gap-3">
              <h2 id="memory" className="type-heading">
                Memory
              </h2>
              <CompositionBar
                label={`${format.bytes(s.memory.total)} in all`}
                parts={[
                  { key: "used", label: "Used by apps", value: s.memory.used },
                  { key: "cached", label: "Cached files", value: s.memory.cached },
                  { key: "buffers", label: "Buffers", value: s.memory.buffers },
                ]}
                total={s.memory.total}
                restLabel="Free"
                formatValue={(v) => format.bytes(v)}
              />
            </section>
          </div>
        )}
      </DataView>
    </main>
  );
}
