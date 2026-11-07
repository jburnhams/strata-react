import { describe, expect, it } from "vitest";
import { PNG } from "pngjs";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { http, HttpResponse } from "msw";
import { boxBlur, compare, decode, encode } from "../../src/visual/compare";
import { routeShots, storybookShots } from "../../src/visual/targets";
import { resolveShotUrl, toFetchRequest } from "../../src/visual/capture";
import { formatReport, pinWarnings } from "../../src/visual/run";
import type { VisualReport } from "../../src/visual/types";

// strata-react/visual's logic that needs no browser: comparison, turning stories and routes into
// shots, URLs, requests handed to MSW, and the report. Capture itself runs in Chromium and is
// covered by tests/integration/visual.test.ts and by the visual suite running on itself.

function image(width: number, height: number, paint?: (x: number, y: number) => [number, number, number] | undefined) {
  const png = new PNG({ width, height });
  for (let y = 0; y < height; y++)
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4;
      const [r, g, b] = paint?.(x, y) ?? [250, 250, 248];
      png.data[i] = r;
      png.data[i + 1] = g;
      png.data[i + 2] = b;
      png.data[i + 3] = 255;
    }
  return decode(PNG.sync.write(png));
}

describe("visual compare (pixelmatch)", () => {
  it("passes identical images", () => {
    expect(compare(image(40, 20), image(40, 20)).same).toBe(true);
  });

  it("fails a changed block and returns a diff image", () => {
    const changed = image(40, 20, (x, y) => (x >= 10 && x < 20 && y >= 5 && y < 15 ? [40, 90, 60] : undefined));
    const result = compare(image(40, 20), changed);
    expect(result.same).toBe(false);
    // The block's inner 8×8 after the blur; its softened rim reads as anti-aliasing.
    expect(result.diffPixels).toBe(64);
    expect(decode(result.diff!).width).toBe(40);
  });

  it("tolerates a few stray pixels", () => {
    const speck = image(40, 20, (x, y) => (x === 3 && y === 3 ? [0, 0, 0] : undefined));
    expect(compare(image(40, 20), speck).same).toBe(true);
  });

  it("says whether a match is pixel-identical", () => {
    expect(compare(image(40, 20), image(40, 20)).identical).toBe(true);
    const speck = image(40, 20, (x, y) => (x === 3 && y === 3 ? [0, 0, 0] : undefined));
    expect(compare(image(40, 20), speck)).toMatchObject({ same: true, identical: false });
  });

  // An edge anti-aliased differently: the same ink, its coverage moved to the neighbouring pixel,
  // as another machine's rasteriser does. Plain pixelmatch counts the whole edge; after the 3×3
  // blur nothing differs.
  const ink = [40, 40, 40] as const;
  const mix = (cover: number) => [0, 1, 2].map((c) => Math.round(250 + (ink[c] - 250) * cover)) as [number, number, number];
  const edge = (shift: number) =>
    image(60, 40, (x, y) => (y < 4 || y > 35 ? undefined : x < 20 ? [...ink] : x === 20 ? mix(0.6 - shift) : x === 21 ? mix(0.2 + shift) : undefined));

  it("absorbs anti-aliasing that moved along an edge", () => {
    expect(compare(edge(0), edge(0.2), { blur: 0, includeAA: true }).diffPixels).toBe(64);
    expect(compare(edge(0), edge(0.2))).toMatchObject({ same: true, diffPixels: 0 });
  });

  it("still fails a small mark the size of a changed letter's stroke", () => {
    const stroke = image(60, 40, (x, y) => (x >= 30 && x < 32 && y >= 10 && y < 18 ? [...ink] : undefined));
    expect(compare(image(60, 40), stroke).same).toBe(false);
  });

  it("blurs with a box of the given radius and leaves flat areas alone", () => {
    const dot = image(5, 5, (x, y) => (x === 2 && y === 2 ? [250 - 90, 250 - 90, 250 - 90] : undefined));
    const out = boxBlur(dot, 1);
    expect(out[(2 * 5 + 2) * 4]).toBe(240);
    expect(out[(1 * 5 + 1) * 4]).toBe(240);
    expect(out[0]).toBe(250);
    expect(boxBlur(dot, 0)).toBe(dot.data);
    expect(() => boxBlur(dot, 0.5)).toThrow("blur must be a whole number of pixels");
    expect(() => compare(dot, image(5, 5), { blur: -1 })).toThrow("blur must be a whole number of pixels");
  });

  it("treats a size change as a change", () => {
    const result = compare(image(40, 20), image(40, 24));
    expect(result.same).toBe(false);
    expect(result.reason).toBe("size 40×20 → 40×24");
  });

  it("encodes what it decodes", () => {
    const a = image(8, 8);
    expect(compare(a, decode(encode(a))).same).toBe(true);
  });
});

function tempDir() {
  return mkdtempSync(join(tmpdir(), "strata-visual-"));
}

describe("storybookShots", () => {
  it("takes every story light and dark, picks the viewport from tags, and skips no-visual", () => {
    const dir = tempDir();
    try {
      writeFileSync(
        join(dir, "index.json"),
        JSON.stringify({
          entries: {
            "button--default": { id: "button--default", type: "story", tags: ["autodocs"] },
            "screen--wide": { id: "screen--wide", type: "story", tags: ["visual-wide"] },
            // A story's own phone tag beats its file's wide tag (Storybook merges both).
            "screen--phone": { id: "screen--phone", type: "story", tags: ["visual-wide", "visual-phone"] },
            "demo--interactive": { id: "demo--interactive", type: "story", tags: ["no-visual"] },
            "button--docs": { id: "button--docs", type: "docs" },
          },
        }),
      );
      const shots = storybookShots({ dir });
      expect(shots.map((s) => s.name)).toEqual([
        "button--default--light",
        "button--default--dark",
        "screen--wide--light",
        "screen--wide--dark",
        "screen--phone--light",
        "screen--phone--dark",
      ]);
      expect(shots[0]).toMatchObject({ viewport: { width: 1024, height: 200 }, root: "#storybook-root", clip: "paint" });
      expect(shots[1].path).toBe("iframe.html?id=button--default&viewMode=story&globals=theme:dark");
      expect(shots[2].viewport).toEqual({ width: 1440, height: 900 });
      expect(shots[4].viewport).toEqual({ width: 390, height: 844 });
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe("routeShots", () => {
  const base = [http.get("/api/items", () => HttpResponse.json([1, 2]))];
  const empty = http.get("/api/items", () => HttpResponse.json([]));

  it("takes each route in each state, viewport and theme, state handlers first", () => {
    const shots = routeShots({
      dir: "dist",
      handlers: base,
      viewports: ["wide", "phone"],
      routes: [{ name: "review", path: "/review", states: { ready: [], empty: [empty], sorted: { path: "/review?sort=added.desc", waitFor: "role=table" } } }],
    });
    expect(shots).toHaveLength(12);
    expect(shots.map((s) => s.name).slice(0, 4)).toEqual([
      "review--ready--wide--light",
      "review--ready--wide--dark",
      "review--ready--phone--light",
      "review--ready--phone--dark",
    ]);
    const emptyShot = shots.find((s) => s.name === "review--empty--wide--light")!;
    expect(emptyShot.handlers).toEqual([empty, ...base]);
    expect(emptyShot).toMatchObject({ path: "/review", root: "#root", clip: "page", darkClass: "dark", viewport: { width: 1440, height: 900 } });
    expect(shots.find((s) => s.name === "review--sorted--phone--dark")).toMatchObject({ path: "/review?sort=added.desc", waitFor: "role=table" });
  });

  it("gives a route with no states one default state, at the wide viewport", () => {
    const shots = routeShots({ dir: "dist", routes: [{ name: "settings", path: "/settings", viewports: [{ width: 800, height: 600 }] }] }, ["light"]);
    expect(shots.map((s) => s.name)).toEqual(["settings--default--800x600--light"]);
  });

  it("runs the route's setup, then the state's", async () => {
    const calls: string[] = [];
    const [shot] = routeShots(
      { dir: "dist", routes: [{ name: "a", path: "/", setup: () => void calls.push("route"), states: { open: { setup: () => void calls.push("state") } } }] },
      ["light"],
    );
    await shot.setup!(undefined as never, shot);
    expect(calls).toEqual(["route", "state"]);
  });

  it("refuses names that would make awkward file names, and unknown viewports", () => {
    expect(() => routeShots({ dir: "d", routes: [{ name: "Review page", path: "/" }] })).toThrow(/lower-case/);
    expect(() => routeShots({ dir: "d", routes: [{ name: "r", path: "/", states: { "Not OK": [] } }] })).toThrow(/lower-case/);
    expect(() => routeShots({ dir: "d", routes: [{ name: "r", path: "/", viewports: ["tablet" as never] }] })).toThrow(/unknown viewport "tablet"/);
  });
});

describe("shot URLs and requests", () => {
  it("resolves a path under the app's base path", () => {
    expect(resolveShotUrl("/review?tab=queue", "http://127.0.0.1:4000/app/")).toBe("http://127.0.0.1:4000/app/review?tab=queue");
    expect(resolveShotUrl("iframe.html?id=a", "http://127.0.0.1:4000/")).toBe("http://127.0.0.1:4000/iframe.html?id=a");
    expect(resolveShotUrl("https://example.test/x", "http://127.0.0.1:4000/")).toBe("https://example.test/x");
  });

  it("hands MSW a Fetch request with the method, headers and body the page sent", async () => {
    const request = toFetchRequest({
      url: () => "http://127.0.0.1:4000/api/items",
      method: () => "POST",
      headers: () => ({ "content-type": "application/json", authorization: "Bearer t" }),
      postDataBuffer: () => Buffer.from('{"name":"Cone 6"}'),
    });
    expect(request.method).toBe("POST");
    expect(request.headers.get("authorization")).toBe("Bearer t");
    expect(await request.json()).toEqual({ name: "Cone 6" });
  });
});

describe("report", () => {
  const report = (over: Partial<VisualReport>): VisualReport => ({
    total: 4, same: 4, tolerated: [], changed: [], added: [], obsolete: [], errors: [], warnings: [], updated: false, failed: false, ...over,
  });

  it("prints what matched and, when failing, where the diffs are", () => {
    expect(formatReport(report({}))).toBe("4 of 4 screenshots match their baselines.");
    expect(formatReport(report({ tolerated: ["b--dark.png: 1 pixels differ (0.001%)"] }))).toBe(
      "4 of 4 screenshots match their baselines (3 identical, 1 within tolerance).\nwithin   b--dark.png: 1 pixels differ (0.001%)",
    );
    const text = formatReport(report({ same: 3, changed: ["a--light.png: 120 pixels differ (0.100%)"], failed: true }));
    expect(text).toContain("changed  a--light.png: 120 pixels differ");
    expect(text).toContain("run with --update");
  });

  it("warns when Playwright is not pinned to an exact version", () => {
    const dir = tempDir();
    try {
      writeFileSync(join(dir, "package.json"), JSON.stringify({ devDependencies: { playwright: "^1.63.0" } }));
      expect(pinWarnings(dir)).toEqual([expect.stringContaining('playwright is "^1.63.0"')]);
      writeFileSync(join(dir, "package.json"), JSON.stringify({ devDependencies: { playwright: "1.63.0" } }));
      expect(pinWarnings(dir)).toEqual([]);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
