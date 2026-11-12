// @vitest-environment node
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { PNG } from "pngjs";
import L from "leaflet-node";
import { waitForTiles } from "leaflet-node/testing";
import { geo } from "../../src/lib/geo";

// A real render of the map Strata's `RouteMap` builds, to pixels, in Node (jsdom has no layout and
// draws nothing; leaflet-node gives Leaflet a window and a native canvas). It checks the things the
// jsdom tests cannot see: that tiles from the app's URL reach the picture, that the route is drawn
// where `geo.bounds` says the map is fitted, and that colour by value changes the pixels. The tiles
// come from a local server in this file, never a live provider. `RouteMap` itself needs React's DOM;
// this draws the same layers with the same geometry helpers, so the picture is checked against the
// numbers.

const GROUND = { r: 235, g: 231, b: 223 };
let server: Server;
let base = "";

function tilePng() {
  const png = new PNG({ width: 256, height: 256 });
  for (let i = 0; i < 256 * 256; i++) {
    png.data[i * 4] = GROUND.r;
    png.data[i * 4 + 1] = GROUND.g;
    png.data[i * 4 + 2] = GROUND.b;
    png.data[i * 4 + 3] = 255;
  }
  return PNG.sync.write(png);
}

beforeAll(async () => {
  const body = tilePng();
  server = createServer((_req, res) => {
    res.writeHead(200, { "Content-Type": "image/png", "Content-Length": body.length });
    res.end(body);
  });
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});
afterAll(() => new Promise<void>((r) => server.close(() => r())));

const route = Array.from({ length: 60 }, (_, i) => [51.5 + i * 0.0004, -0.12 + i * 0.0007 + 0.001 * Math.sin(i / 6)] as const);

async function render(colour: (i: number) => string) {
  const map = L.map(document.createElement("div"), { zoomControl: false, attributionControl: false, fadeAnimation: false, zoomAnimation: false });
  map.setView([51.5, -0.12], 13, { animate: false });
  map.setSize(512, 384);
  L.tileLayer(`${base}/{z}/{x}/{y}.png`, { attribution: "© Fixture" }).addTo(map);
  const box = geo.bounds(route)!;
  map.fitBounds([[box[0][0], box[0][1]], [box[1][0], box[1][1]]], { padding: [24, 24], animate: false });
  for (let i = 1; i < route.length; i++) L.polyline([[route[i - 1][0], route[i - 1][1]], [route[i][0], route[i][1]]], { color: colour(i), weight: 6, lineCap: "round" }).addTo(map);
  await waitForTiles(map);
  await new Promise((r) => setTimeout(r, 200));
  return PNG.sync.read(await map.toBuffer("png"));
}

const count = (png: PNG, test: (r: number, g: number, b: number) => boolean) => {
  let n = 0;
  for (let i = 0; i < png.width * png.height; i++) if (test(png.data[i * 4], png.data[i * 4 + 1], png.data[i * 4 + 2])) n++;
  return n;
};
const near = (c: { r: number; g: number; b: number }) => (r: number, g: number, b: number) => Math.abs(r - c.r) < 6 && Math.abs(g - c.g) < 6 && Math.abs(b - c.b) < 6;

describe("a rendered map", () => {
  it("shows the app's tiles and the route inside the fitted view", async () => {
    const png = await render(() => "#d62828");
    expect([png.width, png.height]).toEqual([512, 384]);
    expect(count(png, near(GROUND))).toBeGreaterThan(png.width * png.height * 0.8); // tiles reached the picture
    const red = count(png, (r, g, b) => r > 190 && g < 80 && b < 80);
    expect(red).toBeGreaterThan(500); // the route is drawn
    // Fitted with 24px of padding: no route pixel touches the edge.
    for (let x = 0; x < png.width; x++) for (const y of [0, png.height - 1]) expect(png.data[(y * png.width + x) * 4 + 1]).toBeGreaterThan(80);
  }, 30_000);

  it("colours by value: two steps put two colours on the picture", async () => {
    const png = await render((i) => (i < 30 ? "#d62828" : "#1d4ed8"));
    const red = count(png, (r, g, b) => r > 190 && g < 80 && b < 80);
    const blue = count(png, (r, g, b) => b > 170 && r < 60 && g < 100);
    expect(red).toBeGreaterThan(200);
    expect(blue).toBeGreaterThan(200);
  }, 30_000);
});
