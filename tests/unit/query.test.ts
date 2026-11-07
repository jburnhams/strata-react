import { describe, expect, it } from "vitest";
import { http, HttpResponse } from "msw";
import { HttpError, fetchJson } from "../../src";
import { server } from "../utils/server";

describe("fetchJson", () => {
  const echo = http.get("/api/echo", ({ request }) =>
    HttpResponse.json({ accept: request.headers.get("accept"), auth: request.headers.get("authorization") }),
  );

  it("keeps a caller's Headers instance and adds Accept", async () => {
    server.use(echo);
    const body = await fetchJson<{ accept: string; auth: string }>("/api/echo", {
      headers: new Headers({ Authorization: "Bearer t" }),
    });
    expect(body).toEqual({ accept: "application/json", auth: "Bearer t" });
  });

  it("keeps tuple-array headers and a caller's own Accept", async () => {
    server.use(echo);
    const body = await fetchJson<{ accept: string; auth: string }>("/api/echo", {
      headers: [["Authorization", "Bearer t"], ["Accept", "application/vnd.kiln+json"]],
    });
    expect(body).toEqual({ accept: "application/vnd.kiln+json", auth: "Bearer t" });
  });

  it("throws an HttpError on a non-2xx response", async () => {
    server.use(http.get("/api/missing", () => new HttpResponse(null, { status: 404, statusText: "Not Found" })));
    await expect(fetchJson("/api/missing")).rejects.toBeInstanceOf(HttpError);
  });
});
