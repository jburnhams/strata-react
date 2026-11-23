import { describe, expect, it, vi } from "vitest";
import { screen, render, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { useLocation } from "react-router";
import { server } from "../utils/server";
import {
  ButtonLink,
  ChoiceGroup,
  NativeSelect,
  SayAgain,
  TextLink,
  ToggleGroup,
  appBase,
  createApi,
  createTypedApi,
  fetchJson,
  pickVoice,
  useSearchParam,
  withBase,
} from "../../src";
import { expectOneFilledButton, installFakeSpeech, installStorageShim, memoryStorage, renderWithStrata } from "../../src/testing";
import { explainImportFailure } from "../../src/api-types/generate";

// Issues #293-#299: the plumbing every app on Strata wrote by hand (base path, JSON writes, a URL
// choice, router links, speech, Node 26's storage), tested the way an app would use it.

function Search() {
  const { pathname, search } = useLocation();
  return <output data-testid="search">{pathname + search}</output>;
}

describe("fetchJson json (#296) and createApi (#295)", () => {
  it("sends the value as a JSON body with the content type and POST, keeping the caller's headers", async () => {
    let seen: { method: string; type: string | null; auth: string | null; body: unknown } | undefined;
    server.use(
      http.post("http://localhost/api/learners", async ({ request }) => {
        seen = { method: request.method, type: request.headers.get("content-type"), auth: request.headers.get("authorization"), body: await request.json() };
        return HttpResponse.json({ id: 7 });
      }),
    );
    const out = await fetchJson<{ id: number }>("http://localhost/api/learners", { json: { nickname: "Fox" }, headers: { Authorization: "Bearer t" } });
    expect(out).toEqual({ id: 7 });
    expect(seen).toEqual({ method: "POST", type: "application/json", auth: "Bearer t", body: { nickname: "Fox" } });
  });

  it("puts the base in front of root-relative paths only, and createApi applies it to every verb", async () => {
    expect(withBase("/api/x", "/proxy")).toBe("/proxy/api/x");
    expect(withBase("api/x", "/proxy")).toBe("api/x");
    expect(withBase("https://other.test/x", "/proxy")).toBe("https://other.test/x");
    expect(withBase("//cdn.test/x", "/proxy")).toBe("//cdn.test/x");
    const seen: string[] = [];
    server.use(http.all("*/proxy/api/*", ({ request }) => { seen.push(`${request.method} ${new URL(request.url).pathname}`); return new HttpResponse(null, { status: 204 }); }));
    const api = createApi({ base: "/proxy" });
    await api.get("/api/a");
    await api.post("/api/b", { n: 1 });
    await api.put("/api/c", { n: 2 });
    await api.patch("/api/d", { n: 3 });
    await api.delete("/api/e");
    expect(seen).toEqual(["GET /proxy/api/a", "POST /proxy/api/b", "PUT /proxy/api/c", "PATCH /proxy/api/d", "DELETE /proxy/api/e"]);
    expect(api.url("/files/1.png")).toBe("/proxy/files/1.png");
  });

  it("reads the base from a <base href>, and is empty without one", () => {
    expect(appBase()).toBe("");
    const el = document.createElement("base");
    el.href = "http://localhost/tools/flash/";
    document.head.append(el);
    try {
      expect(appBase()).toBe("/tools/flash");
      expect(withBase("/api/x")).toBe("/tools/flash/api/x");
    } finally {
      el.remove();
    }
    expect(appBase(undefined)).toBe("");
  });
});

describe("useSearchParam (#297)", () => {
  type Mode = "all" | "new" | "due";
  const isMode = (raw: string): raw is Mode => ["all", "new", "due"].includes(raw);
  function Screen() {
    const [mode, setMode] = useSearchParam<Mode>("mode", { default: "all", parse: isMode });
    return (
      <>
        <p>Mode {mode}</p>
        <button onClick={() => setMode("due")}>Due</button>
        <button onClick={() => setMode("all")}>All</button>
        <Search />
      </>
    );
  }

  it("reads, writes, keeps other params, and leaves the default out of the URL", async () => {
    renderWithStrata(<Screen />, { route: "/play?learner=3" });
    expect(screen.getByText("Mode all")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Due" }));
    expect(screen.getByTestId("search")).toHaveTextContent("/play?learner=3&mode=due");
    await userEvent.click(screen.getByRole("button", { name: "All" }));
    expect(screen.getByTestId("search")).toHaveTextContent("/play?learner=3");
    expect(screen.getByTestId("search")).not.toHaveTextContent("mode");
  });

  it("reads an invalid value as the default", () => {
    renderWithStrata(<Screen />, { route: "/play?mode=nonsense" });
    expect(screen.getByText("Mode all")).toBeInTheDocument();
  });

  it("is the sugar on NativeSelect, ChoiceGroup and ToggleGroup", async () => {
    renderWithStrata(
      <>
        <NativeSelect aria-label="Round" param="round" paramDefault="all">
          <option value="all">All</option>
          <option value="due">Due</option>
        </NativeSelect>
        <ChoiceGroup legend="Who" name="who" param="who" choices={[{ value: "fox", label: "Fox" }, { value: "owl", label: "Owl" }]} />
        <ToggleGroup label="Size" param="size" options={[{ value: "s", label: "Small" }, { value: "l", label: "Large" }]} />
        <Search />
      </>,
      { route: "/?size=l" },
    );
    expect(screen.getByRole("radio", { name: "Large" })).toBeChecked();
    await userEvent.selectOptions(screen.getByRole("combobox", { name: "Round" }), "due");
    await userEvent.click(screen.getByRole("radio", { name: "Owl" }));
    expect(screen.getByTestId("search")).toHaveTextContent("/?size=l&round=due&who=owl");
    await userEvent.selectOptions(screen.getByRole("combobox", { name: "Round" }), "all");
    await userEvent.click(screen.getByRole("radio", { name: "Fox" }));
    expect(screen.getByTestId("search")).toHaveTextContent("/?size=l");
    expect(screen.getByTestId("search")).not.toHaveTextContent("round");
  });
});

describe("review fixes", () => {
  it("finds options inside optgroups and fragments", async () => {
    renderWithStrata(
      <NativeSelect aria-label="Round" param="round" paramDefault="all">
        <option value="all">All</option>
        <optgroup label="Later"><option value="due">Due</option></optgroup>
      </NativeSelect>,
      { route: "/?round=due" },
    );
    expect(screen.getByRole("combobox", { name: "Round" })).toHaveValue("due");
  });

  it("stops what is being said when muted turns on", () => {
    const speech = installFakeSpeech();
    try {
      const { rerender } = render(<SayAgain text="Hej" />);
      void userEvent.click(screen.getByRole("button", { name: "Say: Hej" }));
      return waitFor(() => expect(speech.said).toHaveLength(1)).then(() => {
        rerender(<SayAgain text="Hej" muted />);
        expect(speech.said[0]!.cancelled).toBe(true);
      }).finally(() => speech.uninstall());
    } catch (e) {
      speech.uninstall();
      throw e;
    }
  });
});

describe("ButtonLink and TextLink (#294)", () => {
  it("navigates client-side under the router, counts as the one filled button, and opens downloads as plain links", async () => {
    renderWithStrata(
      <>
        <ButtonLink to="/learners/7" variant="default">Play as Fox</ButtonLink>
        <ButtonLink href="/export.csv" download>Export</ButtonLink>
        <TextLink to="/log">Open the log</TextLink>
        <Search />
      </>,
    );
    expectOneFilledButton();
    expect(screen.getByRole("link", { name: "Export" })).toHaveAttribute("href", "/export.csv");
    expect(screen.getByRole("link", { name: "Export" })).toHaveAttribute("download");
    expect(screen.getByRole("link", { name: "Open the log" })).toHaveAttribute("href", "/log");
    await userEvent.click(screen.getByRole("link", { name: "Play as Fox" }));
    expect(screen.getByTestId("search")).toHaveTextContent("/learners/7");
    await userEvent.click(screen.getByRole("link", { name: "Open the log" }));
    expect(screen.getByTestId("search")).toHaveTextContent("/log");
  });
});

describe("speech (#299)", () => {
  it("says the sentence, cancels the one before it, picks the voice by language, and names the button by it", async () => {
    const speech = installFakeSpeech([{ name: "Daniel", lang: "en-GB" }, { name: "Alva", lang: "sv-SE" }]);
    try {
      expect(pickVoice([{ name: "Alva", lang: "sv-SE" } as SpeechSynthesisVoice], "sv")?.name).toBe("Alva");
      render(<SayAgain text="Which one is the cat?" lang="en-GB" />);
      const button = screen.getByRole("button", { name: "Say: Which one is the cat?" });
      await userEvent.click(button);
      await userEvent.click(button);
      expect(speech.said).toHaveLength(2);
      expect(speech.said[0]!.cancelled).toBe(true);
      expect(speech.said[1]).toMatchObject({ text: "Which one is the cat?", lang: "en-GB", voice: "Daniel", rate: 0.9, cancelled: false });
      speech.finish();
    } finally {
      speech.uninstall();
    }
  });

  it("uses a voice that arrives late, and draws nothing where there is no speech or it is muted", async () => {
    const speech = installFakeSpeech();
    const { unmount } = render(<SayAgain text="Hej" lang="sv" />);
    speech.setVoices([{ name: "Alva", lang: "sv-SE" }]);
    await userEvent.click(await screen.findByRole("button", { name: "Say: Hej" }));
    expect(speech.said[0]!.voice).toBe("Alva");
    unmount();
    render(<SayAgain text="Hej" muted />);
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
    speech.uninstall();
    render(<SayAgain text="Hej" />);
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });
});

describe("storage shim (#298)", () => {
  it("replaces storage that throws with an in-memory one, and leaves working storage alone", () => {
    const real = globalThis.localStorage;
    const broken = vi.spyOn(globalThis, "localStorage", "get").mockReturnValue(undefined as never);
    const restore = installStorageShim();
    broken.mockRestore();
    try {
      globalThis.localStorage.setItem("a", "1");
      expect(globalThis.localStorage.getItem("a")).toBe("1");
      expect(globalThis.localStorage.getItem("b")).toBeNull();
    } finally {
      restore();
    }
    expect(globalThis.localStorage).toBe(real);
    const store = memoryStorage();
    store.setItem("k", "v");
    expect([store.length, store.key(0)]).toEqual([1, "k"]);
  });
});

describe("strata-api-types import failures (#293)", () => {
  it("asks for an install only when the package is missing, and names TypeScript 7 otherwise", () => {
    const missing = Object.assign(new Error("Cannot find package 'openapi-typescript' imported from /app/x.js"), { code: "ERR_MODULE_NOT_FOUND" });
    expect(explainImportFailure(missing, 6)).toMatch(/npm install --save-dev openapi-typescript/);
    const broken = new TypeError("Cannot read properties of undefined (reading 'ScriptTarget')");
    const seven = explainImportFailure(broken, 7);
    expect(seven).not.toMatch(/npm install --save-dev openapi-typescript/);
    expect(seven).toMatch(/ScriptTarget/);
    expect(seven).toMatch(/version 7.*no JavaScript API/);
    expect(explainImportFailure(broken, 6)).toMatch(/did not load/);
  });
});

describe("createTypedApi (#296)", () => {
  // The shape openapi-typescript writes for `paths`.
  type paths = {
    "/api/learners": {
      get: { parameters: { query?: { archived?: boolean; tag?: string[] }; path?: never }; responses: { 200: { content: { "application/json": { id: number; nickname: string }[] } } } };
      post: { requestBody: { content: { "application/json": { nickname: string } } }; responses: { 201: { content: { "application/json": { id: number; nickname: string } } } } };
    };
    "/api/learners/{id}": {
      delete: { parameters: { path: { id: number }; query?: never }; responses: { 204: { content?: never } } };
    };
  };

  it("fills and escapes path params, writes the query, sends the typed body and returns the typed answer", async () => {
    const seen: string[] = [];
    server.use(
      http.get("*/proxy/api/learners", ({ request }) => { seen.push(new URL(request.url).search); return HttpResponse.json([{ id: 1, nickname: "Fox" }]); }),
      http.post("*/proxy/api/learners", async ({ request }) => HttpResponse.json({ id: 2, ...((await request.json()) as object) } as never, { status: 201 })),
      http.delete("*/proxy/api/learners/:id", ({ params }) => { seen.push(`delete ${String(params.id)}`); return new HttpResponse(null, { status: 204 }); }),
    );
    const api = createTypedApi<paths>({ base: "/proxy" });
    const list = await api.get("/api/learners", { query: { archived: false, tag: ["a", "b"] } });
    expect(list[0]!.nickname).toBe("Fox");
    expect(seen[0]).toBe("?archived=false&tag=a&tag=b");
    const made = await api.post("/api/learners", { json: { nickname: "Owl" } });
    expect(made).toEqual({ id: 2, nickname: "Owl" });
    await api.delete("/api/learners/{id}", { path: { id: 7 } });
    expect(seen[1]).toBe("delete 7");
    // @ts-expect-error a path the server does not have
    void (() => api.get("/api/nope"));
    // @ts-expect-error the body is required and typed
    void (() => api.post("/api/learners", { json: { name: "x" } }));
    // @ts-expect-error the path parameter is required
    void (() => api.delete("/api/learners/{id}", {}));
  });
});
