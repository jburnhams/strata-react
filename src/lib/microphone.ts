import * as React from "react";

// The microphone as raw samples, for an app that records speech (strata-voice's studio). What an app would
// otherwise write each time:
// - MediaRecorder only writes compressed audio, so the samples come through an AudioWorklet (loaded from a
//   Blob URL, so the app ships no worklet file) that posts 2048 frames at a time (~43 ms at 48 kHz): about
//   23 messages a second instead of one per 128-frame render quantum.
// - Echo cancellation, noise suppression and automatic gain are off: each reshapes a voice, and a take is
//   meant to be the voice as it was. The worklet feeds a silent gain into the output, because a worklet
//   nothing pulls does not run.
// - getUserMedia exists only on a secure page (https:// or http://localhost), and its refusals are
//   DOMExceptions by name; `explainMicrophoneError` turns both into a sentence a person can act on.
// - The device is behind `MicrophoneContext`, so a screen takes it from `useMicrophone()` and a test or
//   story gives it `fakeMicrophone()` (strata-react/testing) instead: hardware is the one true external.
// Not a React Aria part: there is none for capture, and nothing here is a control.
// `browserMicrophone` is covered by the stories in Chromium only: jsdom has no audio graph.

/** A microphone that is open and sending samples. */
export type MicrophoneStream = {
  sampleRate: number;
  /** What the browser calls the device ("USB Audio Device"), or null when it says nothing. */
  device: string | null;
  /** Stops the device (the browser's recording light goes out). */
  close: () => void;
};

/** Something that can be opened to send mono samples (-1 to 1) a chunk at a time. */
export type Microphone = {
  open: (onSamples: (chunk: Float32Array) => void) => Promise<MicrophoneStream>;
};

/** A microphone that would not open, with a sentence a person can act on. */
export class MicrophoneError extends Error {}

/** The sentence for what getUserMedia threw. */
export function explainMicrophoneError(e: unknown): MicrophoneError {
  const name = e instanceof DOMException ? e.name : "";
  if (name === "NotAllowedError")
    return new MicrophoneError(
      "The browser was not allowed to use the microphone. Allow it from the address bar, then try again.",
    );
  if (name === "NotFoundError") return new MicrophoneError("No microphone was found. Plug one in, then try again.");
  if (name === "NotReadableError")
    return new MicrophoneError("The microphone is in use by another program. Close it, then try again.");
  // DOMException is checked apart from Error: it is an Error in browsers but not in every runtime (jsdom).
  const said = e instanceof DOMException || e instanceof Error ? e.message : String(e);
  return new MicrophoneError(`The microphone could not be opened (${said}).`);
}

const WORKLET = `
class StrataTap extends AudioWorkletProcessor {
  constructor() { super(); this.buf = new Float32Array(2048); this.n = 0 }
  process(inputs) {
    const ch = inputs[0] && inputs[0][0]
    if (ch) for (let i = 0; i < ch.length; i++) {
      this.buf[this.n++] = ch[i]
      if (this.n === this.buf.length) { this.port.postMessage(this.buf.slice()); this.n = 0 }
    }
    return true
  }
}
registerProcessor('strata-tap', StrataTap)
`;

/** The browser's own microphone, with its processing off. */
export const browserMicrophone: Microphone = {
  async open(onSamples) {
    if (typeof navigator === "undefined" || !navigator.mediaDevices?.getUserMedia)
      throw new MicrophoneError("The microphone needs a secure page: open the app at http://localhost or over https.");
    let media: MediaStream;
    try {
      media = await navigator.mediaDevices.getUserMedia({
        audio: { channelCount: 1, echoCancellation: false, noiseSuppression: false, autoGainControl: false },
      });
    } catch (e) {
      throw explainMicrophoneError(e);
    }
    let context: AudioContext | undefined;
    const close = () => {
      for (const t of media.getTracks()) t.stop();
      void context?.close();
    };
    // Once the device is open, any failure building the graph closes it again: the caller gets no stream to
    // close, and the browser's recording light would otherwise stay on.
    try {
      context = new AudioContext();
      const url = URL.createObjectURL(new Blob([WORKLET], { type: "text/javascript" }));
      try {
        await context.audioWorklet.addModule(url);
      } finally {
        URL.revokeObjectURL(url);
      }
      const tap = new AudioWorkletNode(context, "strata-tap");
      tap.port.onmessage = (event: MessageEvent<Float32Array>) => onSamples(event.data);
      const mute = context.createGain();
      mute.gain.value = 0;
      context.createMediaStreamSource(media).connect(tap).connect(mute).connect(context.destination);
      return { sampleRate: context.sampleRate, device: media.getAudioTracks()[0]?.label || null, close };
    } catch (e) {
      close();
      throw explainMicrophoneError(e);
    }
  },
};

/** The microphone screens record from: the browser's, unless a provider gives another (a fake in tests and stories). */
export const MicrophoneContext = React.createContext<Microphone>(browserMicrophone);

/** The microphone from the nearest `MicrophoneContext`. */
export const useMicrophone = (): Microphone => React.useContext(MicrophoneContext);
