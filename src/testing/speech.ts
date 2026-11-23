// jsdom has no `speechSynthesis`, and the device's voices are a true external, so a test of a screen
// that speaks needs a stand-in that records what was said (strata-react issue #299). This is the one
// stand-in an app would otherwise write: it has `speak`, `cancel`, `getVoices`, `speaking` and the
// voiceschanged event, it ends an utterance when the test says so (`finish()`), and it never makes a sound.

/** One thing said aloud. */
export type Spoken = { text: string; lang: string; rate: number; voice: string | null; cancelled: boolean };

/** The recording stand-in `installFakeSpeech` puts on `window`. */
export type FakeSpeech = {
  /** Everything said so far, in order; an utterance cut off by a later one has `cancelled: true`. */
  said: Spoken[];
  /** The texts said so far that were not cancelled. */
  texts(): string[];
  /** Ends the utterance being said, as the browser does when it has finished. */
  finish(): void;
  /** Makes these voices the device's, and fires `voiceschanged` (the late arrival some browsers have). */
  setVoices(voices: { name: string; lang: string }[]): void;
  /** Puts the browser's own back (or none). */
  uninstall(): void;
};

/**
 * Installs a recording `speechSynthesis` and `SpeechSynthesisUtterance` on `window` and returns what was said.
 * `uninstall()` after each test. `const speech = installFakeSpeech(); … expect(speech.texts()).toEqual(["Which one is the cat?"])`.
 */
export function installFakeSpeech(voices: { name: string; lang: string }[] = []): FakeSpeech {
  const hadSynth = Object.getOwnPropertyDescriptor(window, "speechSynthesis");
  const hadUtterance = Object.getOwnPropertyDescriptor(globalThis, "SpeechSynthesisUtterance");
  let current: { entry: Spoken; utterance: FakeUtterance } | undefined;
  let installed = voices.map((v) => ({ ...v, default: false, localService: true, voiceURI: v.name }) as SpeechSynthesisVoice);
  const listeners = new Set<EventListener>();
  const said: Spoken[] = [];

  class FakeUtterance {
    lang = "";
    rate = 1;
    voice: SpeechSynthesisVoice | null = null;
    onend: (() => void) | null = null;
    onerror: (() => void) | null = null;
    constructor(public text: string) {}
  }

  const synth = {
    get speaking() {
      return current !== undefined;
    },
    speak(utterance: FakeUtterance) {
      const entry: Spoken = { text: utterance.text, lang: utterance.lang, rate: utterance.rate, voice: utterance.voice?.name ?? null, cancelled: false };
      said.push(entry);
      current = { entry, utterance };
    },
    cancel() {
      if (!current) return;
      const { entry, utterance } = current;
      current = undefined;
      entry.cancelled = true;
      utterance.onerror?.();
    },
    getVoices: () => installed,
    addEventListener: (_: string, l: EventListener) => void listeners.add(l),
    removeEventListener: (_: string, l: EventListener) => void listeners.delete(l),
  };

  Object.defineProperty(window, "speechSynthesis", { configurable: true, value: synth });
  Object.defineProperty(globalThis, "SpeechSynthesisUtterance", { configurable: true, writable: true, value: FakeUtterance });

  return {
    said,
    texts: () => said.filter((s) => !s.cancelled).map((s) => s.text),
    finish() {
      const done = current;
      current = undefined;
      done?.utterance.onend?.();
    },
    setVoices(next) {
      installed = next.map((v) => ({ ...v, default: false, localService: true, voiceURI: v.name }) as SpeechSynthesisVoice);
      for (const l of listeners) l(new Event("voiceschanged"));
    },
    uninstall() {
      if (hadSynth) Object.defineProperty(window, "speechSynthesis", hadSynth);
      else delete (window as unknown as Record<string, unknown>).speechSynthesis;
      if (hadUtterance) Object.defineProperty(globalThis, "SpeechSynthesisUtterance", hadUtterance);
      else delete (globalThis as unknown as Record<string, unknown>).SpeechSynthesisUtterance;
    },
  };
}
