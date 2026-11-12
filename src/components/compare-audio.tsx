import * as React from "react";
import { cn } from "../lib/utils";
import { format } from "../lib/format";
import { gainToVolume, matchGains, measureLoudness, type Loudness } from "../lib/loudness";
import { Button } from "./button";
import type { AudioMedia, Candidate } from "./compare";
import { KeysLegend, useHotkeys, type Shortcut } from "./hotkeys";
import { SeekBar, TimeReadout, Transport, VolumeControl } from "./media";
import { useMediaElement } from "./media-player";
import { Switch } from "./switch";
import { ToggleGroup } from "./toggle";

// Two clips of the same thing, heard one after the other in the same place. What the TTS and
// transcription evals in strata-models needed, and two independent players cannot give: the useful
// comparison is the ABX-style one, so there is ONE transport and a switch between A and B that keeps
// the playhead, and a person hears the same word in each voice without scrubbing twice.
//
// Only the chosen clip plays. Switching copies the position to the other (the same time, or the same
// proportion when the clips differ in length: `align`, default "auto" is proportion when they differ
// by more than 2%, since a clip that is 10% longer has its words later, not at the same second) and,
// if it was playing, carries on in the other. A brief gap at the switch is the other element
// starting, not a seek.
//
// Level: the louder of two clips tends to be judged better, so by default (`levelMatch`) the louder
// is turned down to the quieter by RMS (`lib/loudness.ts`; not LUFS, and the file says so), and the
// readout says by how much, in the candidates' labels, so a blind judge learns nothing about which
// is which. It only ever turns a clip DOWN: a media element's volume cannot go above 1. Measuring
// decodes the clip with the Web Audio API; `measure` replaces it (a server's figure, a test).
//
// Looping a range (set a start and an end at the playhead, clear them) lets a judge hear the same two
// seconds in A, then B. The range is kept as shares of the clip, so it lands on the same words in the
// other clip under proportional alignment and is the same seconds under time alignment. The end is
// watched on `requestAnimationFrame` while playing, because `timeupdate` fires about four times a
// second and the loop would overshoot by a quarter of a second.
//
// Keys: `1` and `2` choose A and B, `x` flips, Space and `k` play, `j` and `l` go back and forward a
// second, `i` and `o` set the loop's start and end, `c` clears it. `a`, `b`, `t` and `s` are left for
// a `PairVote`'s answers, and arrows are left to the seek bar. They come from one list, drawn in one
// legend with the screen's (`extraShortcuts`).
//
// Blind: the same rules as `Compare`. Only the label names a clip on the page (the `<audio>` element
// is "Clip A"); the id and note are never written. `src` reaches the DOM, so a blind caller serves
// clips under neutral addresses.
//
// Checked: React Aria has no media player or A/B switch. The seek bar, transport, readout and volume
// are strata's own parts built on its slider and toolbar hooks; the switch is a `ToggleGroup`.

/** Props for `CompareAudio`. */
export type CompareAudioProps = {
  /** Names the comparison for screen readers. Required. */
  label: string;
  a: Candidate<AudioMedia>;
  b: Candidate<AudioMedia>;
  /** Whether the person must not learn which clip is which. Required, no default. */
  blind: boolean;
  /** The words shown when a clip cannot be loaded: "Clip not found". Required. */
  missing: string;
  /** Turn the louder clip down to the quieter one. Default true. */
  levelMatch?: boolean;
  /** How a switch carries the playhead over: the same time, the same share of the clip, or by share when the lengths differ by more than 2%. Default "auto". */
  align?: "time" | "proportion" | "auto";
  /** Measures a clip's level. Default decodes it in the browser. */
  measure?: (src: string) => Promise<Loudness>;
  /** Bind the keys on the window. Default true. */
  keys?: boolean;
  /** Shortcuts of the surrounding screen, bound with these and listed first in the same legend. */
  extraShortcuts?: Shortcut[];
  /** Drawn under the controls, above the legend: where a vote bar goes. */
  footer?: React.ReactNode;
  className?: string;
};

type Loop = { start: number | null; end: number | null };

const db = (x: number) => `${Math.abs(x).toFixed(1)} dB`;

/** Two clips to judge by ear: one transport, a switch that keeps the playhead, a loop, and matched levels. */
export function CompareAudio({ label, a, b, blind, missing, levelMatch = true, align = "auto", measure = measureLoudness, keys = true, extraShortcuts = [], footer, className }: CompareAudioProps) {
  const refA = React.useRef<HTMLAudioElement>(null);
  const refB = React.useRef<HTMLAudioElement>(null);
  const sa = useMediaElement(refA);
  const sb = useMediaElement(refB);
  const [showing, setShowing] = React.useState<"a" | "b">("a");
  const [volume, setVolume] = React.useState(100);
  const [matching, setMatching] = React.useState(levelMatch);
  const [loop, setLoop] = React.useState<Loop>({ start: null, end: null });
  const [levels, setLevels] = React.useState<{ key: string; a: Loudness; b: Loudness } | "failed" | null>(null);

  const active = showing === "a" ? sa : sb;
  const keyOf = `${a.media.src}|${b.media.src}`;

  // Measure both clips once per pair, and only while matching.
  React.useEffect(() => {
    if (!matching) return;
    let live = true;
    setLevels(null);
    Promise.all([measure(a.media.src), measure(b.media.src)]).then(
      ([la, lb]) => live && setLevels({ key: keyOf, a: la, b: lb }),
      () => live && setLevels("failed"),
    );
    return () => {
      live = false;
    };
  }, [matching, keyOf, a.media.src, b.media.src, measure]);

  const gains = matching && levels && levels !== "failed" && levels.key === keyOf ? matchGains(levels.a, levels.b) : { a: 0, b: 0 };
  React.useEffect(() => {
    if (refA.current) refA.current.volume = (volume / 100) * gainToVolume(gains.a);
    if (refB.current) refB.current.volume = (volume / 100) * gainToVolume(gains.b);
  }, [volume, gains.a, gains.b]);

  // Which share of the other clip is the same place as `time` in this one.
  const carry = (time: number, from: { duration: number | null }, to: { duration: number | null }) => {
    const known = from.duration && to.duration;
    if (!known || align === "time") return time;
    const differ = Math.abs(from.duration! - to.duration!) / Math.max(from.duration!, to.duration!) > 0.02;
    return align === "proportion" || differ ? (time / from.duration!) * to.duration! : time;
  };
  const hear = (side: "a" | "b") => {
    if (side === showing) return;
    const from = showing === "a" ? sa : sb;
    const to = side === "a" ? sa : sb;
    const wasPlaying = from.playing;
    from.pause();
    to.seek(carry(from.time, from, to));
    if (wasPlaying) void to.play();
    setShowing(side);
  };
  const flip = () => hear(showing === "a" ? "b" : "a");

  const duration = active.duration ?? 0;
  const at = (share: number | null) => (share === null || !duration ? null : share * duration);
  const setPoint = (point: "start" | "end") => {
    if (!duration) return;
    const share = active.time / duration;
    setLoop((l) => {
      const next = { ...l, [point]: share };
      // A start after the end (or an end before the start) replaces the other point.
      if (next.start !== null && next.end !== null && next.start >= next.end) return point === "start" ? { start: share, end: null } : { start: null, end: share };
      return next;
    });
  };
  const clearLoop = () => setLoop({ start: null, end: null });

  // Back to the start of the range when the end is reached.
  const looping = loop.start !== null && loop.end !== null;
  const enforce = React.useCallback(() => {
    const e = (showing === "a" ? refA : refB).current;
    if (!e || !looping || !Number.isFinite(e.duration)) return;
    if (e.currentTime >= loop.end! * e.duration || e.currentTime < loop.start! * e.duration - 0.05) e.currentTime = loop.start! * e.duration;
  }, [showing, looping, loop.start, loop.end]);
  // Only while playing: a paused judge may park the playhead anywhere (to set a new start, say).
  React.useEffect(() => {
    if (looping && active.playing && active.time >= loop.end! * duration) enforce();
  }, [active.time, active.playing, looping, loop.end, duration, enforce]);
  React.useEffect(() => {
    if (!looping || !active.playing) return;
    let frame = requestAnimationFrame(function tick() {
      enforce();
      frame = requestAnimationFrame(tick);
    });
    return () => cancelAnimationFrame(frame);
  }, [looping, active.playing, enforce]);

  const shortcuts: Shortcut[] = [
    ...extraShortcuts,
    { keys: ["1"], label: `Hear ${a.label}`, run: () => hear("a") },
    { keys: ["2"], label: `Hear ${b.label}`, run: () => hear("b") },
    { keys: ["x"], label: `Flip ${a.label} and ${b.label}`, run: flip },
    { keys: [" ", "k"], label: "Play or pause", run: active.toggle },
    { keys: ["j"], label: "Back 1 s", run: () => active.seek(Math.max(0, active.time - 1)), repeat: true },
    { keys: ["l"], label: "Forward 1 s", run: () => active.seek(active.time + 1), repeat: true },
    { keys: ["i"], label: "Loop starts here", run: () => setPoint("start") },
    { keys: ["o"], label: "Loop ends here", run: () => setPoint("end") },
    { keys: ["c"], label: "Clear the loop", run: clearLoop, disabled: loop.start === null && loop.end === null },
  ];
  useHotkeys(shortcuts, { enabled: keys });

  const failed = sa.error || sb.error;
  const marks = [
    ...(loop.start !== null && at(loop.start) !== null ? [{ time: at(loop.start)!, label: "Loop start" }] : []),
    ...(loop.end !== null && at(loop.end) !== null ? [{ time: at(loop.end)!, label: "Loop end" }] : []),
  ];
  const range = (share: number | null) => (share === null || !duration ? format.missing : format.timecode(share * duration, { precision: "seconds" }));

  let levelLine: string | null = null;
  if (matching) {
    if (levels === "failed") levelLine = "Could not measure the levels, so the clips are not matched.";
    else if (!levels || levels.key !== keyOf) levelLine = "Measuring levels…";
    else if (gains.a === 0 && gains.b === 0) levelLine = "Both clips are at the same level.";
    else {
      const [loud, quiet, cut] = gains.a < 0 ? [a.label, b.label, gains.a] : [b.label, a.label, gains.b];
      levelLine = `${loud} is louder than ${quiet}, so it is turned down by ${db(cut)}.`;
    }
  }

  return (
    <section aria-label={label} className={cn("grid gap-3", className)}>
      <audio ref={refA} src={a.media.src} preload="auto" aria-label={`Clip ${a.label}`} />
      <audio ref={refB} src={b.media.src} preload="auto" aria-label={`Clip ${b.label}`} />
      <div className="flex flex-wrap items-center gap-3">
        <ToggleGroup
          label="Listen to"
          options={[
            { value: "a", label: a.label },
            { value: "b", label: b.label },
          ]}
          value={showing}
          onChange={(v) => hear(v as "a" | "b")}
        />
        <Switch label="Match loudness" on={matching} onChange={setMatching} />
      </div>
      {!blind && (a.note || b.note) && (
        <p className="type-caption text-muted-foreground">
          {[a, b].filter((c) => c.note).map((c) => `${c.label}: ${c.note}`).join(" · ")}
        </p>
      )}
      {failed && (
        <p role="alert" className="type-body-sm text-danger">
          {missing}
        </p>
      )}
      <Transport playing={active.playing} onPlayPause={active.toggle}>
        <TimeReadout time={active.time} duration={active.duration} />
        <SeekBar time={active.time} duration={active.duration} onSeek={active.seek} marks={marks} buffered={active.buffered} label={`Position in ${(showing === "a" ? a : b).label}`} step={1} />
        <VolumeControl volume={volume} onVolumeChange={setVolume} />
      </Transport>
      <div className="flex flex-wrap items-center gap-2">
        <Button size="sm" onPress={() => setPoint("start")} disabled={!duration}>
          Loop starts here
        </Button>
        <Button size="sm" onPress={() => setPoint("end")} disabled={!duration}>
          Loop ends here
        </Button>
        <Button size="sm" variant="ghost" onPress={clearLoop} disabled={loop.start === null && loop.end === null}>
          Clear the loop
        </Button>
        <span role="status" className="type-caption tabular-nums text-muted-foreground">
          {looping ? `Looping ${range(loop.start)} to ${range(loop.end)}` : loop.start !== null ? `Loop starts at ${range(loop.start)}` : loop.end !== null ? `Loop ends at ${range(loop.end)}` : "No loop"}
        </span>
      </div>
      {levelLine && (
        <p role="status" className="type-body-sm text-muted-foreground">
          {levelLine}
        </p>
      )}
      {footer}
      {keys && <KeysLegend shortcuts={shortcuts} />}
    </section>
  );
}
