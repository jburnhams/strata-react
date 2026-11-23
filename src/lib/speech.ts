import * as React from "react";

// Saying a prompt aloud, for people who cannot read yet or read the language less well (#299).
// The browser's `speechSynthesis` does it with the device's voices, so the pieces an app kept
// rewriting are here once:
// - Voices load asynchronously on some browsers (the list is empty until `voiceschanged`), so a voice
//   is picked when it is needed, not at start-up, and the hook re-reads when the list arrives.
// - A voice is chosen by language: an exact match (`en-GB`), else the same base language (`en`), else
//   the browser's default for `lang`. Nothing is guessed from a voice's name.
// - Speaking cancels what is still being said (two prompts never talk over each other), and the rate
//   is a little slow by default (0.9): the people this is for are listening, not skimming.
// - Where there is no speech (a server render, an older browser, a test) it does nothing and says so
//   through `supported`, so a screen can leave out its button instead of showing one that is dead.
// - A person who has turned speech off (`muted`) is never spoken to; that choice is the app's to keep
//   (a setting, `localStorage`), as it is for reduced motion.
// Not a React Aria part: there is none for speech, and nothing here is a control.

/** How a prompt is said. */
export type SpeakOptions = {
  /** BCP 47 language of the text ("en-GB", "sv"). Picks the voice; when omitted the browser's default voice is used. */
  lang?: string;
  /** 1 is normal speed. Default 0.9. */
  rate?: number;
  /** Called when the browser has finished saying it, or was stopped. */
  onEnd?: () => void;
};

/** Whether this browser can say text aloud. */
export function canSpeak(): boolean {
  return typeof window !== "undefined" && "speechSynthesis" in window && typeof SpeechSynthesisUtterance !== "undefined";
}

/** The voice that fits a language: exact match, else the same base language, else none (the browser then uses its default for `lang`). */
export function pickVoice(voices: readonly SpeechSynthesisVoice[], lang: string | undefined): SpeechSynthesisVoice | undefined {
  if (!lang) return undefined;
  const wanted = lang.toLowerCase().replace("_", "-");
  const base = wanted.split("-")[0];
  return (
    voices.find((v) => v.lang.toLowerCase().replace("_", "-") === wanted) ??
    voices.find((v) => v.lang.toLowerCase().replace("_", "-").split("-")[0] === base)
  );
}

/** Says `text` aloud now, cancelling what is still being said. Does nothing where there is no speech. Returns whether it was handed to the browser. */
export function speak(text: string, { lang, rate = 0.9, onEnd }: SpeakOptions = {}): boolean {
  if (!canSpeak() || !text.trim()) return false;
  const synth = window.speechSynthesis;
  synth.cancel();
  const utterance = new SpeechSynthesisUtterance(text);
  if (lang) utterance.lang = lang;
  utterance.rate = rate;
  const voice = pickVoice(synth.getVoices(), lang);
  if (voice) utterance.voice = voice;
  if (onEnd) {
    utterance.onend = onEnd;
    utterance.onerror = onEnd;
  }
  synth.speak(utterance);
  return true;
}

/** Stops whatever is being said. */
export function stopSpeaking(): void {
  if (canSpeak()) window.speechSynthesis.cancel();
}

/** Options for `useSpeech`. */
export type UseSpeechOptions = Pick<SpeakOptions, "lang" | "rate"> & {
  /** The person has turned speech off: `say` does nothing. Keep the choice where the app keeps its settings. */
  muted?: boolean;
};

/** What `useSpeech` returns. */
export type Speech = {
  /** The browser can speak and the person has not muted it: show the control only then. */
  supported: boolean;
  /** True while something is being said. */
  speaking: boolean;
  /** Says the text now (cancelling what is being said). Returns whether it was spoken. */
  say: (text: string) => boolean;
  stop: () => void;
};

/**
 * Speech for a screen: `const { say, supported } = useSpeech({ lang })`. Waits for voices that load late (`voiceschanged`), cancels on unmount so a
 * prompt does not keep talking after its screen is gone, and does nothing where there is no speech or the person muted it.
 */
export function useSpeech({ lang, rate, muted = false }: UseSpeechOptions = {}): Speech {
  const supported = canSpeak() && !muted;
  const [speaking, setSpeaking] = React.useState(false);
  // Voices arrive late on some browsers; a re-read keeps `say` using the right one without the caller doing anything.
  const [, setVoicesVersion] = React.useState(0);
  React.useEffect(() => {
    if (!canSpeak()) return;
    const synth = window.speechSynthesis;
    const onVoices = () => setVoicesVersion((n) => n + 1);
    synth.addEventListener?.("voiceschanged", onVoices);
    return () => {
      synth.removeEventListener?.("voiceschanged", onVoices);
      synth.cancel();
    };
  }, []);
  // Muting while something is being said stops it: the control disappears with `supported`, so it could not be stopped otherwise.
  React.useEffect(() => {
    if (muted) {
      stopSpeaking();
      setSpeaking(false);
    }
  }, [muted]);
  const say = React.useCallback(
    (text: string) => {
      if (!supported) return false;
      const spoken = speak(text, {
        lang,
        rate,
        onEnd: () => setSpeaking(false),
      });
      setSpeaking(spoken);
      return spoken;
    },
    [supported, lang, rate],
  );
  const stop = React.useCallback(() => {
    stopSpeaking();
    setSpeaking(false);
  }, []);
  return { supported, speaking, say, stop };
}
