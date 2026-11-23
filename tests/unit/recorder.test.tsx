import * as React from "react";
import { describe, expect, it } from "vitest";
import { act, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import {
  Button,
  InputLevel,
  LEVEL_FLOOR_DB,
  TakeLevel,
  encodeWav,
  explainMicrophoneError,
  joinSamples,
  peakDb,
  speechLevel,
  useRecorder,
  type Microphone,
  type Recording,
} from "../../src";
import { fakeMicrophone, renderWithStrata } from "../../src/testing";

// Recording speech: the arithmetic (joining chunks, the WAV, the peak, the verdict), the recorder
// driven by the fake microphone through renderWithStrata's `microphone`, and the two level views.

describe("recording arithmetic", () => {
  it("joins chunks in order", () => {
    expect(Array.from(joinSamples([Float32Array.of(1, 2), Float32Array.of(), Float32Array.of(3)]))).toEqual([1, 2, 3]);
  });

  it("writes a mono 16-bit PCM WAV, clipping beyond full scale", async () => {
    const wav = encodeWav(Float32Array.of(0, 0.5, -1, 2), 48_000);
    expect(wav.type).toBe("audio/wav");
    const view = new DataView(await wav.arrayBuffer());
    const text = (at: number) => String.fromCharCode(...new Uint8Array(view.buffer, at, 4));
    expect([text(0), text(8), text(12), text(36)]).toEqual(["RIFF", "WAVE", "fmt ", "data"]);
    expect(view.getUint32(4, true)).toBe(36 + 8);
    expect(view.getUint16(20, true)).toBe(1);
    expect(view.getUint16(22, true)).toBe(1);
    expect(view.getUint32(24, true)).toBe(48_000);
    expect(view.getUint32(28, true)).toBe(96_000);
    expect(view.getUint16(34, true)).toBe(16);
    expect(view.getUint32(40, true)).toBe(8);
    expect([44, 46, 48, 50].map((at) => view.getInt16(at, true))).toEqual([0, 16383, -32768, 32767]);
  });

  it("reads the peak in dBFS, silence as the floor", () => {
    expect(peakDb(Float32Array.of(0.1, -0.5, 0.25))).toBeCloseTo(-6.02, 1);
    expect(peakDb(new Float32Array(10))).toBe(LEVEL_FLOOR_DB);
    expect(peakDb(Float32Array.of(1e-6))).toBe(LEVEL_FLOOR_DB);
  });

  it("judges a take's peak for speech", () => {
    expect(speechLevel(-0.5).word).toBe("Too loud");
    expect(speechLevel(-1).tone).toBe("danger");
    expect(speechLevel(-12)).toMatchObject({ tone: "success", word: "Good level" });
    expect(speechLevel(-30).tone).toBe("success");
    expect(speechLevel(-31)).toMatchObject({ tone: "warning", word: "Too quiet" });
  });

  it("turns the browser's refusals into sentences a person can act on", () => {
    expect(explainMicrophoneError(new DOMException("no", "NotAllowedError")).message).toMatch(/not allowed.*address bar/);
    expect(explainMicrophoneError(new DOMException("no", "NotFoundError")).message).toMatch(/No microphone was found/);
    expect(explainMicrophoneError(new DOMException("busy", "NotReadableError")).message).toMatch(/in use by another program/);
    expect(explainMicrophoneError(new DOMException("odd", "AbortError")).message).toBe("The microphone could not be opened (odd).");
    expect(explainMicrophoneError("strange").message).toBe("The microphone could not be opened (strange).");
  });
});

// A screen as an app would write one: Record becomes Stop, the take's verdict shows when it ends.
function Booth({ maxSeconds = 60, microphone }: { maxSeconds?: number; microphone?: Microphone }) {
  const recorder = useRecorder({ maxSeconds, microphone });
  const [take, setTake] = React.useState<Recording | null>(null);
  const [again, setAgain] = React.useState<string>("");
  const record = async () => {
    const r = await recorder.start();
    if (r) setTake(r);
  };
  return (
    <div>
      {recorder.recording ? (
        <Button onClick={recorder.stop}>Stop</Button>
      ) : (
        <Button onClick={() => void record()}>Record</Button>
      )}
      <Button
        onClick={() =>
          void recorder.start().then((r) => {
            setAgain(r === null ? "refused" : "took");
          })
        }
      >
        Start again
      </Button>
      <span>{again}</span>
      {recorder.state.phase === "recording" && <InputLevel level={recorder.state.level} seconds={recorder.state.seconds} maxSeconds={maxSeconds} />}
      {recorder.state.phase === "failed" && <p role="alert">{recorder.state.reason}</p>}
      {take && (
        <>
          <TakeLevel peak={take.peak} lead={`Kept ${take.seconds.toFixed(1)} s`} />
          <output>
            {take.sampleRate} {take.samples.length} {take.wav.size} {take.device}
          </output>
        </>
      )}
    </div>
  );
}

describe("useRecorder", () => {
  it("records until Stop, with the live level, and hands back the take as a WAV", async () => {
    const user = userEvent.setup();
    renderWithStrata(<Booth />, { microphone: fakeMicrophone({ amplitude: 0.3 }) });
    await user.click(screen.getByRole("button", { name: "Record" }));
    const meter = await screen.findByRole("meter", { name: "Input level" });
    await waitFor(() => expect(meter).toHaveAttribute("aria-valuetext", "-10\u00a0dBFS"));
    expect(screen.getByText(/Recording 0:0\d of at most 1:00/)).toBeInTheDocument();
    await waitFor(() => expect(screen.getByText(/Recording 0:01/)).toBeInTheDocument());
    await user.click(screen.getByRole("button", { name: "Stop" }));
    expect(await screen.findByText("Good level")).toBeInTheDocument();
    expect(screen.getByText(/^Kept \d\.\d s, peak -10\sdBFS\. The level suits speech\.$/)).toBeInTheDocument();
    const [rate, samples, bytes, ...device] = screen.getByRole("status", { hidden: true }).textContent!.split(" ");
    expect(rate).toBe("16000");
    expect(Number(bytes)).toBe(44 + 2 * Number(samples));
    expect(device.join(" ")).toBe("Fake USB microphone");
    expect(screen.queryByRole("meter")).not.toBeInTheDocument();
  });

  it("stops itself at the longest take", async () => {
    const user = userEvent.setup();
    renderWithStrata(<Booth maxSeconds={1} microphone={fakeMicrophone({ amplitude: 0.01, speed: 20 })} />);
    await user.click(screen.getByRole("button", { name: "Record" }));
    expect(await screen.findByText("Too quiet")).toBeInTheDocument();
    expect(screen.getByText(/^Kept 1\.0 s, peak -40\sdBFS\. Move closer/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Record" })).toBeInTheDocument();
  });

  it("refuses a second start while a take runs, and Stop does nothing when idle", async () => {
    const user = userEvent.setup();
    renderWithStrata(<Booth />, { microphone: fakeMicrophone({ silent: true }) });
    await user.click(screen.getByRole("button", { name: "Start again" }));
    await screen.findByRole("button", { name: "Stop" });
    await user.click(screen.getByRole("button", { name: "Start again" }));
    expect(await screen.findByText("refused")).toBeInTheDocument();
    // A take with no samples reads as silence: the floor.
    await user.click(screen.getByRole("button", { name: "Stop" }));
    expect(await screen.findByText("took")).toBeInTheDocument();
  });

  it("says why the microphone would not open", async () => {
    const user = userEvent.setup();
    const { unmount } = renderWithStrata(<Booth microphone={fakeMicrophone({ refuse: "No microphone was found. Plug one in, then try again." })} />);
    await user.click(screen.getByRole("button", { name: "Record" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("No microphone was found.");
    expect(screen.getByRole("button", { name: "Record" })).toBeInTheDocument();
    unmount();
    renderWithStrata(<Booth microphone={fakeMicrophone({ crash: true })} />);
    await user.click(screen.getByRole("button", { name: "Record" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("The microphone could not be opened (TypeError: audio graph exploded).");
  });

  it("closes the microphone when the screen goes mid-take, and ignores a late chunk", async () => {
    let send: ((c: Float32Array) => void) | undefined;
    let closed = 0;
    const microphone: Microphone = {
      open(onSamples) {
        send = onSamples;
        return Promise.resolve({ sampleRate: 8000, device: null, close: () => closed++ });
      },
    };
    const user = userEvent.setup();
    const { unmount } = renderWithStrata(<Booth microphone={microphone} />);
    await user.click(screen.getByRole("button", { name: "Record" }));
    await screen.findByRole("button", { name: "Stop" });
    unmount();
    expect(closed).toBe(1);
    act(() => send?.(new Float32Array(10)));
    expect(closed).toBe(1);
  });
});

describe("level views", () => {
  it("draws a live level past -3 dBFS as too loud, and clamps beyond the scale", () => {
    renderWithStrata(
      <>
        <InputLevel label="Loud" level={-1} seconds={2} maxSeconds={30} />
        <InputLevel label="Over" level={3} seconds={0} maxSeconds={30} />
        <InputLevel label="Under" level={-90} seconds={0} maxSeconds={30} />
      </>,
    );
    expect(screen.getByRole("meter", { name: "Loud" })).toHaveAccessibleDescription(/Too loud/);
    expect(screen.getByRole("meter", { name: "Over" })).toHaveAttribute("aria-valuetext", "0\u00a0dBFS");
    expect(screen.getByRole("meter", { name: "Under" })).toHaveAttribute("aria-valuetext", "-60\u00a0dBFS");
  });

  it("says a take's verdict with or without a lead", () => {
    renderWithStrata(<TakeLevel peak={-0.4} />);
    expect(screen.getByText("Too loud")).toBeInTheDocument();
    expect(screen.getByText(/^Peak 0\sdBFS\. It may have clipped\./)).toBeInTheDocument();
  });
});
