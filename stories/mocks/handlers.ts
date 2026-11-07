import { delay, http, HttpResponse } from "msw";
import { bookings, firings, readings, type Booking, type Firing } from "../fixtures/kiln";

// The fixture API, served by MSW in Storybook (service worker) and in the unit tests (Node). The
// default handlers answer like a healthy server; the named sets below replace one route to put a
// story or a test into another state. Nothing here is a module mock: the components' real fetch,
// query and DataView code runs against these responses.

export const api = {
  bookings: "/api/bookings",
  readings: "/api/kilns/2/readings",
  firings: "/api/firings",
} as const;

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

export const handlers = [
  http.get(api.bookings, ({ request }) => {
    const size = new URL(request.url).searchParams.get("size");
    return HttpResponse.json(size === "large" ? manyBookings : bookings);
  }),
  http.get(api.readings, () => HttpResponse.json(readings)),
  http.get(api.firings, ({ request }) => HttpResponse.json(firingPage(request.url))),
  http.delete(`${api.bookings}/:id`, () => new HttpResponse(null, { status: 204 })),
  http.post(api.bookings, async () => {
    await delay(600);
    return HttpResponse.json({ id: "b-4001" }, { status: 201 });
  }),
];

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
  return HttpResponse.json({ message: "kiln taken" }, { status: 409, statusText: "Conflict" });
});
