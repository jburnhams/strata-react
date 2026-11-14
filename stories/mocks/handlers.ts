import { delay, http, HttpResponse } from "msw";
import { listDisk, makeFolder, noteFor } from "../fixtures/folders";
import { bookings, firedWork, firings, glazeSwatches, piecePhotos, readings, type Booking, type Firing } from "../fixtures/kiln";
import { serverStatus } from "../fixtures/server";

// The fixture API, served by MSW in Storybook (service worker) and in the unit tests (Node). The
// default handlers answer like a healthy server; the named sets below replace one route to put a
// story or a test into another state. Nothing here is a module mock: the components' real fetch,
// query and DataView code runs against these responses.

export const api = {
  bookings: "/api/bookings",
  readings: "/api/kilns/2/readings",
  firings: "/api/firings",
  /** `GET /api/firings/:id/work`: whose work was in one firing. */
  firingWork: (id: string) => `/api/firings/${id}/work`,
  server: "/api/server",
  pieces: "/api/pieces",
  photos: "/api/photos",
  /** `POST /api/invites` `{ email }`: invite a member to the studio. */
  invites: "/api/invites",
  /** `GET` the kiln log sync's status; `POST` starts one. */
  logSync: "/api/log-sync",
} as const;

/** The kiln log sync's status: it reads each kiln controller's log in turn. */
export type LogSync = {
  running: boolean;
  /** Kilns read so far, and the one being read. */
  current: number;
  total: number;
  /** The kiln being read, while running. */
  kiln?: string;
  newReadings: number;
  failures: { kiln: string; reason: string }[];
  /** The sync stopped for a reason that names no kiln. */
  error?: string;
};

/** The log sync before it has run, and at each stage: the fixtures for stories and tests. */
export const logSyncs = {
  idle: { running: false, current: 0, total: 0, newReadings: 0, failures: [] },
  running: { running: true, current: 2, total: 3, kiln: "Kiln 2", newReadings: 412, failures: [] },
  finished: { running: false, current: 3, total: 3, newReadings: 1284, failures: [] },
  someFailed: {
    running: false,
    current: 3,
    total: 3,
    newReadings: 860,
    failures: [{ kiln: "Kiln 3", reason: "its controller did not answer within 30 seconds" }],
  },
  failed: { running: false, current: 1, total: 3, newReadings: 0, failures: [], error: "The log store is full, so nothing was saved." },
} satisfies Record<string, LogSync>;

/** One page of the firing log. `after` is the id of the last firing the client holds, not an
 *  offset: firings archived since the last page drop out of the list, and an offset would skip
 *  the ones that moved up to fill the gap. */
export type FiringPage = { firings: Firing[]; hasMore: boolean };

/** Serves `GET /api/firings?after=<id>&limit=<n>` from a list, the way a cursor API does. */
export function firingPage(url: string, list: Firing[] = firings): FiringPage {
  const params = new URL(url).searchParams;
  const after = params.get("after");
  const limit = Number(params.get("limit") ?? 20);
  // Ids sort with time, so "after" works even when that firing has itself been archived.
  const start = after ? list.findIndex((f) => f.id < after) : 0;
  const page = start < 0 ? [] : list.slice(start, start + limit);
  return { firings: page, hasMore: start >= 0 && start + limit < list.length };
}

/** A larger table, for virtualisation: 480 bookings shaped like the co-op's. */
export const manyBookings: Booking[] = Array.from({ length: 480 }, (_, i) => {
  const b = bookings[i % bookings.length];
  return { ...b, id: `b-${3000 + i}`, pieces: ((i * 7) % 12) + 1 };
});

/** A stand-in photo of a piece: a pot in its glaze on a shelf, drawn as SVG so it needs no binary
 *  fixture and renders the same on every machine. No text, so no font is involved. */
export function piecePhotoSvg(file: string): string | null {
  // Files on disk are named by piece id; p-305's record points at a file that was moved.
  const piece = piecePhotos.find((p) => `${p.id}.svg` === file);
  if (!piece) return null;
  const { glaze, clay } = glazeSwatches[piece.glaze];
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 300" width="400" height="300">
<rect width="400" height="300" fill="#efe9df"/><rect y="230" width="400" height="70" fill="#cfc6b8"/>
<ellipse cx="200" cy="236" rx="96" ry="14" fill="#b9ae9e"/>
<path d="M130 90 Q120 170 150 230 L250 230 Q280 170 270 90 Z" fill="${clay}"/>
<path d="M130 90 Q122 150 138 196 L262 196 Q278 150 270 90 Z" fill="${glaze}"/>
<ellipse cx="200" cy="90" rx="70" ry="16" fill="${glaze}"/><ellipse cx="200" cy="90" rx="56" ry="10" fill="#00000033"/>
</svg>`;
}

/** Two renderings of the same shelf photo, for comparing: `final` is the person's version, `auto` a machine's
 *  (a cooler glaze, a darker shelf and a speck on the rim to find). Same SVG, so they differ only where drawn. */
export function renderingSvg(variant: string): string | null {
  const base = piecePhotoSvg("p-301.svg");
  if (!base || !["final", "auto", "warm"].includes(variant)) return null;
  if (variant === "final") return base;
  if (variant === "warm") return base.replaceAll("#8fb3a1", "#b3a47f").replace('fill="#efe9df"', 'fill="#f3e6d2"');
  return base
    .replaceAll("#8fb3a1", "#7fa6b3")
    .replace('fill="#cfc6b8"', 'fill="#b8b2a8"')
    .replace("</svg>", '<circle cx="236" cy="86" r="3" fill="#2a2a2a"/></svg>');
}

const rendering = ({ params }: { params: Record<string, string | readonly string[] | undefined> }) => {
  const svg = renderingSvg(String(params.variant).replace(/\.svg$/, ""));
  return svg ? new HttpResponse(svg, { headers: { "Content-Type": "image/svg+xml" } }) : new HttpResponse(null, { status: 404 });
};

const photo = ({ params }: { params: Record<string, string | readonly string[] | undefined> }) => {
  const svg = piecePhotoSvg(String(params.id));
  return svg ? new HttpResponse(svg, { headers: { "Content-Type": "image/svg+xml" } }) : new HttpResponse(null, { status: 404 });
};

// Map tiles for the map stories: an SVG per tile, the same streets on every tile so they meet at the
// edges, in a light set and a dark set, so no story asks a live provider for anything. Tile imagery
// is a provider's, not the app's, so its colours are literal here.
const tileSet = {
  light: { ground: "#ebe7df", road: "#ffffff", minor: "#f6f3ee", park: "#d6e4cc", edge: "#d9d4c9" },
  dark: { ground: "#23272d", road: "#3a4048", minor: "#2d3238", park: "#27352a", edge: "#1d2025" },
};
const tile: Parameters<typeof http.get>[1] = ({ params }) => {
  const set = tileSet[params.set === "dark" ? "dark" : "light"];
  const park = (Number(params.z) + Number(params.x) + parseInt(String(params.file), 10)) % 5 === 0;
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" width="256" height="256" viewBox="0 0 256 256"><rect width="256" height="256" fill="${set.ground}"/>` +
    (park ? `<rect x="136" y="104" width="112" height="104" rx="6" fill="${set.park}"/>` : "") +
    `<path d="M0 32H256M0 224H256M32 0V256M224 0V256" stroke="${set.minor}" stroke-width="6"/>` +
    `<path d="M0 96H256M160 0V256" stroke="${set.road}" stroke-width="12"/>` +
    `<path d="M0 0H256V256H0Z" fill="none" stroke="${set.edge}" stroke-width="1"/></svg>`;
  return new HttpResponse(svg, { headers: { "Content-Type": "image/svg+xml" } });
};

/** Two readings of one three-second phrase for the audio stories: the same tone, one louder. `/api/clips/:variant` (`a.wav` is the louder). A real WAV, so the browser decodes it and the loudness measure runs. */
const clip = ({ params }: { params: Record<string, string | readonly string[] | undefined> }) => {
  const loud = String(params.variant).startsWith("a");
  const rate = 8000;
  const frames = rate * 3;
  const bytes = new DataView(new ArrayBuffer(44 + frames * 2));
  const write = (at: number, text: string) => [...text].forEach((c, i) => bytes.setUint8(at + i, c.charCodeAt(0)));
  write(0, "RIFF");
  bytes.setUint32(4, 36 + frames * 2, true);
  write(8, "WAVEfmt ");
  bytes.setUint32(16, 16, true);
  bytes.setUint16(20, 1, true);
  bytes.setUint16(22, 1, true);
  bytes.setUint32(24, rate, true);
  bytes.setUint32(28, rate * 2, true);
  bytes.setUint16(32, 2, true);
  bytes.setUint16(34, 16, true);
  write(36, "data");
  bytes.setUint32(40, frames * 2, true);
  for (let i = 0; i < frames; i++) bytes.setInt16(44 + i * 2, Math.round(Math.sin((2 * Math.PI * (loud ? 440 : 523) * i) / rate) * (loud ? 0.5 : 0.25) * 32767), true);
  return new HttpResponse(bytes.buffer, { headers: { "Content-Type": "audio/wav" } });
};

/**
 * A playlist that grows while it is "made" (issue #179): one two-second segment at first, one more every
 * three seconds, the end-list once all six exist. `?start=<ms>` is when this showing began, so every story
 * mount starts again from one segment. The segments are static files (`.storybook/public/hls/`), so the
 * stream is real media that hls.js plays; only the playlist is the mock.
 */
const growing = ({ request }: { request: Request }) => {
  const start = Number(new URL(request.url).searchParams.get("start")) || Date.now();
  const made = Math.min(6, 1 + Math.floor((Date.now() - start) / 3000));
  const lines = ["#EXTM3U", "#EXT-X-VERSION:3", "#EXT-X-TARGETDURATION:2", "#EXT-X-MEDIA-SEQUENCE:0"];
  for (let i = 0; i < made; i++) lines.push("#EXTINF:2.000000,", `seg${i}.ts`);
  if (made === 6) lines.push("#EXT-X-ENDLIST");
  return new HttpResponse(lines.join("\n") + "\n", { headers: { "Content-Type": "application/vnd.apple.mpegurl", "Cache-Control": "no-store" } });
};

/** The pretend disk: GET lists a folder's subfolders (`/locked` refuses, `/slow-share` is slow), POST makes one. */
const folders = [
  http.get("/api/folders", async ({ request }) => {
    const path = new URL(request.url).searchParams.get("path") || "/";
    if (path.endsWith("/slow-share")) await delay(1500);
    if (path.endsWith("/locked")) return HttpResponse.json({ detail: `You do not have permission to open ${path}.` }, { status: 403, statusText: "Forbidden" });
    return HttpResponse.json({ folders: listDisk(path), footer: noteFor(path) });
  }),
  http.post("/api/folders", async ({ request }) => {
    const { parent, name } = (await request.json()) as { parent: string; name: string };
    await delay(300);
    const made = makeFolder(parent, name);
    return made.ok ? HttpResponse.json({ path: `${parent === "/" ? "" : parent}/${name}` }, { status: 201 }) : HttpResponse.json({ detail: made.reason }, { status: made.status });
  }),
];

export const handlers = [
  ...folders,
  http.get("*/hls/growing.m3u8", growing),
  http.get("/api/clips/:variant", clip),
  http.get("https://tiles.example.test/:set/:z/:x/:file", tile),
  http.get(api.pieces, () => HttpResponse.json(piecePhotos)),
  http.get(`${api.photos}/:id`, photo),
  http.get("/api/renderings/:variant", rendering),
  http.get(api.bookings, ({ request }) => {
    const size = new URL(request.url).searchParams.get("size");
    return HttpResponse.json(size === "large" ? manyBookings : bookings);
  }),
  http.get(api.readings, () => HttpResponse.json(readings)),
  http.get(api.firings, ({ request }) => HttpResponse.json(firingPage(request.url))),
  http.get(api.server, () => HttpResponse.json(serverStatus)),
  http.get("/api/firings/:id/work", ({ params }) => {
    const f = firings.find((x) => x.id === params.id);
    return f ? HttpResponse.json(firedWork(f)) : HttpResponse.json({ message: "no such firing" }, { status: 404, statusText: "Not Found" });
  }),
  http.delete(`${api.bookings}/:id`, () => new HttpResponse(null, { status: 204 })),
  http.post(api.bookings, async () => {
    await delay(600);
    return HttpResponse.json({ id: "b-4001" }, { status: 201 });
  }),
  http.post(api.invites, async () => {
    await delay(400);
    return HttpResponse.json({ id: "inv-88" }, { status: 201 });
  }),
  http.get(api.logSync, () => HttpResponse.json(logSyncs.idle)),
  http.post(api.logSync, () => new HttpResponse(null, { status: 202 })),
];

/** The server refuses an invite for a reason only it can check, in its own words (FastAPI's `detail`). */
export const inviteTaken = http.post(api.invites, async () => {
  await delay(400);
  return HttpResponse.json({ detail: "ada@example.org is already a member of the studio" }, { status: 409, statusText: "Conflict" });
});

/** The server's validation rejects the email field (FastAPI's 422 shape). */
export const inviteInvalid = http.post(api.invites, () =>
  HttpResponse.json(
    { detail: [{ loc: ["body", "email"], msg: "Use the address the member signs in with, ending in .org or .com", type: "value_error" }] },
    { status: 422, statusText: "Unprocessable Entity" },
  ),
);

/** The log sync's status fixed at one stage. */
export const logSyncAt = (stage: keyof typeof logSyncs) => http.get(api.logSync, () => HttpResponse.json(logSyncs[stage]));

export const bookingsLoading = http.get(api.bookings, async () => {
  await delay("infinite");
  return HttpResponse.json([]);
});

export const bookingsEmpty = http.get(api.bookings, () => HttpResponse.json([]));

export const bookingsServerError = http.get(api.bookings, () =>
  HttpResponse.json({ message: "controller offline" }, { status: 503, statusText: "Service Unavailable" }),
);

export const firingsLoading = http.get(api.firings, async () => {
  await delay("infinite");
  return HttpResponse.json({ firings: [], hasMore: false });
});

export const firingsEmpty = http.get(api.firings, () => HttpResponse.json({ firings: [], hasMore: false } satisfies FiringPage));

export const firingsServerError = http.get(api.firings, () =>
  HttpResponse.json({ message: "log offline" }, { status: 503, statusText: "Service Unavailable" }),
);

/** The first page loads; every later page fails, as when the log server drops mid-scroll. */
export const firingsLaterPageError = http.get(api.firings, ({ request }) =>
  new URL(request.url).searchParams.has("after")
    ? HttpResponse.json({ message: "log offline" }, { status: 503, statusText: "Service Unavailable" })
    : HttpResponse.json(firingPage(request.url)),
);

/** Withdrawing a booking fails: the undo bar brings the row back and says why. */
export const withdrawServerError = http.delete(`${api.bookings}/:id`, () =>
  HttpResponse.json({ message: "controller offline" }, { status: 503, statusText: "Service Unavailable" }),
);

/** Booking a firing when the kiln is already taken: 409, for AsyncButton's error state. */
export const bookingConflict = http.post(api.bookings, async () => {
  await delay(600);
  return HttpResponse.json({ detail: "Kiln 2 is already booked for Friday's bisque" }, { status: 409, statusText: "Conflict" });
});

export const serverLoading = http.get(api.server, async () => {
  await delay("infinite");
  return HttpResponse.json(serverStatus);
});

export const serverUnreachable = http.get(api.server, () =>
  HttpResponse.json({ message: "status agent not answering" }, { status: 502, statusText: "Bad Gateway" }),
);

/** Photos that never arrive, for Thumbnail's loading state. */
export const photosLoading = http.get(`${api.photos}/:id`, async () => {
  await delay("infinite");
  return new HttpResponse(null, { status: 404 });
});

export const piecesLoading = http.get(api.pieces, async () => {
  await delay("infinite");
  return HttpResponse.json([]);
});

/** A firing's work never arrives: the detail row's skeleton. */
export const firingWorkLoading = http.get("/api/firings/:id/work", async () => {
  await delay("infinite");
  return HttpResponse.json([]);
});

/** A firing logged with nothing recorded in it (a test firing). */
export const firingWorkEmpty = http.get("/api/firings/:id/work", () => HttpResponse.json([]));

export const firingWorkServerError = http.get("/api/firings/:id/work", () =>
  HttpResponse.json({ message: "log offline" }, { status: 503, statusText: "Service Unavailable" }),
);

/** Renderings that never arrive, for Compare's loading state. */
export const renderingsLoading = http.get("/api/renderings/:variant", async () => {
  await delay("infinite");
  return new HttpResponse(null, { status: 404 });
});
