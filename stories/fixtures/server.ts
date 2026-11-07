// The kiln room's small server: the machine in the studio office that runs the booking site, the
// kiln log and the glaze library. Sample data for the status dashboard components (Meter,
// CompositionBar, LinkCard) and the "Studio server" screen. Sizes are bytes, as a status API
// sends them; the screen formats them.

import type { MeterThreshold } from "../../src";

export const GB = 1e9;

export type Disk = { id: string; mount: string; purpose: string; used: number; size: number };
export type App = {
  id: string;
  name: string;
  description: string;
  path: string;
  state: "running" | "stopped" | "updating";
  updated: string;
  external?: boolean;
};
export type ServerStatus = {
  disks: Disk[];
  memory: { total: number; used: number; cached: number; buffers: number };
  apps: App[];
};

/** One set of thresholds for every disk, as shares of its size. */
export const diskThresholds: MeterThreshold[] = [
  { at: 0.8, tone: "warning", label: "Filling up" },
  { at: 0.9, tone: "danger", label: "Nearly full" },
];

export const serverStatus: ServerStatus = {
  disks: [
    { id: "root", mount: "/", purpose: "System and apps", used: 18.4 * GB, size: 64 * GB },
    { id: "photos", mount: "/srv/photos", purpose: "Glaze test photos", used: 431 * GB, size: 466 * GB },
    { id: "backup", mount: "/mnt/backup", purpose: "Nightly backups", used: 1640 * GB, size: 1863 * GB },
  ],
  memory: { total: 16 * GB, used: 5.2 * GB, cached: 6.9 * GB, buffers: 0.6 * GB },
  apps: [
    {
      id: "bookings",
      name: "Kiln bookings",
      description: "Members book shelves in the next bisque and glaze firings.",
      path: "/bookings",
      state: "running",
      updated: "Updated today",
    },
    {
      id: "log",
      name: "Firing log",
      description: "Every firing's schedule, readings and notes since 2019.",
      path: "/log",
      state: "running",
      updated: "Updated 3 days ago",
    },
    {
      id: "glazes",
      name: "Glaze library",
      description: "Recipes and test tiles for the co-op's 42 glazes, with photos.",
      path: "https://glazes.kilnroom.example",
      state: "updating",
      updated: "Moving to the new photo disk",
      external: true,
    },
    {
      id: "members",
      name: "Members",
      description: "Who has a key, who has paid this term, and who teaches.",
      path: "/members",
      state: "stopped",
      updated: "Stopped by Priya at 09:12",
    },
  ],
};
