// SAMPLE DATA (fixture), copied from jburnhams/ux-research ui-library/examples. Invented. Back Lane Clay Co-op is fictional, as are its members.
// The numbers are shaped like the real thing: a cone 6 glaze firing ramps at 100, 150 and then
// 60 °C an hour to 1,222 °C, holds for 15 minutes, and cools on its own with the lid shut. Totals
// on screen are summed from these rows, never typed in.

import type { Point } from "../../src";

/** Minutes are counted from the start of the firing: Wednesday 4 November 2026, 08:00. */
export const FIRING_START = new Date(2026, 10, 4, 8, 0);
export const NOW_MIN = 30 * 60 + 10; // Thursday 14:10
export const SAFE_TO_OPEN_C = 200;

const AMBIENT = 20;
const PEAK = 1222;
const HOLD_END = 685;
const TAU = 613; // cooling time constant, minutes

/** The controller program: ramp, ramp, ramp, hold. */
export const planned: Point[] = [
  { x: 0, y: AMBIENT },
  { x: 348, y: 600 },
  { x: 548, y: 1100 },
  { x: 670, y: PEAK },
  { x: HOLD_END, y: PEAK },
];

function actualAt(t: number) {
  if (t <= HOLD_END) {
    // The kiln lags its program slightly on the steep middle ramp.
    for (let i = 1; i < planned.length; i++) {
      const a = planned[i - 1];
      const b = planned[i];
      if (t <= b.x) {
        const y = a.y + ((b.y - a.y) * (t - a.x)) / (b.x - a.x);
        return y - (t > 348 && t < 548 ? 18 * Math.sin(((t - 348) / 200) * Math.PI) : 0);
      }
    }
  }
  return AMBIENT + (PEAK - AMBIENT) * Math.exp(-(t - HOLD_END) / TAU);
}

// Half-hourly readings, plus the moments the controller changed segment, so the peak is a reading.
export const readings: Point[] = [
  ...new Set([...Array.from({ length: Math.floor(NOW_MIN / 30) + 1 }, (_, i) => i * 30), ...planned.map((p) => p.x), NOW_MIN]),
]
  .sort((a, b) => a - b)
  .map((x) => ({ x, y: Math.round(actualAt(x)) }));

/** When the kiln drops below the safe-to-open temperature, from the same cooling curve, rounded to
 *  5 minutes because the screen says "about". */
export const safeAtMin = 5 * Math.round((HOLD_END + TAU * Math.log((PEAK - AMBIENT) / (SAFE_TO_OPEN_C - AMBIENT))) / 5);

export const minuteToDate = (m: number) => new Date(FIRING_START.getTime() + m * 60_000);

export type KilnState = "booked" | "loading" | "firing" | "cooling" | "ready" | "fault";

/** The co-op's glazes, as on the test tiles by the kiln-room door. Bisque is unglazed. */
export type Glaze = "celadon" | "tenmoku" | "shino" | "cobalt" | "copper-red" | "bisque" | "raku";
export const glazeNames: Record<Glaze, string> = {
  celadon: "Celadon",
  tenmoku: "Tenmoku",
  shino: "Shino",
  cobalt: "Cobalt blue",
  "copper-red": "Copper red",
  bisque: "Unglazed",
  raku: "Raku crackle",
};

export type Booking = {
  id: string;
  member: string;
  pieces: number;
  kiln: 1 | 2 | 3;
  firing: string;
  glaze: Glaze;
  state: KilnState;
  out: string;
};

export const bookings: Booking[] = [
  { id: "b-2041", member: "Priya Natarajan", pieces: 6, kiln: 2, firing: "Glaze, cone 6", glaze: "celadon", state: "cooling", out: "Today, about 14:50" },
  { id: "b-2042", member: "Tom Ellery", pieces: 3, kiln: 2, firing: "Glaze, cone 6", glaze: "tenmoku", state: "cooling", out: "Today, about 14:50" },
  { id: "b-2043", member: "Aoife Byrne", pieces: 2, kiln: 2, firing: "Glaze, cone 6", glaze: "shino", state: "cooling", out: "Today, about 14:50" },
  { id: "b-2044", member: "Sam Okafor", pieces: 3, kiln: 2, firing: "Glaze, cone 6", glaze: "cobalt", state: "cooling", out: "Today, about 14:50" },
  { id: "b-2050", member: "Marta Kowalczyk", pieces: 11, kiln: 1, firing: "Bisque, cone 04", glaze: "bisque", state: "loading", out: "Saturday after 10:00" },
  { id: "b-2051", member: "Dev Raman", pieces: 8, kiln: 1, firing: "Bisque, cone 04", glaze: "bisque", state: "booked", out: "Saturday after 10:00" },
  { id: "b-2055", member: "Hannah Lowe", pieces: 4, kiln: 3, firing: "Raku", glaze: "raku", state: "booked", out: "Saturday, during the firing" },
  { id: "b-2033", member: "Joe Pryce", pieces: 5, kiln: 1, firing: "Bisque, cone 04", glaze: "bisque", state: "ready", out: "Ready since Tuesday" },
];

export const kiln1Shelves = { booked: 9, total: 14 };

// The studio's kiln facts. The booking form's choices, hints and validation all read these, so a
// change here changes what the form says and what it checks together.
export type KilnId = "1" | "2" | "3";
export const kilns: Record<KilnId, { name: string; shelfGapCm?: number }> = {
  "1": { name: "Kiln 1, large electric", shelfGapCm: 45 },
  "2": { name: "Kiln 2, small electric", shelfGapCm: 30 },
  "3": { name: "Kiln 3, raku (gas, in the yard)" },
};

export type FiringType = "bisque" | "glaze" | "raku";
export type NextFiring = { day: string; bringBy: string; out?: string };
export const firingTypes: Record<FiringType, { label: string; kilns: KilnId[]; when: string; next: NextFiring }> = {
  bisque: {
    label: "Bisque, cone 04",
    kilns: ["1"],
    when: "Fridays, out on Saturday after 10:00.",
    next: { day: "Friday", bringBy: "17:00 on Thursday", out: "on Saturday after 10:00" },
  },
  glaze: {
    label: "Glaze, cone 6",
    kilns: ["1", "2"],
    when: "Tuesdays and Thursdays.",
    next: { day: "Tuesday", bringBy: "17:00 on Monday", out: "usually Wednesday afternoon" },
  },
  raku: {
    label: "Raku",
    kilns: ["3"],
    when: "Saturdays, in the yard; you take part in the firing.",
    next: { day: "Saturday", bringBy: "10:00 on Saturday, in the yard" },
  },
};

export const MAX_PIECES_PER_BOOKING = 20;

/** Kiln 2 as loaded so far for Tuesday's glaze firing (sample; the only load the example has, so
 *  the booking's drawing appears only for kiln 2). Three shelves, 30 cm apart; the
 *  middle one is free. Sizes are in centimetres. */
export type Piece = { h: number; w: number };
export const kiln2Tuesday: { shelfWidthCm: number; levels: Piece[][] } = {
  shelfWidthCm: 60,
  levels: [
    [{ h: 22, w: 10 }, { h: 18, w: 9 }, { h: 26, w: 8 }, { h: 9, w: 13 }],
    [],
    [{ h: 8, w: 14 }, { h: 15, w: 10 }],
  ],
};

// The kiln's glow as a colour scale, for the firing chart. Each stop is a temperature where the
// colour through the peephole changes; between stops the chart blends. Nothing glows below about
// 525 °C (the Draper point), so up to 500 °C the line is the unlit clay brown. Values live in
// .storybook/theme.css (--heat-*), solved for >= 3:1 against the ground in light and dark.
export const heatScale = [
  { at: 0, colour: "var(--heat-unlit)" },
  { at: 500, colour: "var(--heat-unlit)" },
  { at: 600, colour: "var(--heat-dull-red)" },
  { at: 800, colour: "var(--heat-cherry)" },
  { at: 1000, colour: "var(--heat-orange)" },
  { at: 1200, colour: "var(--heat-yellow)" },
];

/** One past firing in the co-op's log, newest first. Ids rise with time, so "after f-0412" means
 *  older than firing 412. */
export type Firing = { id: string; kiln: KilnId; type: FiringType; pieces: number; peakC: number; endedMin: number };

const firingTypeCycle: FiringType[] = ["glaze", "bisque", "glaze", "raku", "glaze", "bisque"];
const peakFor: Record<FiringType, number> = { bisque: 1060, glaze: 1222, raku: 980 };

/** The firing log: 137 firings since March, one every 1.6 days or so, newest first. */
export const firings: Firing[] = Array.from({ length: 137 }, (_, i) => {
  const type = firingTypeCycle[i % firingTypeCycle.length];
  const kiln: KilnId = type === "raku" ? "3" : type === "bisque" ? "1" : i % 4 === 0 ? "1" : "2";
  return {
    id: `f-${String(412 - i).padStart(4, "0")}`,
    kiln,
    type,
    pieces: ((i * 11) % 23) + 4,
    peakC: peakFor[type] - ((i * 7) % 9),
    endedMin: -i * 2310 - 685,
  };
});

/** Photos of finished pieces, as members upload them after a firing. The colours stand in for the
 *  glazes on a real photo; they are the subject's, not the theme's. One photo is missing on disk,
 *  as happens when a file is moved, and one piece was never photographed. */
export const glazeSwatches: Record<Glaze, { glaze: string; clay: string }> = {
  celadon: { glaze: "#8fb3a1", clay: "#d9d2c3" },
  tenmoku: { glaze: "#4a2a1c", clay: "#c9b49a" },
  shino: { glaze: "#e6c7a4", clay: "#d8c2a8" },
  cobalt: { glaze: "#2c4a8a", clay: "#d9d4cb" },
  "copper-red": { glaze: "#8e2a2a", clay: "#d6cdc0" },
  bisque: { glaze: "#e3c3a5", clay: "#e3c3a5" },
  raku: { glaze: "#d8d6cf", clay: "#3a3632" },
};

export type PiecePhoto = { id: string; title: string; member: string; glaze: Glaze; photo: string | null };
export const piecePhotos: PiecePhoto[] = [
  { id: "p-301", title: "Celadon bowl", member: "Priya Natarajan", glaze: "celadon", photo: "/api/photos/p-301.svg" },
  { id: "p-302", title: "Tenmoku tea bowl", member: "Tom Ellery", glaze: "tenmoku", photo: "/api/photos/p-302.svg" },
  { id: "p-303", title: "Shino jar", member: "Aoife Byrne", glaze: "shino", photo: "/api/photos/p-303.svg" },
  { id: "p-304", title: "Cobalt vase", member: "Sam Okafor", glaze: "cobalt", photo: "/api/photos/p-304.svg" },
  { id: "p-305", title: "Copper red bottle", member: "Hannah Lowe", glaze: "copper-red", photo: "/api/photos/p-305-moved.svg" },
  { id: "p-306", title: "Raku dish", member: "Hannah Lowe", glaze: "raku", photo: null },
];
