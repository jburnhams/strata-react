import * as React from "react";
import type { QueryKey } from "@tanstack/react-query";
import { withBase, appBase } from "../lib/base";
import { speak, stopSpeaking, textOf, type SpeechPart } from "../lib/speech";
import { useLoad } from "./index";

// The app's list of recorded clips, next to `speak` (issue #318, on #310). `speak(parts)` plays clips
// with the browser's voice as the fallback, but every app still had to read its clip list, find each
// line's clip and wait for the list before speaking unasked. That glue is here once:
// - The list is read once (`useLoad`, `staleTime: Infinity`) and again only when the app invalidates
//   `clipsQueryKey` (after a recording is kept), so a screen of prompts is not one request each.
// - `ready` is true once the list has arrived or failed. A screen that speaks a prompt on show waits for
//   it (`useSayOnShow`), so the first prompt is not in the browser's voice while the rest are clips. A
//   failed list is ready too: waiting for a server that is not there would leave the prompt unsaid.
// - A line is looked up by its text. The list is a record of text to URL, so an app whose API answers
//   another shape maps it in `load` (its generated types make that one line). URLs go through `withBase`.
// - `split` cuts a prompt into lines, each with its own clip (default: one line); `describe` says
//   something else for a line with no clip (a phonics sound is described, never read out by a voice that
//   would get it wrong).
// - Outside a provider, the browser's voice alone, so a component using `useClips` or `SayAgain` works
//   in a story or a test with no setup.
// Not a React Aria part and not a control: speech has none (see `lib/speech.ts`).

/** The clips an app has: each line's words and the URL of its recording (root-relative; the app's base is put in front). */
export type Clips = Readonly<Record<string, string>>;

/** The query key of the clip list: invalidate it after a recording is kept, `queryClient.invalidateQueries({ queryKey: clipsQueryKey })`. */
export const clipsQueryKey: QueryKey = ["strata", "clips"];

/** What `useClips` gives. */
export type ClipsContext = {
  /** The list has arrived or failed: a prompt spoken on show can go now. Always true outside a provider. */
  ready: boolean;
  /** The language the provider names, for `speak`'s voice. */
  lang?: string;
  /** The parts of `text`: each line with its clip (through `withBase`) or null, and what the browser's voice says when it has none. */
  parts(text: string): SpeechPart[];
  /** Says `text` now, from its clips where it has them, else with the browser's voice. Returns whether it started. */
  say(text: string): boolean;
  /** What `text` is said as, for a button's name: the lines' words, a described line as described. */
  words(text: string): string;
};

const alone: ClipsContext = {
  ready: true,
  parts: (text) => [{ text, clip: null }],
  say: (text) => speak(text),
  words: (text) => text,
};
const Context = React.createContext<ClipsContext>(alone);

/** Props of `ClipsProvider`. */
export type ClipsProviderProps = {
  /** Reads the list. Called once, and again after `clipsQueryKey` is invalidated. */
  load: () => Promise<Clips>;
  /** BCP 47 language of the prompts; picks the browser's voice for lines with no clip. */
  lang?: string;
  /** Cuts a prompt into the lines that have a clip each. Default: the whole text is one line. */
  split?: (text: string) => string[];
  /** What the browser's voice says for a line with no clip, when the line itself should not be read out. Return `undefined` to read it. */
  describe?: (line: string) => string | undefined;
  /** Replaces `clipsQueryKey`, for an app with two lists. */
  queryKey?: QueryKey;
  children: React.ReactNode;
};

/** Reads the app's clip list once and gives `useClips`, `SayAgain` and `useSayOnShow` each line's recording. Put it in the shell, inside the query provider. */
export function ClipsProvider({ load, lang, split, describe, queryKey = clipsQueryKey, children }: ClipsProviderProps) {
  const list = useLoad<Clips>({ queryKey, queryFn: load, staleTime: Infinity });
  const clips = list.status === "ready" ? list.data : undefined;
  const value = React.useMemo<ClipsContext>(() => {
    const parts = (text: string): SpeechPart[] =>
      (split ? split(text) : [text])
        .map((line) => line.trim())
        .filter(Boolean)
        .map((line) => {
          const url = clips?.[line];
          return url ? { text: line, clip: withBase(url, appBase()) } : { text: describe?.(line) ?? line, clip: null };
        });
    return {
      ready: list.status !== "loading",
      lang,
      parts,
      say: (text) => speak(parts(text), { lang }),
      words: (text) => textOf(parts(text)),
    };
  }, [clips, list.status, lang, split, describe]);
  return <Context.Provider value={value}>{children}</Context.Provider>;
}

/** The app's clips: `const { say, parts, words, ready } = useClips()`. The browser's voice alone outside a `ClipsProvider`. */
export function useClips(): ClipsContext {
  return React.useContext(Context);
}

/** Options for `useSayOnShow`. */
export type SayOnShowOptions = {
  /** The person has turned speech off: nothing is said. */
  muted?: boolean;
};

/**
 * Says `text` once when it appears and the clips are `ready`, and again when `text` changes; stops it on unmount so a prompt does not talk
 * after its screen is gone. `useSayOnShow(question.text)`.
 */
export function useSayOnShow(text: string | null | undefined, { muted = false }: SayOnShowOptions = {}): void {
  const { ready, say } = useClips();
  // `say` changes whenever the provider's `split` or `describe` is a new function (an inline one is, each render); the prompt must not be said again for that.
  const latest = React.useRef(say);
  latest.current = say;
  React.useEffect(() => {
    if (muted || !ready || !text) return;
    latest.current(text);
    return () => stopSpeaking();
  }, [muted, ready, text]);
}
