import * as React from "react";
import { Pause, Play } from "lucide-react";
import { IconButton } from "./button";
import type { MediaElementState, MediaWindow } from "./media-player";

// Playing a piece of a file, and one player at a time (strata-react issue #180, from strata-360's
// review screens: a transcript phrase plays "a little before its first word to a little after its
// last" on one shared element, and starting a new phrase stops the last). Three small pieces:
//
// - A **group** is a set of media elements of which only one plays. Joining is by `group` (a name, or
//   the nearest `MediaGroup`) on `useMediaElement` or `MediaPlayer`; when one element plays, the others
//   in its group are paused. It listens to the element's own `play` event, so it also holds for the
//   browser's native controls and for a `play()` the app calls itself, and it needs no state in React.
//   An element that unmounts leaves the group, so a player that was removed cannot be paused later.
//   Players in no group behave as before.
// - `MediaGroup` names a group for everything under it (a list of players, a page region), so an app
//   does not invent ids. A name passed to the hook wins over the context's.
// - `PlayWindowButton` is the row button (a phrase, a moment): named for what it plays, a pressed
//   toggle (so the name does not change between states, which is how a screen reader keeps its place
//   in a list of fifty), and it plays through a media handle: the one element many rows share.
//
// Checked: React Aria has no media part; the button is Strata's `IconButton` (React Aria's `Button`
// inside), and `aria-pressed` is the platform's own state for a toggle.

const groups = new Map<string, Set<HTMLMediaElement>>();

/** Adds an element to a named group until the returned function is called; whenever one plays, the others pause. */
export function joinMediaGroup(name: string, el: HTMLMediaElement): () => void {
  let members = groups.get(name);
  if (!members) groups.set(name, (members = new Set()));
  members.add(el);
  const onPlay = () => {
    for (const other of groups.get(name) ?? []) if (other !== el && !other.paused) other.pause();
  };
  el.addEventListener("play", onPlay);
  return () => {
    el.removeEventListener("play", onPlay);
    members.delete(el);
    if (members.size === 0 && groups.get(name) === members) groups.delete(name);
  };
}

const GroupContext = React.createContext<string | null>(null);

/** The group a `MediaGroup` above this point names, or null. */
export function useMediaGroupName(): string | null {
  return React.useContext(GroupContext);
}

/** Players and elements under it play one at a time: starting one pauses the others. */
export function MediaGroup({ name, children }: { name?: string; children: React.ReactNode }) {
  const own = React.useId();
  return <GroupContext.Provider value={name ?? own}>{children}</GroupContext.Provider>;
}

/** Whether two windows are the same stretch. */
export const sameWindow = (a: MediaWindow | null | undefined, b: MediaWindow | null | undefined) => (a ?? null) === (b ?? null) || (!!a && !!b && a.start === b.start && a.end === b.end);

export type PlayWindowButtonProps = {
  /** The shared element's handle from `useMediaElement`. */
  media: Pick<MediaElementState, "playing" | "window" | "playWindow" | "pause">;
  /** The stretch it plays, in seconds. */
  window: MediaWindow;
  /** What it plays, in the row's words: "Play phrase 12" (the name stays the same while it plays; the pressed state says the rest). */
  label: string;
  size?: "default" | "sm";
  className?: string;
};

/** A row's play button for one window of a shared element: named for what it plays, pressed while it plays, a second press pauses. */
export function PlayWindowButton({ media, window: w, label, size = "sm", className }: PlayWindowButtonProps) {
  const playing = media.playing && sameWindow(media.window, w);
  return <IconButton icon={playing ? Pause : Play} label={label} size={size} className={className} aria-pressed={playing} onClick={() => (playing ? media.pause() : void media.playWindow(w))} />;
}
