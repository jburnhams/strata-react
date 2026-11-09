import { delay, http, HttpResponse } from "msw";
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

const photo = ({ params }: { params: Record<string, string | readonly string[] | undefined> }) => {
  const svg = piecePhotoSvg(String(params.id));
  return svg ? new HttpResponse(svg, { headers: { "Content-Type": "image/svg+xml" } }) : new HttpResponse(null, { status: 404 });
};

export const handlers = [
  http.get(api.pieces, () => HttpResponse.json(piecePhotos)),
  http.get(`${api.photos}/:id`, photo),
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
