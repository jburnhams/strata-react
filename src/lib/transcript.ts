// The lookups behind `TranscriptView` (strata-react issue #186), with no DOM so the boundaries are
// tested on their own. A transcript is phrases in time order, each with timed words; the question
// asked sixty times a second is "which phrase and which word is being heard at this time".

/** One word, with when it starts and ends (seconds). */
export type TranscriptWord = {
  text: string;
  start: number;
  end: number;
  /** How sure the recogniser was, 0 to 1. Below the view's `doubtfulBelow` (default 0.6) the word is doubtful. */
  confidence?: number;
  /** The recogniser's own verdict, when it gives one instead of a number. Wins over `confidence`. */
  doubtful?: boolean;
  /** The word was corrected by a person: what the recogniser heard (shown on hover) and who changed it. Drawn as a dotted underline in the primary colour, and said to a screen reader. */
  correction?: { original: string; by?: string };
};

/** The id of a word for marking (`TranscriptView`'s `marking`, `Mark`): its phrase and its place in it. */
export const wordId = (phraseId: string, index: number) => `${phraseId}:${index}`;
/** The phrase an id made by `wordId` belongs to. */
export const phraseOfWordId = (id: string) => id.slice(0, id.lastIndexOf(":"));

/** A mark an app puts on a phrase ("Not sung", "Not a lyric"): a word, always, and the tone it is drawn in. */
export type TranscriptPhraseState = { id: string; label: string; tone: "neutral" | "info" | "success" | "warning" | "danger" };

/** A phrase: timed words, who said it, and its other texts (a translation) by mode. */
export type TranscriptPhrase = {
  id: string;
  start: number;
  end: number;
  words: readonly TranscriptWord[];
  speaker?: string;
  /** Other texts for the phrase by mode name: `{ translated: "…" }`. */
  alt?: Readonly<Record<string, string>>;
  /** The mark the person (or the app) put on it. */
  state?: TranscriptPhraseState;
};

/** Whether a word is doubtful: the recogniser said so, or its confidence is under `below`. */
export function isDoubtful(word: Pick<TranscriptWord, "confidence" | "doubtful">, below = 0.6): boolean {
  return word.doubtful ?? (word.confidence !== undefined && word.confidence < below);
}

/** Whether any word of a phrase is doubtful. */
export function phraseDoubtful(phrase: Pick<TranscriptPhrase, "words">, below = 0.6): boolean {
  return phrase.words.some((w) => isDoubtful(w, below));
}

/** Phrases that belong together (a clip), with a heading. */
export type TranscriptGroup = { id: string; title: string; /** Defaults to the first phrase's start. */ start?: number; /** Defaults to the last phrase's end. */ end?: number; phrases: readonly TranscriptPhrase[] };

/** The phrase being heard at `time`, as an index into `phrases` (sorted by start), or -1. A phrase is heard from its `start` up to, not including, its `end`. */
export function phraseAt(phrases: readonly Pick<TranscriptPhrase, "start" | "end">[], time: number): number {
  let lo = 0;
  let hi = phrases.length - 1;
  let found = -1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (phrases[mid].start <= time) {
      found = mid;
      lo = mid + 1;
    } else hi = mid - 1;
  }
  // Phrases may overlap (two speakers): step back to one that still covers the time.
  for (let i = found; i >= 0 && i > found - 8; i--) if (time < phrases[i].end) return i;
  return -1;
}

/** The word being heard within a phrase at `time`: the last word that has started, until the phrase ends. -1 before the first word. */
export function wordAt(phrase: Pick<TranscriptPhrase, "words" | "end">, time: number): number {
  if (time >= phrase.end) return -1;
  let found = -1;
  for (let i = 0; i < phrase.words.length; i++) {
    if (phrase.words[i].start <= time) found = i;
    else break;
  }
  return found;
}
