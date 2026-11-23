import { MicrophoneError, type Microphone } from "../lib/microphone";

// The microphone is hardware, the one true external a recording screen has, and jsdom, Storybook and
// the visual suite have none. This stand-in sends a sine tone at a chosen level, `speed` times faster
// than real time (ten by default, so a test of a two-second take waits a fifth of a second), or refuses
// to open with a sentence as the browser's refusals become (`explainMicrophoneError`). Give it to the
// screen through `MicrophoneContext`, or `renderWithStrata(ui, { microphone })`.

/** `fakeMicrophone`'s options. */
export type FakeMicrophoneOptions = {
  /** Peak of the tone, 0 to 1. Default 0.3 (about -10 dBFS, a good level for speech). */
  amplitude?: number;
  /** Refuse to open with this sentence, as a `MicrophoneError` (what a screen shows). */
  refuse?: string;
  /** Throw something that is not a `MicrophoneError` (an audio graph that failed). */
  crash?: boolean;
  /** What the browser calls the device. Default "Fake USB microphone". */
  device?: string | null;
  /** Open but never send a sample: a take held in its first moment, for a screenshot. */
  silent?: boolean;
  /** Samples a second. Default 16 000. */
  sampleRate?: number;
  /** How many times faster than real time the samples arrive. Default 10. */
  speed?: number;
};

/** A microphone that sends a tone (or refuses), for tests and stories; hardware is never touched. */
export function fakeMicrophone({
  amplitude = 0.3,
  refuse,
  crash,
  device = "Fake USB microphone",
  silent,
  sampleRate = 16_000,
  speed = 10,
}: FakeMicrophoneOptions = {}): Microphone {
  return {
    open(onSamples) {
      if (crash) return Promise.reject(new TypeError("audio graph exploded"));
      if (refuse) return Promise.reject(new MicrophoneError(refuse));
      let t = 0;
      // A tenth of a second of sound each tick, every 100 / speed ms of real time.
      const frames = Math.round(sampleRate / 10);
      const timer = silent
        ? undefined
        : setInterval(() => {
            const chunk = new Float32Array(frames);
            for (let i = 0; i < frames; i++) chunk[i] = amplitude * Math.sin((2 * Math.PI * 220 * t++) / sampleRate);
            onSamples(chunk);
          }, 100 / speed);
      return Promise.resolve({ sampleRate, device, close: () => clearInterval(timer) });
    },
  };
}
