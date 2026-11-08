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
