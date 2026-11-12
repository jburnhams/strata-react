// The lookups behind `TranscriptView` (strata-react issue #186), with no DOM so the boundaries are
// tested on their own. A transcript is phrases in time order, each with timed words; the question
// asked sixty times a second is "which phrase and which word is being heard at this time".

/** One word, with when it starts and ends (seconds). */
export type TranscriptWord = { text: string; start: number; end: number };

/** A phrase: timed words, who said it, and its other texts (a translation) by mode. */
export type TranscriptPhrase = {
  id: string;
  start: number;
  end: number;
  words: readonly TranscriptWord[];
  speaker?: string;
  /** Other texts for the phrase by mode name: `{ translated: "…" }`. */
  alt?: Readonly<Record<string, string>>;
};

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
