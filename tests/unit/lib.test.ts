import { describe, expect, it } from "vitest";
import { cn, createFormat, format, NBSP, parseSort, serialiseSort } from "../../src";

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

describe("sort in the URL", () => {
  it("round-trips", () => {
    const sort = { key: "pieces", dir: "descending" } as const;
    expect(parseSort(serialiseSort(sort))).toEqual(sort);
    expect(parseSort(null)).toBeUndefined();
    expect(parseSort("member")).toEqual({ key: "member", dir: "ascending" });
  });
});
