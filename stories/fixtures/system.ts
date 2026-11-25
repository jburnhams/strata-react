import type { ScheduleRow, SystemInfoLike } from "../../src";

// What strata-python's `GET /api/system` answers for the kiln room's server, and the machine's
// scheduled jobs a status page lists beside it. Times are fixed against `systemNow`.

export const systemNow = new Date("2026-11-24T10:00:00Z");

export const systemInfo: SystemInfoLike = {
  version: "1.8.2",
  commit: "9f3c1ab07d42e6b5c0a1f7d3e8b24a96c5d0e1f2",
  python: "3.13.1",
  platform: "Linux-6.12.0-x86_64",
  started_at: "2026-11-23T09:00:00Z",
  folders: [
    { name: "home", path: "/home/kiln/.kiln", exists: true, free_bytes: 301.6e9, total_bytes: 512e9 },
    { name: "photos", path: "/mnt/photos", exists: true, free_bytes: 18e9, total_bytes: 466e9 },
    { name: "archive", path: "/mnt/archive", exists: true, free_bytes: 90e9, total_bytes: 2e12 },
    { name: "scratch", path: "/var/scratch/kiln", exists: false, free_bytes: null, total_bytes: null },
  ],
  services: [
    { name: "Glaze library", ok: true, version: "0.9.4", detail: null, url: "http://glazes.local/api/health" },
    { name: "Photo store", ok: false, version: null, detail: "Connection refused after 3 s", url: "http://photos.local/api/health" },
  ],
};

export const systemInfoPlain: SystemInfoLike = {
  ...systemInfo,
  commit: null,
  folders: systemInfo.folders.slice(0, 1),
  services: [],
};

export const schedule: ScheduleRow[] = [
  { label: "Nightly backup", result: "ok", last: "2026-11-24T02:00:00Z", next: "2026-11-25T02:00:00Z" },
  { label: "Photo thumbnails", result: "ok", running: true, last: "2026-11-24T09:30:00Z", next: "2026-11-24T10:30:00Z" },
  { label: "Glaze stock count", result: "failed", last: "2026-11-24T06:00:00Z", next: "2026-11-24T18:00:00Z" },
  { label: "Weekly firing report", result: null, last: null, next: "2026-11-30T08:00:00Z" },
  { label: "Archive sweep", result: "skipped", last: "2026-11-17T03:00:00Z", next: null },
];
