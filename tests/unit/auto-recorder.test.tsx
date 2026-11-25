import * as React from "react";
import { describe, expect, it } from "vitest";
import { act, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Button, ListeningLevel, createSegmenter, rmsDb, useAutoRecorder, type AutoTake, type Microphone, type Segment } from "../../src";
import { fakeMicrophone, renderWithStrata, speechScript } from "../../src/testing";

// Hands-free recording: the segmenter read sample by sample over made-up speech and quiet, then the hook
// driven by the fake microphone's script through renderWithStrata, and the level it draws.

const RATE = 16_000;

/** A 220 Hz tone (peak `amplitude`) or, at 0, digital quiet, for `seconds`. */
function sound(seconds: number, amplitude: number, hiss = 0): Float32Array {
  const out = new Float32Array(Math.round(seconds * RATE));
  // A fixed pattern for the hiss, not Math.random, so every run reads the same.
  for (let i = 0; i < out.length; i++) out[i] = amplitude * Math.sin((2 * Math.PI * 220 * i) / RATE) + hiss * (((i * 7919) % 13) / 6 - 1);
  return out;
}

/** Feeds `parts` in 2048-sample chunks, as the browser's worklet sends them, and gathers the takes. */
function feed(parts: Float32Array[], options: Parameters<typeof createSegmenter>[1] = {}) {
  const seg = createSegmenter(RATE, options);
  const all = new Float32Array(parts.reduce((n, p) => n + p.length, 0));
  let at = 0;
  for (const p of parts) {
    all.set(p, at);
    at += p.length;
  }
  const takes: Segment[] = [];
  for (let i = 0; i < all.length; i += 2048) takes.push(...seg.push(all.subarray(i, i + 2048)));
  return { seg, takes, seconds: takes.map((t) => Math.round((t.samples.length / RATE) * 100) / 100) };
}

describe("createSegmenter", () => {
  it("reads a frame's RMS in dBFS, zeros as far below anything real", () => {
    expect(rmsDb(new Float32Array(320).fill(0.5))).toBeCloseTo(-6.02, 1);
    expect(rmsDb(new Float32Array(320))).toBe(-100);
    expect(rmsDb(new Float32Array(0))).toBe(-100);
  });

  it("cuts each stretch of speech out with the pad either side, and learns the room", () => {
    const { seg, takes, seconds } = feed([sound(1, 0, 0.001), sound(1.5, 0.3, 0.001), sound(1.5, 0, 0.001), sound(2, 0.2, 0.001), sound(1.2, 0, 0.001)]);
    // 0.3 s before, the speech, 0.3 s after, to the 20 ms frame.
    expect(seconds).toEqual([2.1, 2.6]);
    expect(takes.every((t) => !t.cut)).toBe(true);
    expect(seg.noise).toBeLessThan(-55);
    expect(seg.speaking).toBe(false);
    expect(seg.seconds).toBe(0);
  });

  it("keeps a pause at a comma inside the take, and ends it after a second of quiet", () => {
    const { seconds } = feed([sound(0.5, 0), sound(1, 0.3), sound(0.6, 0), sound(1, 0.3), sound(1.1, 0)]);
    expect(seconds).toEqual([3.2]);
    const split = feed([sound(0.5, 0), sound(1, 0.3), sound(0.6, 0), sound(1, 0.3), sound(1.1, 0)], { silenceSeconds: 0.5 });
    expect(split.seconds).toEqual([1.6, 1.6]);
  });

  it("drops a click, a cough and speech too quiet to stand out from the room", () => {
    // 40 ms is shorter than the 60 ms onset; 0.2 s of speech is under the 0.3 s least.
    expect(feed([sound(0.5, 0), sound(0.04, 0.5), sound(1.5, 0), sound(0.2, 0.3), sound(1.5, 0)]).takes).toEqual([]);
    // A loud room: the "speech" is 6 dB over it, half the onset.
    expect(feed([sound(1, 0.05), sound(1.5, 0.1), sound(1.5, 0.05)]).takes).toEqual([]);
    // Below the floor in digital quiet: far over the room, but under -55 dBFS RMS.
    expect(feed([sound(1, 0), sound(1.5, 0.0015), sound(1.5, 0)]).takes).toEqual([]);
  });

  it("cuts a take at the longest and waits for quiet before the next", () => {
    const { takes, seconds } = feed([sound(0.5, 0), sound(3, 0.3), sound(1.5, 0), sound(1, 0.3), sound(1.5, 0)], { maxSeconds: 2 });
    expect(seconds).toEqual([2, 1.6]);
    expect(takes.map((t) => t.cut)).toEqual([true, false]);
  });

  it("hands over the take being heard on flush, and drops it on reset", () => {
    const heard = feed([sound(0.5, 0), sound(1, 0.3)]);
    expect(heard.seg.speaking).toBe(true);
    expect(heard.seg.seconds).toBeCloseTo(1.3, 1);
    expect(heard.seg.flush()?.samples.length).toBe(1.3 * RATE);
    expect(heard.seg.flush()).toBeNull();
    const dropped = feed([sound(0.5, 0), sound(1, 0.3)]);
    dropped.seg.reset();
    expect(dropped.seg.speaking).toBe(false);
    expect(dropped.seg.flush()).toBeNull();
    expect(dropped.seg.noise).toBe(-60);
  });

  it("starts from quiet it has not heard yet: speech at once, then the room", () => {
    // Speaking as listening starts: the first frame is taken as the room, so the take starts only after it.
    const { seconds } = feed([sound(1, 0.3), sound(1.5, 0), sound(1, 0.3), sound(1.5, 0)]);
    expect(seconds).toEqual([1.6]);
    expect(createSegmenter(RATE).noise).toBeNull();
  });
});

// A screen as an app would write one: Listen, then each take as it arrives, Pause, Stop.
function Booth({ microphone, maxSeconds = 30 }: { microphone?: Microphone; maxSeconds?: number }) {
  const [paused, setPaused] = React.useState(false);
  const [takes, setTakes] = React.useState<AutoTake[]>([]);
  const [started, setStarted] = React.useState("");
  const recorder = useAutoRecorder({ maxSeconds, paused, microphone, onTake: (t) => setTakes((all) => [...all, t]) });
  return (
    <div>
      {recorder.listening ? (
        <Button onClick={recorder.stop}>Stop listening</Button>
      ) : (
        <Button onClick={() => void recorder.start().then((ok) => setStarted(String(ok)))}>Listen</Button>
      )}
      <Button onClick={() => void recorder.start().then((ok) => setStarted(String(ok)))}>Listen again</Button>
      <Button onClick={() => setPaused((p) => !p)}>{paused ? "Resume" : "Pause"}</Button>
      <span>started {started}</span>
      {recorder.state.phase === "listening" && <ListeningLevel state={recorder.state} maxSeconds={maxSeconds} />}
      {recorder.state.phase === "failed" && <p role="alert">{recorder.state.reason}</p>}
      <ol aria-label="Takes">
        {takes.map((t, i) => (
          <li key={i}>
            {t.seconds.toFixed(1)} s {t.cut ? "cut" : "whole"} {t.wav.size} {t.device}
          </li>
        ))}
      </ol>
    </div>
  );
}

describe("useAutoRecorder", () => {
  it("hands over each take as it ends while the microphone stays open", async () => {
    const user = userEvent.setup();
    renderWithStrata(<Booth />, { microphone: fakeMicrophone({ script: speechScript(2, { speak: 1, gap: 1.5 }), speed: 40 }) });
    await user.click(screen.getByRole("button", { name: "Listen" }));
    expect(await screen.findByText(/Listening: start speaking to record/)).toBeInTheDocument();
    await waitFor(() => expect(screen.getAllByRole("listitem")).toHaveLength(2), { timeout: 3000 });
    const [first] = screen.getAllByRole("listitem");
    expect(first).toHaveTextContent(/^1\.6 s whole \d+ Fake USB microphone$/);
    expect(Number(first.textContent!.split(" ")[3])).toBe(44 + 2 * 1.6 * 16_000);
    expect(screen.getByRole("meter", { name: "Input level" })).toHaveAccessibleDescription(/the room is at -60\sdBFS/);
    expect(screen.getByRole("button", { name: "Stop listening" })).toBeInTheDocument();
  });

  it("says when it is hearing a take, and Stop hands it over", async () => {
    const user = userEvent.setup();
    renderWithStrata(<Booth />, { microphone: fakeMicrophone({ script: [{ seconds: 0.5, amplitude: 0 }, { seconds: 60, amplitude: 0.3 }], speed: 20 }) });
    await user.click(screen.getByRole("button", { name: "Listen" }));
    expect(await screen.findByText(/Hearing you: 0:0\d of at most 0:30/)).toBeInTheDocument();
    await waitFor(() => expect(screen.getByText(/Hearing you: 0:01/)).toBeInTheDocument());
    await user.click(screen.getByRole("button", { name: "Stop listening" }));
    expect(screen.getAllByRole("listitem")).toHaveLength(1);
    expect(screen.getByRole("listitem")).toHaveTextContent(/whole/);
    expect(screen.queryByRole("meter")).not.toBeInTheDocument();
  });

  it("cuts a take that runs past the longest", async () => {
    const user = userEvent.setup();
    renderWithStrata(<Booth maxSeconds={1} />, { microphone: fakeMicrophone({ script: [{ seconds: 0.5, amplitude: 0 }, { seconds: 60, amplitude: 0.3 }], speed: 40 }) });
    await user.click(screen.getByRole("button", { name: "Listen" }));
    expect(await screen.findByText(/^1\.0 s cut/)).toBeInTheDocument();
  });

  it("takes nothing while paused, hands over what it heard on Pause, and listens again on Resume", async () => {
    const user = userEvent.setup();
    let send: ((c: Float32Array) => void) | undefined;
    const microphone: Microphone = {
      open(onSamples) {
        send = onSamples;
        return Promise.resolve({ sampleRate: RATE, device: null, close: () => {} });
      },
    };
    const say = (...parts: Float32Array[]) =>
      act(() => {
        for (const p of parts) for (let i = 0; i < p.length; i += 2048) send?.(p.subarray(i, i + 2048));
      });
    renderWithStrata(<Booth microphone={microphone} />);
    await user.click(screen.getByRole("button", { name: "Listen" }));
    await screen.findByRole("button", { name: "Stop listening" });
    say(sound(0.5, 0), sound(1, 0.3));
    await user.click(screen.getByRole("button", { name: "Pause" }));
    expect(screen.getAllByRole("listitem")).toHaveLength(1);
    say(sound(1, 0.3), sound(1.5, 0));
    expect(screen.getAllByRole("listitem")).toHaveLength(1);
    expect(screen.getByRole("meter", { name: "Input level" })).toHaveAccessibleDescription(/Paused: nothing is kept until you resume; the room is at/);
    await user.click(screen.getByRole("button", { name: "Resume" }));
    say(sound(0.5, 0), sound(1, 0.3), sound(1.5, 0));
    expect(screen.getAllByRole("listitem")).toHaveLength(2);
  });

  it("starts paused when asked, refuses a second start, and says why a microphone would not open", async () => {
    const user = userEvent.setup();
    const { unmount } = renderWithStrata(<Booth />, { microphone: fakeMicrophone({ silent: true }) });
    await user.click(screen.getByRole("button", { name: "Pause" }));
    await user.click(screen.getByRole("button", { name: "Listen" }));
    expect(await screen.findByText("started true")).toBeInTheDocument();
    expect(screen.getByRole("meter", { name: "Input level" })).toHaveAccessibleDescription("Paused: nothing is kept until you resume");
    await user.click(screen.getByRole("button", { name: "Listen again" }));
    expect(await screen.findByText("started false")).toBeInTheDocument();
    unmount();
    renderWithStrata(<Booth microphone={fakeMicrophone({ refuse: "No microphone was found. Plug one in, then try again." })} />);
    await user.click(screen.getByRole("button", { name: "Listen" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("No microphone was found.");
    expect(screen.getByText("started false")).toBeInTheDocument();
  });

  it("says when the audio graph failed instead of a refusal", async () => {
    const user = userEvent.setup();
    renderWithStrata(<Booth microphone={fakeMicrophone({ crash: true })} />);
    await user.click(screen.getByRole("button", { name: "Listen" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("The microphone could not be opened (TypeError: audio graph exploded).");
  });

  it("closes the microphone when the screen goes, keeps nothing, and closes one that opens late", async () => {
    let send: ((c: Float32Array) => void) | undefined;
    let closed = 0;
    const microphone: Microphone = {
      open(onSamples) {
        send = onSamples;
        return Promise.resolve({ sampleRate: RATE, device: null, close: () => closed++ });
      },
    };
    const user = userEvent.setup();
    const { unmount } = renderWithStrata(<Booth microphone={microphone} />);
    await user.click(screen.getByRole("button", { name: "Listen" }));
    await screen.findByRole("button", { name: "Stop listening" });
    unmount();
    expect(closed).toBe(1);
    act(() => send?.(sound(1, 0.3)));

    let finish: (() => void) | undefined;
    const slow: Microphone = {
      open: () =>
        new Promise((resolve) => {
          finish = () => resolve({ sampleRate: RATE, device: null, close: () => closed++ });
        }),
    };
    const again = renderWithStrata(<Booth microphone={slow} />);
    await user.click(screen.getByRole("button", { name: "Listen" }));
    again.unmount();
    await act(async () => finish?.());
    expect(closed).toBe(2);
  });
});

describe("useAutoRecorder stopped from outside a chunk", () => {
  function Stopper({ microphone }: { microphone: Microphone }) {
    const [count, setCount] = React.useState(0);
    const recorder: { stop: () => void } = { stop: () => {} };
    const r = useAutoRecorder({
      maxSeconds: 30,
      microphone,
      onTake: () => {
        setCount((n) => n + 1);
        recorder.stop();
      },
    });
    recorder.stop = r.stop;
    return (
      <div>
        <Button onClick={() => void r.start()}>Listen</Button>
        <Button onClick={r.stop}>Stop listening</Button>
        <span>
          {r.state.phase} {count}
        </span>
      </div>
    );
  }

  it("stays stopped when onTake stops it", async () => {
    let send: ((c: Float32Array) => void) | undefined;
    let closed = 0;
    const microphone: Microphone = {
      open(onSamples) {
        send = onSamples;
        return Promise.resolve({ sampleRate: RATE, device: null, close: () => closed++ });
      },
    };
    const user = userEvent.setup();
    renderWithStrata(<Stopper microphone={microphone} />);
    await user.click(screen.getByRole("button", { name: "Listen" }));
    await screen.findByText("listening 0");
    const all = [sound(0.5, 0), sound(1, 0.3), sound(1.5, 0)];
    act(() => {
      for (const p of all) for (let i = 0; i < p.length; i += 2048) send?.(p.subarray(i, i + 2048));
    });
    expect(screen.getByText("idle 1")).toBeInTheDocument();
    expect(closed).toBe(1);
  });

  it("closes a microphone stopped while it was opening, refused or not", async () => {
    let finish: (() => void) | undefined;
    let refuse: (() => void) | undefined;
    let closed = 0;
    const microphone: Microphone = {
      open: () =>
        new Promise((resolve, reject) => {
          finish = () => resolve({ sampleRate: RATE, device: null, close: () => closed++ });
          refuse = () => reject(new Error("no"));
        }),
    };
    const user = userEvent.setup();
    renderWithStrata(<Stopper microphone={microphone} />);
    await user.click(screen.getByRole("button", { name: "Listen" }));
    await screen.findByText("opening 0");
    await user.click(screen.getByRole("button", { name: "Stop listening" }));
    expect(screen.getByText("idle 0")).toBeInTheDocument();
    await act(async () => finish?.());
    expect(closed).toBe(1);
    expect(screen.getByText("idle 0")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Listen" }));
    await user.click(screen.getByRole("button", { name: "Stop listening" }));
    await act(async () => refuse?.());
    expect(screen.getByText("idle 0")).toBeInTheDocument();
  });
});

describe("fakeMicrophone's script", () => {
  it("plays its stretches once then falls quiet, or loops them", async () => {
    const heard = (loop: boolean) =>
      new Promise<number[]>((resolve) => {
        const peaks: number[] = [];
        void fakeMicrophone({ script: [{ seconds: 0.1, amplitude: 0.5 }, { seconds: 0.1, amplitude: 0 }], loop, speed: 100 })
          .open((chunk) => {
            peaks.push(Math.round(Math.max(...chunk.map(Math.abs)) * 10) / 10);
          })
          .then((s) => setTimeout(() => (s.close(), resolve(peaks.slice(0, 4))), 30));
      });
    expect(await heard(false)).toEqual([0.5, 0, 0, 0]);
    expect(await heard(true)).toEqual([0.5, 0, 0.5, 0]);
    const empty = await new Promise<number>((resolve) => {
      void fakeMicrophone({ script: [], speed: 100 })
        .open((chunk) => resolve(Math.max(...chunk)))
        .then((s) => setTimeout(() => s.close(), 30));
    });
    expect(empty).toBe(0);
  });

  it("writes a reading script: quiet, then speech, for each take", () => {
    expect(speechScript(2)).toEqual([
      { seconds: 1.5, amplitude: 0 },
      { seconds: 1.5, amplitude: 0.3 },
      { seconds: 1.5, amplitude: 0 },
      { seconds: 1.5, amplitude: 0.3 },
    ]);
  });
});
