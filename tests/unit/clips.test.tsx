import { afterEach, describe, expect, it } from "vite-plus/test";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { onlineManager, useQueryClient } from "@tanstack/react-query";
import {
  ClipsProvider,
  SayAgain,
  clipsQueryKey,
  useClips,
  useSayOnShow,
  createApi,
} from "../../src";
import { installFakeSpeech, renderWithStrata } from "../../src/testing";
import { server } from "../utils/server";

const list = { "Which one is the cat?": "/clips/cat.mp3", "The sound": "/clips/sound.mp3" };
let reads = 0;
function serve(answer: () => Response = () => HttpResponse.json(list)) {
  reads = 0;
  server.use(
    http.get("*/api/clips", () => {
      reads++;
      return answer();
    }),
  );
}
const api = createApi();
const load = () => api.get<Record<string, string>>("/api/clips");

let speech: ReturnType<typeof installFakeSpeech>;
afterEach(() => speech?.uninstall());

function Prompt({ text }: { text: string }) {
  const { ready } = useClips();
  useSayOnShow(text);
  return <p>{ready ? "ready" : "waiting"}</p>;
}

describe("ClipsProvider (#318)", () => {
  it("reads the list once for every prompt and plays each line's clip through the app's base", async () => {
    serve();
    speech = installFakeSpeech();
    const user = userEvent.setup();
    renderWithStrata(
      <ClipsProvider load={load} lang="en-GB">
        <SayAgain text="Which one is the cat?" />
        <SayAgain text="The sound" verb="Hear" />
      </ClipsProvider>,
    );
    await waitFor(() => expect(reads).toBe(1));
    await user.click(await screen.findByRole("button", { name: "Say: Which one is the cat?" }));
    expect(speech.clips()).toEqual(["/clips/cat.mp3"]);
    await user.click(screen.getByRole("button", { name: "Hear: The sound" }));
    expect(speech.clips()).toEqual(["/clips/cat.mp3", "/clips/sound.mp3"]);
    expect(reads).toBe(1);
  });

  it("splits a prompt into lines with a clip each, and describes a line that has none instead of reading it out", async () => {
    serve();
    speech = installFakeSpeech();
    function Probe() {
      const clips = useClips();
      return (
        <>
          <p>{JSON.stringify(clips.parts("Which one is the cat? | /m/ | Tap it"))}</p>
          <p>{clips.words("Which one is the cat? | /m/")}</p>
        </>
      );
    }
    renderWithStrata(
      <ClipsProvider
        load={load}
        split={(t) => t.split("|")}
        describe={(line) => (line === "/m/" ? "the sound m" : undefined)}
      >
        <Probe />
      </ClipsProvider>,
    );
    await waitFor(() => expect(screen.getByText(/cat\.mp3/)).toBeInTheDocument());
    expect(JSON.parse(screen.getByText(/cat\.mp3/).textContent ?? "")).toEqual([
      { text: "Which one is the cat?", clip: "/clips/cat.mp3" },
      { text: "the sound m", clip: null },
      { text: "Tap it", clip: null },
    ]);
    expect(screen.getByText("Which one is the cat? the sound m")).toBeInTheDocument();
  });

  it("holds a prompt spoken on show until the list has arrived, so the first one is a clip too", async () => {
    let release: () => void = () => {};
    const gate = new Promise<void>((r) => (release = r));
    server.use(
      http.get("*/api/clips", async () => {
        await gate;
        return HttpResponse.json(list);
      }),
    );
    speech = installFakeSpeech();
    renderWithStrata(
      <ClipsProvider load={load}>
        <Prompt text="Which one is the cat?" />
      </ClipsProvider>,
    );
    expect(screen.getByText("waiting")).toBeInTheDocument();
    expect(speech.said).toHaveLength(0);
    release();
    await screen.findByText("ready");
    expect(speech.clips()).toEqual(["/clips/cat.mp3"]);
  });

  it("is ready when the list failed, and the browser's voice says the prompt", async () => {
    serve(() => HttpResponse.json({ detail: "down" }, { status: 400 }));
    speech = installFakeSpeech();
    renderWithStrata(
      <ClipsProvider load={load}>
        <Prompt text="Which one is the cat?" />
      </ClipsProvider>,
    );
    await screen.findByText("ready");
    expect(speech.texts()).toEqual(["Which one is the cat?"]);
  });

  it("is ready when the list fails while the browser is offline, instead of waiting for the network", async () => {
    speech = installFakeSpeech();
    onlineManager.setOnline(false);
    try {
      renderWithStrata(
        <ClipsProvider load={() => Promise.reject(new Error("offline"))}>
          <Prompt text="Which one is the cat?" />
        </ClipsProvider>,
      );
      await screen.findByText("ready", undefined, { timeout: 4000 });
      expect(speech.texts()).toEqual(["Which one is the cat?"]);
    } finally {
      onlineManager.setOnline(true);
    }
  });

  it("says a prompt once, not again when the provider is given new functions on each render", async () => {
    serve();
    speech = installFakeSpeech();
    const { rerender } = renderWithStrata(
      <ClipsProvider load={load} split={(t) => [t]}>
        <Prompt text="The sound" />
      </ClipsProvider>,
    );
    await screen.findByText("ready");
    await waitFor(() => expect(speech.clips()).toHaveLength(1));
    rerender(
      <ClipsProvider load={load} split={(t) => [t]}>
        <Prompt text="The sound" />
      </ClipsProvider>,
    );
    rerender(
      <ClipsProvider load={load} split={(t) => [t]}>
        <Prompt text="Which one is the cat?" />
      </ClipsProvider>,
    );
    await waitFor(() => expect(speech.clips()).toEqual(["/clips/sound.mp3", "/clips/cat.mp3"]));
  });

  it("reads the list again only when the app invalidates its key", async () => {
    serve();
    function Keep() {
      const qc = useQueryClient();
      return (
        <button onClick={() => void qc.invalidateQueries({ queryKey: clipsQueryKey })}>
          Recording kept
        </button>
      );
    }
    renderWithStrata(
      <ClipsProvider load={load}>
        <Keep />
        <Prompt text="x" />
      </ClipsProvider>,
    );
    await screen.findByText("ready");
    expect(reads).toBe(1);
    await userEvent.setup().click(screen.getByRole("button", { name: "Recording kept" }));
    await waitFor(() => expect(reads).toBe(2));
  });

  it("is the browser's voice alone, ready at once, outside a provider; muted says nothing", async () => {
    speech = installFakeSpeech();
    function Muted() {
      useSayOnShow("Hej", { muted: true });
      return null;
    }
    const { unmount } = render(
      <>
        <Prompt text="Hej" />
        <Muted />
      </>,
    );
    expect(screen.getByText("ready")).toBeInTheDocument();
    expect(speech.texts()).toEqual(["Hej"]);
    unmount();
    expect(speech.said.at(-1)?.cancelled).toBe(true); // the screen went, so did the prompt
  });
});
