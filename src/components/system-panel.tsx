import * as React from "react";
import { CircleAlert, CircleCheck, FolderX } from "lucide-react";
import { format } from "../lib/format";
import { fetchJson, useLoad } from "../query";
import { withBase } from "../lib/base";
import type { Poll } from "../query/poll";
import { DataView, EmptyState, Skeleton, StaleNotice, type Load } from "./data-view";
import { Meter, type MeterThreshold } from "./meter";
import { Status } from "./status";

// "About this server": the panel every strata app can draw from strata-python's `GET /api/system`
// (`web.add_system`, answered as a `SystemInfo`), strata-react issue #343, from jburnhams/homepage
// and python-app-template, which each wrote the same page. It is `/api/settings`' neighbour: those
// two routes are the shared ones, so these two screens should not be written twice.
// - It takes the contract's shape (`SystemInfoLike`: the generated `Schema<"SystemInfo">` satisfies
//   it, including an app's subclass with extra fields) and draws what every app has; what an app
//   adds goes in through `facts` (a term and a value) so the panel never knows its numbers.
// - A folder is a `Meter` on the shared thresholds, so a nearly full disk says so in words ("Nearly
//   full"), not only in colour; the figure is "301.6 of 512 GB" in one unit (`format.byteUnit`). A
//   folder that does not exist is the word "Missing" (`Status`), and one whose disk could not be read
//   is "Not measured": both are facts about the server, not blanks.
// - A service is `Up` or `Down` as a word with its version, and a service that is down gives the
//   server's own detail line, because "Down" alone does not say whether anything can be done.
// - The commit is shown short with the full hash as the cell's title, set in the mono face so a person
//   can copy it by selecting; there is no button, since selecting a twelve-character word is one
//   gesture. It reads "Installed package" when the server was not run from a checkout.
// - Loading uses the same pieces as every read: `useSystemInfo` is `useLoad` on the route (polled when
//   given a `Poll`), `SystemPanel` takes the `Load` and draws it through `DataView` with a skeleton
//   that mirrors it and the stale notice for free, so a restarting server does not blank the page.
// - The headings are `h2` by default; `headingLevel` lets a page that frames the panel in its own
//   section ("About this server") nest the three one level down, so the outline says whose parts they
//   are (#348). A level, not a `heading` text prop: the words stay the panel's own.

/** A folder the server watches, as `GET /api/system` reports it. */
export type SystemFolder = {
  name: string;
  path: string;
  exists: boolean;
  free_bytes: number | null;
  total_bytes: number | null;
};

/** A service the app calls, with its health as the service's own health endpoint answered just now. */
export type SystemService = {
  name: string;
  ok: boolean;
  version?: string | null;
  detail?: string | null;
  url?: string;
};

/** What `SystemPanel` draws: the shape of strata-python's `SystemInfo` (the generated schema satisfies it, extra fields and all). */
export type SystemInfoLike = {
  version: string;
  commit?: string | null;
  python: string;
  platform: string;
  started_at: string;
  folders: SystemFolder[];
  services: SystemService[];
};

/** The shared limits for a folder's disk, as shares of its size: filling up at 80%, nearly full at 95%. */
export const diskThresholds: MeterThreshold[] = [
  { at: 0.8, tone: "warning", label: "Filling up" },
  { at: 0.95, tone: "danger", label: "Nearly full" },
];

/** Reads `GET /api/system` (or another path) as a `Load` for `SystemPanel`, polled when given a `Poll`. Behind a reverse proxy the path is put under the app's base. */
export function useSystemInfo<T extends SystemInfoLike = SystemInfoLike>({ path = "/api/system", poll }: { path?: string; poll?: Poll } = {}): Load<T> {
  return useLoad({ queryKey: ["strata", "system", path], queryFn: () => fetchJson<T>(withBase(path)), poll });
}

/** A fact of the server the panel does not know, drawn with the others: a term and its value. */
export type SystemFact = { term: string; value: React.ReactNode };

/** The system panel's props. */
export type SystemPanelProps = {
  /** The read: `useSystemInfo()`, or `useLoad` on the route with the app's own types. */
  load: Load<SystemInfoLike>;
  /** Limits for a folder's disk, as shares of its size. Default `diskThresholds`. */
  thresholds?: MeterThreshold[];
  /** The app's own facts (greetings kept, queue length), drawn under the server's. */
  facts?: SystemFact[];
  /** "Now", for the uptime (tests and screenshots). */
  now?: Date;
  /** The level of the panel's three headings (Server, Folders, Services). Default 2; a page that wraps the panel in its own `h2` section passes 3 so the outline nests (#348). */
  headingLevel?: 2 | 3 | 4;
  className?: string;
};

function Fact({ term, children }: { term: string; children: React.ReactNode }) {
  return (
    <div className="flex gap-6">
      <dt className="w-28 shrink-0 text-muted-foreground">{term}</dt>
      <dd className="min-w-0">{children}</dd>
    </div>
  );
}

/** "301.6 GB of 512 GB": both in the larger figure's unit, so they read as one comparison. */
function ofSize(used: number, size: number) {
  const unit = format.byteUnit(size);
  return `${format.bytes(used, unit)} of ${format.bytes(size, unit)}`;
}

function PanelHeading({ id, level, children }: { id: string; level: 2 | 3 | 4; children: React.ReactNode }) {
  return React.createElement(`h${level}`, { id, className: "type-heading" }, children);
}

function SystemSkeleton() {
  return (
    <div className="grid gap-8" aria-hidden>
      <Skeleton className="h-28 w-full max-w-xl" />
      <Skeleton className="h-24 w-full max-w-xl" />
      <Skeleton className="h-16 w-full max-w-xl" />
    </div>
  );
}

function FolderRow({ folder, thresholds }: { folder: SystemFolder; thresholds: MeterThreshold[] }) {
  const { name, path, exists, free_bytes: free, total_bytes: total } = folder;
  const where = <span className="font-mono type-body-sm text-muted-foreground break-all">{path}</span>;
  if (!exists) {
    return (
      <div className="grid gap-1.5">
        <div className="flex items-center justify-between gap-3">
          <span className="type-label">{name}</span>
          <Status tone="warning" icon={FolderX}>
            Missing
          </Status>
        </div>
        {where}
      </div>
    );
  }
  if (free == null || total == null || total <= 0) {
    return (
      <div className="grid gap-1.5">
        <div className="flex items-center justify-between gap-3">
          <span className="type-label">{name}</span>
          <Status tone="neutral">Not measured</Status>
        </div>
        {where}
      </div>
    );
  }
  return (
    <div className="grid gap-1.5">
      <Meter label={`${name} folder disk space used`} value={total - free} max={total} thresholds={thresholds} detail={ofSize(total - free, total)} />
      {where}
    </div>
  );
}

function ServiceRow({ service }: { service: SystemService }) {
  return (
    <li className="flex flex-wrap items-baseline gap-x-3 gap-y-0.5">
      <span className="type-label">{service.name}</span>
      {service.ok ? (
        <Status tone="success" icon={CircleCheck}>
          Up
        </Status>
      ) : (
        <Status tone="danger" icon={CircleAlert}>
          Down
        </Status>
      )}
      {service.version && <span className="type-body-sm text-muted-foreground tabular-nums">version {service.version}</span>}
      {!service.ok && service.detail && <span className="type-body-sm text-danger">{service.detail}</span>}
    </li>
  );
}

/** About this server, from `GET /api/system`: version and commit, when it started, each folder's disk as a meter with its state in words, and each service as Up or Down. Loaded through `DataView`, with a skeleton and the stale notice. */
export function SystemPanel({ load, thresholds = diskThresholds, facts = [], now, headingLevel = 2, className }: SystemPanelProps) {
  const headings = { folders: React.useId(), services: React.useId(), server: React.useId() };
  return (
    <DataView
      state={load}
      isEmpty={() => false}
      skeleton={<SystemSkeleton />}
      staleNotice={(stale) => <StaleNotice stale={stale} shown={(when) => `These readings are from ${when}.`} />}
      empty={<EmptyState title="No readings">The server sent nothing to report.</EmptyState>}
      className={className}
    >
      {(s) => (
        <div className="grid max-w-xl gap-8">
          <section aria-labelledby={headings.server} className="grid gap-3">
            <PanelHeading id={headings.server} level={headingLevel}>Server</PanelHeading>
            <dl className="grid gap-2 type-body-sm">
              <Fact term="Version">
                <span className="tabular-nums">{s.version}</span>
              </Fact>
              <Fact term="Source">
                {s.commit ? (
                  <span className="font-mono" title={s.commit}>
                    {s.commit.slice(0, 12)}
                  </span>
                ) : (
                  "Installed package"
                )}
              </Fact>
              <Fact term="Started">
                {format.dateTime(s.started_at)}
                <span className="ml-2 text-muted-foreground tabular-nums">up {format.duration(((now ?? new Date()).getTime() - new Date(s.started_at).getTime()) / 1000, { style: "parts" })}</span>
              </Fact>
              <Fact term="Python">
                <span className="tabular-nums">{s.python}</span>
              </Fact>
              <Fact term="Platform">{s.platform}</Fact>
              {facts.map((f) => (
                <Fact key={f.term} term={f.term}>
                  {f.value}
                </Fact>
              ))}
            </dl>
          </section>
          {s.folders.length > 0 && (
            <section aria-labelledby={headings.folders} className="grid gap-3">
              <PanelHeading id={headings.folders} level={headingLevel}>Folders</PanelHeading>
              {s.folders.map((f) => (
                <FolderRow key={f.name} folder={f} thresholds={thresholds} />
              ))}
            </section>
          )}
          {s.services.length > 0 && (
            <section aria-labelledby={headings.services} className="grid gap-3">
              <PanelHeading id={headings.services} level={headingLevel}>Services</PanelHeading>
              <ul className="grid gap-2">
                {s.services.map((svc) => (
                  <ServiceRow key={svc.name} service={svc} />
                ))}
              </ul>
            </section>
          )}
        </div>
      )}
    </DataView>
  );
}
