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
// - A prompt can be recorded (issue #310): an app with clips (made once by a speech model, or a person's
//   recording) passes parts, each with its words and its clip. The clips play in order when every part has
//   one; a part without a clip, a clip that fails to load or a play the browser refuses says the rest with
//   the browser's voice. All or nothing per prompt, because two voices taking turns inside one sentence is
//   harder to follow than either alone. A recording is the only way to say what a browser voice cannot,
//   such as the sound /m/ on its own.
// Not a React Aria part: there is none for speech, and nothing here is a control.

/** How a prompt is said. */
export type SpeakOptions = {
  /** BCP 47 language of the text ("en-GB", "sv"). Picks the voice; when omitted the browser's default voice is used. */
  lang?: string;
  /** The browser voice's speed, 1 normal. Default 0.9. A recording plays at its own pace. */
  rate?: number;
  /** Called when it has been said (every recording played, or the browser finished), or was stopped. */
  onEnd?: () => void;
};

/** One piece of a prompt: its words, and the recording of them when there is one (a URL, already through `withBase`). */
export type SpeechPart = { text: string; clip?: string | null };

/** What is said: a sentence for the browser's voice, or parts that play their recordings. */
export type Saying = string | readonly SpeechPart[];

const partsOf = (saying: Saying): SpeechPart[] =>
  (typeof saying === "string" ? [{ text: saying }] : [...saying]).filter((p) => p.text.trim() || p.clip);

/** The words of what is said, as one sentence: what the browser's voice says when a recording is missing, and the button's name. */
export function textOf(saying: Saying): string {
  return partsOf(saying)
    .map((p) => p.text.trim())
    .filter(Boolean)
    .join(" ");
}

/** Whether this browser can play a recording. */
export function canPlayClips(): boolean {
  return typeof window !== "undefined" && typeof window.Audio === "function";
}

const allRecorded = (parts: SpeechPart[]) => parts.length > 0 && parts.every((p) => p.clip);

/** Whether `saying` can be said here: every part recorded and audio plays, or the browser has speech and there are words. */
export function canSay(saying: Saying): boolean {
  const parts = partsOf(saying);
  return (allRecorded(parts) && canPlayClips()) || (canSpeak() && textOf(parts) !== "");
}

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

/** The recording playing now, so the next prompt or `stopSpeaking` can cut it off. */
let playing: { stop: () => void } | undefined;

function speakText(text: string, { lang, rate = 0.9, onEnd }: SpeakOptions): boolean {
  if (!canSpeak() || !text.trim()) return false;
  const synth = window.speechSynthesis;
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

function playFrom(parts: SpeechPart[], i: number, options: SpeakOptions): void {
  const part = parts[i];
  if (!part) {
    options.onEnd?.();
    return;
  }
  const audio = new Audio();
  audio.title = part.text; // what it says: shown nowhere, but a test (and a debugger) can read it
  let settled = false;
  const settle = () => {
    if (settled) return false;
    settled = true;
    if (playing === entry) playing = undefined;
    return true;
  };
  // A clip that cannot play (missing file, refused autoplay) hands the rest of the prompt to the browser's voice.
  const fallBack = () => {
    if (settle() && !speakText(textOf(parts.slice(i)), options)) options.onEnd?.();
  };
  const entry = {
    stop: () => {
      if (!settle()) return;
      audio.pause();
      options.onEnd?.();
    },
  };
  playing = entry;
  audio.onended = () => {
    if (settle()) playFrom(parts, i + 1, options);
  };
  audio.onerror = fallBack;
  audio.src = part.clip ?? "";
  void audio.play()?.catch(fallBack);
}

/**
 * Says it aloud now, cancelling what is still being said. A sentence goes to the browser's voice; parts play their recordings in order when
 * every part has one, else their words go to the browser's voice. Does nothing where neither can. Returns whether it started.
 */
export function speak(saying: Saying, options: SpeakOptions = {}): boolean {
  const parts = partsOf(saying);
  if (!parts.length) return false;
  if (allRecorded(parts) && canPlayClips()) {
    stopSpeaking();
    playFrom(parts, 0, options);
    return true;
  }
  if (!canSpeak() || !textOf(parts)) return false;
  stopSpeaking();
  return speakText(textOf(parts), options);
}

/** Stops whatever is being said or played. */
export function stopSpeaking(): void {
  playing?.stop();
  if (canSpeak()) window.speechSynthesis.cancel();
}

/** Options for `useSpeech`. */
export type UseSpeechOptions = Pick<SpeakOptions, "lang" | "rate"> & {
  /** The person has turned speech off: `say` does nothing. Keep the choice where the app keeps its settings. */
  muted?: boolean;
};

/** What `useSpeech` returns. */
export type Speech = {
  /** The browser can speak and the person has not muted it: show the control only then (for recorded parts, `canSay(parts) && !muted`). */
  supported: boolean;
  /** True while something is being said. */
  speaking: boolean;
  /** Says a sentence, or plays recorded parts, now (cancelling what is being said). Returns whether it started. */
  say: (saying: Saying) => boolean;
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
    const synth = canSpeak() ? window.speechSynthesis : undefined;
    const onVoices = () => setVoicesVersion((n) => n + 1);
    synth?.addEventListener?.("voiceschanged", onVoices);
    return () => {
      synth?.removeEventListener?.("voiceschanged", onVoices);
      stopSpeaking();
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
    (saying: Saying) => {
      if (muted) return false;
      const spoken = speak(saying, {
        lang,
        rate,
        onEnd: () => setSpeaking(false),
      });
      setSpeaking(spoken);
      return spoken;
    },
    [muted, lang, rate],
  );
  const stop = React.useCallback(() => {
    stopSpeaking();
    setSpeaking(false);
  }, []);
  return { supported, speaking, say, stop };
}
