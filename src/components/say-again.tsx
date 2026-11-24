import { Volume2 } from "lucide-react";
import { useClips } from "../query/clips";
import { canSay, useSpeech, type SpeechPart, type UseSpeechOptions } from "../lib/speech";
import { IconButton } from "./button";

// The button beside a spoken prompt. Its label is the sentence it speaks, so the name a screen reader
// reads, the tooltip and what is said cannot drift: "Say it again" is not a name, "Say: Which one is
// the cat?" is. It draws nothing where there is no speech or the person muted it (a dead button is
// worse than none), and it is an `IconButton`, so it has the press, the tooltip and the keyboard
// behaviour of every other control (issue #299). Given `parts` (issue #310), it plays their recordings
// instead, and the browser says `text` where one is missing; it is drawn wherever either can be heard.
// Inside a `ClipsProvider` it needs neither `parts` nor `lang`: the app's clip list and language are the context's.

/** Props of `SayAgain`. */
export type SayAgainProps = UseSpeechOptions & {
  /** The one sentence it speaks. Also names the button: "Say: Which one is the cat?". */
  text: string;
  /** The recordings to play instead of the browser's voice, in order; their words together should be `text`. */
  parts?: readonly SpeechPart[];
  /** Replaces "Say" in the name, for an app that words it differently ("Hear"). */
  verb?: string;
  className?: string;
};

/** An icon button that says one sentence aloud, from its recordings when given, else with the browser's voice; hidden where neither can be heard or it is muted. */
export function SayAgain({ text, parts, verb = "Say", className, ...options }: SayAgainProps) {
  const clips = useClips();
  const { say, speaking } = useSpeech({ ...options, lang: options.lang ?? clips.lang });
  // Inside a `ClipsProvider` the recordings of `text` are found for the caller (issue #318); `parts` still wins.
  const saying = parts?.length ? parts : clips.parts(text);
  if (options.muted || !canSay(saying)) return null;
  return <IconButton icon={Volume2} label={`${verb}: ${text}`} aria-pressed={speaking || undefined} onPress={() => say(saying)} className={className} />;
}
