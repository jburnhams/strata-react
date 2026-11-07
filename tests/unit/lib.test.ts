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
