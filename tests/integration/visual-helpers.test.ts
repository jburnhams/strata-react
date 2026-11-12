// @vitest-environment node
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { chromium, type Browser } from "playwright";
import { capture, dropFiles, serveStatic, DROPPED_FILE_MODIFIED, type StaticServer } from "../../src/visual";
import type { Shot } from "../../src/visual";

// Two helpers from issue #136, run in real Chromium against a throwaway page: the theme a shot
// asks for reaches an app that owns the .dark class and defaults to dark, and dropFiles gives a
// drop target what a desktop drop gives it (files, a file-system entry, a fixed lastModified).

let dir: string;
let server: StaticServer;
let browser: Browser;

beforeAll(async () => {
  dir = mkdtempSync(join(tmpdir(), "strata-visual-helpers-"));
  writeFileSync(
    join(dir, "index.html"),
    `<!doctype html><meta charset="utf-8"><body><div id="root"></div><script>
      // An app like strata-vid: default preference "dark", reads the stored choice, owns the class.
      var p = "dark";
      try { var s = localStorage.getItem("strata-color-scheme"); if (s === "light" || s === "dark" || s === "system") p = s; } catch (e) {}
      document.documentElement.classList.toggle("dark", p === "dark");
      var root = document.getElementById("root");
      root.textContent = "preference " + p;
      var zone = document.createElement("div");
      zone.id = "zone"; zone.textContent = "drop here"; zone.style.cssText = "width:200px;height:80px";
      root.appendChild(zone);
      zone.addEventListener("dragover", function (e) { e.preventDefault(); });
      zone.addEventListener("drop", function (e) {
        e.preventDefault();
        var out = [];
        for (var item of e.dataTransfer.items) {
          var entry = item.webkitGetAsEntry();
          if (!entry || !entry.isFile) continue;
          var file = item.getAsFile();
          out.push(file.name + "|" + file.type + "|" + file.size + "|" + file.lastModified);
        }
        root.setAttribute("data-dropped", out.join(";"));
      });
    </script>`,
  );
  server = await serveStatic(dir);
  browser = await chromium.launch();
});
afterAll(async () => {
  await browser?.close();
  await server?.close();
  rmSync(dir, { recursive: true, force: true });
});

const shot = (theme: "light" | "dark", extra: Partial<Shot> = {}): Shot => ({
  name: `page--${theme}`,
  path: "/",
  theme,
  viewport: { width: 400, height: 300 },
  root: "#root",
  clip: "page",
  ...extra,
});

describe("capture", () => {
  it("reaches an app that defaults to dark with the light theme", async () => {
    let seen = "";
    await capture(browser, shot("light", { setup: async (page) => void (seen = (await page.locator("#root").textContent()) ?? "") }), { baseUrl: server.url, checkFonts: false });
    expect(seen).toContain("preference light");
    await capture(browser, shot("dark", { setup: async (page) => void (seen = (await page.locator("#root").textContent()) ?? "") }), { baseUrl: server.url, checkFonts: false });
    expect(seen).toContain("preference dark");
  }, 60_000);
});

describe("dropFiles", () => {
  it("drops bytes with a name, a type, an entry and a fixed lastModified", async () => {
    let dropped = "";
    await capture(
      browser,
      shot("light", {
        setup: async (page) => {
          await dropFiles(page, "#zone", [
            { name: "clip.mp4", type: "video/mp4", content: new Uint8Array([1, 2, 3, 4]) },
            { name: "notes.txt", type: "text/plain", content: "hello", lastModified: 1_700_000_000_000 },
          ]);
          dropped = (await page.locator("#root").getAttribute("data-dropped")) ?? "";
        },
      }),
      { baseUrl: server.url, checkFonts: false },
    );
    expect(dropped).toBe(`clip.mp4|video/mp4|4|${DROPPED_FILE_MODIFIED};notes.txt|text/plain|5|1700000000000`);
  }, 60_000);
});
