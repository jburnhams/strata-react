import { delay, http, HttpResponse } from "msw";
import { bookings, readings, type Booking } from "../fixtures/kiln";

// The fixture API, served by MSW in Storybook (service worker) and in the unit tests (Node). The
// default handlers answer like a healthy server; the named sets below replace one route to put a
// story or a test into another state. Nothing here is a module mock: the components' real fetch,
// query and DataView code runs against these responses.

export const api = {
  bookings: "/api/bookings",
  readings: "/api/kilns/2/readings",
} as const;

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

/** Withdrawing a booking fails: the undo bar brings the row back and says why. */
export const withdrawServerError = http.delete(`${api.bookings}/:id`, () =>
  HttpResponse.json({ message: "controller offline" }, { status: 503, statusText: "Service Unavailable" }),
);
/** Booking a firing when the kiln is already taken: 409, for AsyncButton's error state. */
export const bookingConflict = http.post(api.bookings, async () => {
  await delay(600);
  return HttpResponse.json({ message: "kiln taken" }, { status: 409, statusText: "Conflict" });
});
