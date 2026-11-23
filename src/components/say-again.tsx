import { Volume2 } from "lucide-react";
import { useSpeech, type UseSpeechOptions } from "../lib/speech";
import { IconButton } from "./button";

// The button beside a spoken prompt. Its label is the sentence it speaks, so the name a screen reader
// reads, the tooltip and what is said cannot drift: "Say it again" is not a name, "Say: Which one is
// the cat?" is. It draws nothing where there is no speech or the person muted it (a dead button is
// worse than none), and it is an `IconButton`, so it has the press, the tooltip and the keyboard
// behaviour of every other control (issue #299). `onSay` lets the screen say the same sentence on load.

/** Props of `SayAgain`. */
export type SayAgainProps = UseSpeechOptions & {
  /** The one sentence it speaks. Also names the button: "Say: Which one is the cat?". */
  text: string;
  /** Replaces "Say" in the name, for an app that words it differently ("Hear"). */
  verb?: string;
  className?: string;
};

/** An icon button that says one sentence aloud with the browser's voice; hidden where there is no speech or it is muted. */
export function SayAgain({ text, verb = "Say", className, ...options }: SayAgainProps) {
  const { say, supported, speaking } = useSpeech(options);
  if (!supported) return null;
  return <IconButton icon={Volume2} label={`${verb}: ${text}`} aria-pressed={speaking || undefined} onPress={() => say(text)} className={className} />;
}
