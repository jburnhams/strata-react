import { describe, expect, it } from "vitest";
import { cn, createFormat, format, NBSP, parseSort, serialiseSort, toDate } from "../../src";

describe("cn", () => {
  it("keeps a type step and a text colour together", () => {
    expect(cn("type-label", "text-muted-foreground")).toBe("type-label text-muted-foreground");
  });
  it("lets a later type step replace an earlier one", () => {
    expect(cn("type-label", "type-body")).toBe("type-body");
  });
});

describe("format", () => {
  it("joins units with a non-breaking space", () => {
    expect(format.celsius(1222)).toBe(`1,222${NBSP}°C`);
  });
  it("counts with the right noun", () => {
    expect(format.count(1, "piece")).toBe(`1${NBSP}piece`);
    expect(format.count(6, "piece")).toBe(`6${NBSP}pieces`);
  });
  it("follows the locale it was made with", () => {
    expect(createFormat("de-DE").integer.format(1222)).toBe("1.222");
    expect(createFormat("de-DE").integer(1222)).toBe("1.222");
  });
  it("calls number formatters directly and keeps Intl's methods", () => {
    expect(format.integer(1222.4)).toBe("1,222");
    expect(format.decimal(3.14)).toBe("3.1");
    expect(format.percent(0.42)).toBe("42%");
    expect(format.integer.format(1222)).toBe("1,222");
    expect(format.integer.formatToParts(1222).map((p) => p.type)).toEqual(["integer", "group", "integer"]);
    expect(format.integer.resolvedOptions().locale).toBe("en-GB");
    expect(format.withUnit(2.25, "kg", format.decimal)).toBe(`2.3${NBSP}kg`);
  });

  it("writes byte sizes in the largest decimal unit reached, or a unit given", () => {
    expect(format.bytes(512)).toBe(`512${NBSP}B`);
    expect(format.bytes(5.24e9)).toBe(`5.2${NBSP}GB`);
    expect(format.bytes(431e9)).toBe(`431${NBSP}GB`);
    expect(format.bytes(1.64e12)).toBe(`1.6${NBSP}TB`);
    expect(format.bytes(431e9, "TB")).toBe(`0.4${NBSP}TB`);
    expect(format.byteUnit(466e9)).toBe("GB");
    expect(format.bytes(0)).toBe(`0${NBSP}B`);
  });
});

describe("format dates", () => {
  const utc = createFormat("en-GB", { timeZone: "UTC" });
  const at = "2026-11-08T06:05:00Z";

  it("writes a date and a date with time for records and history rows", () => {
    expect(utc.date(at)).toBe("8 Nov 2026");
    expect(utc.dateTime(at)).toBe("8 Nov 2026, 06:05");
  });

  it("takes a Date, an ISO string or epoch milliseconds alike", () => {
    const d = new Date(at);
    expect(utc.dateTime(d)).toBe(utc.dateTime(at));
    expect(utc.dateTime(d.getTime())).toBe(utc.dateTime(at));
    expect(utc.clock(at)).toBe("06:05");
    expect(utc.shortDay(at)).toBe("Sun 06:05");
    expect(utc.day(at)).toBe("Sunday 8 November");
  });

  it("keeps Intl's methods, which accept the same inputs", () => {
    expect(utc.clock.format(new Date(at))).toBe("06:05");
    expect(utc.date.formatToParts(at).find((p) => p.type === "year")?.value).toBe("2026");
    expect(utc.date.formatRange("2026-11-08", "2026-11-12")).toMatch(/^8\s?–\s?12 Nov 2026$/);
    expect(utc.dateTime.resolvedOptions().timeZone).toBe("UTC");
  });

  it("lets the locale order the parts and the zone move the time", () => {
    expect(createFormat("en-US", { timeZone: "UTC" }).dateTime(at)).toMatch(/^Nov 8, 2026, 6:05\sAM$/);
    expect(createFormat("de-DE", { timeZone: "UTC" }).date(at)).toBe("08.11.2026");
    expect(createFormat("en-GB", { timeZone: "Asia/Tokyo" }).dateTime(at)).toBe("8 Nov 2026, 15:05");
    expect(utc.timeZone).toBe("UTC");
    expect(format.timeZone).toBeUndefined();
  });

  it("refuses a value that is not a date instead of printing Invalid Date", () => {
    expect(() => utc.dateTime("next Tuesday")).toThrow(RangeError);
    expect(() => toDate("")).toThrow(/Not a date/);
    expect(toDate(at).toISOString()).toBe("2026-11-08T06:05:00.000Z");
  });
});

describe("sort in the URL", () => {
  it("round-trips", () => {
    const sort = { key: "pieces", dir: "descending" } as const;
    expect(parseSort(serialiseSort(sort))).toEqual(sort);
    expect(parseSort(null)).toBeUndefined();
    expect(parseSort("member")).toEqual({ key: "member", dir: "ascending" });
  });
});

describe("cn and radius roles", () => {
  it("lets a call site's radius role replace the component's", () => {
    expect(cn("rounded-control bg-muted", "rounded-pill")).toBe("bg-muted rounded-pill");
  });
});

describe("format for missing values (issue #47)", () => {
  it("prints an en dash for null or undefined from every number and date formatter", () => {
    expect(format.integer(null)).toBe("–");
    expect(format.decimal(undefined)).toBe("–");
    expect(format.percent(null)).toBe("–");
    expect(format.date(null)).toBe("–");
    expect(format.dateTime(undefined)).toBe("–");
    expect(format.count(null, "piece")).toBe("–");
    expect(format.missing).toBe("–");
  });
  it("takes the product's own placeholder", () => {
    const f = createFormat("en-GB", { missing: "n/a" });
    expect(f.integer(null)).toBe("n/a");
    expect(f.ago(undefined)).toBe("n/a");
  });
  it("still refuses a value that is not a date", () => {
    expect(() => format.date("someday")).toThrow(RangeError);
  });
});

describe("format.share (issue #43)", () => {
  it("never prints a part that is there as 0%, or a part short of the whole as 100%", () => {
    expect(format.share(2.4 / 512)).toBe("<1%");
    expect(format.share(0.996)).toBe(">99%");
    expect(format.share(0)).toBe("0%");
    expect(format.share(1)).toBe("100%");
    expect(format.share(0.42)).toBe("42%");
    expect(format.share(0.005)).toBe("1%");
  });
});

describe("format.ago, compact and runningTime (issue #52)", () => {
  const now = new Date("2026-11-09T12:00:00Z");
  const before = (ms: number) => new Date(now.getTime() - ms);
  const minute = 60_000;
  const day = 86_400_000;
  it("says how long ago in the largest unit reached, rounded down", () => {
    expect(format.ago(before(20_000), now)).toBe("now");
    expect(format.ago(before(5 * minute), now)).toBe("5 minutes ago");
    expect(format.ago(before(3 * 60 * minute), now)).toBe("3 hours ago");
    expect(format.ago(before(day + 5 * 60 * minute), now)).toBe("yesterday");
    expect(format.ago(before(13 * day), now)).toBe("last week");
    expect(format.ago(before(21 * day), now)).toBe("3 weeks ago");
    expect(format.ago(before(70 * day), now)).toBe("2 months ago");
    expect(format.ago(before(800 * day), now)).toBe("2 years ago");
  });
  it("says how far ahead a future time is, and takes ISO strings", () => {
    expect(format.ago("2026-11-09T14:30:00Z", now)).toBe("in 2 hours");
    expect(format.ago(now.toISOString(), now.toISOString())).toBe("now");
  });
  it("writes compact figures, and counts with the noun agreeing with the exact count", () => {
    // The locale writes the suffix: en-GB's thousand is "k", en-US's "K".
    expect(format.compact(1234)).toBe("1.2k");
    expect(createFormat("en-US").compact(1234)).toBe("1.2K");
    expect(format.compact(2_500_000)).toBe("2.5m");
    expect(format.count(1234, "view", undefined, { compact: true })).toBe(`1.2k${NBSP}views`);
    expect(format.count(1, "view", undefined, { compact: true })).toBe(`1${NBSP}view`);
  });
  it("writes a running time as a player does, with a dash for unknown", () => {
    expect(format.runningTime(245)).toBe("4:05");
    expect(format.runningTime(3729)).toBe("1:02:09");
    expect(format.runningTime(59.9)).toBe("0:59");
    expect(format.runningTime(0)).toBe("0:00");
    expect(format.runningTime(null)).toBe("–");
    expect(format.runningTime(-1)).toBe("–");
    expect(format.runningTime(Number.NaN)).toBe("–");
  });
});
