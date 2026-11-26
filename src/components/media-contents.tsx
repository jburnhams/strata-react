import * as React from "react";
import { Button as AriaButton } from "react-aria-components";
import { format } from "../lib/format";
import { cn } from "../lib/utils";

// The contents of one media file: its chapters as a short list beside the player, the one playing
// marked, and pressing one plays from its start (issue #372, from strata-reels' tape page, where a
// three-hour family tape is one file grouped into occasions: "Christmas morning", "Christmas dinner").
// `MediaPlayer`'s own chapter list is for a sequence of files (`sources`); `TranscriptView` groups are
// about words; `ActiveList` is a queue worked from the keyboard. This is the table of contents.
//
// - **Each row is one press target**, React Aria's `Button`, named for what it does ("Play Christmas
//   dinner, from 40:12"), with the title first, a line of detail the app gives (how many scenes, who
//   is in it), and the start and length right-aligned in tabular figures (`format.runningTime`).
// - **The one playing** is the item whose span holds `time`: `aria-current="time"`, and the bar and
//   tint `TranscriptView` uses for its current phrase, so the two read the same on one page. More than
//   colour: a thick left bar. Rows are memoised and get only whether they are current, so a playhead
//   moving four times a second re-draws the two rows that change, not the list.
// - **It never scrolls the page.** Following the playhead would yank the page while a person reads
//   elsewhere; `onSelect` tells the app which item was pressed, so it can bring its own section into
//   view on purpose.
// - Fits a narrow column (a sticky one beside the player): the title wraps, the times stay on one line.
// - No hue of its own, nothing animates (seen many times a day: ux-character.md).

/** One stretch of the file: its id, title, span in seconds, and an optional line under the title. */
export type MediaContentsItem = {
  id: string;
  title: string;
  start: number;
  end: number;
  /** Under the title: "3 scenes", "Grandma, the children". */
  detail?: React.ReactNode;
};

/** The media contents' props. */
export type MediaContentsProps = {
  /** Names the list: "Chapters of the tape". */
  label: string;
  /** The stretches in order. */
  items: readonly MediaContentsItem[];
  /** The playhead, seconds: the item holding it is marked current. */
  time?: number;
  /** Plays from a time (an item's start). */
  onSeek: (time: number) => void;
  /** Told which item was pressed, after `onSeek`, for an app that brings its own section into view. */
  onSelect?: (id: string) => void;
  className?: string;
};

/** The index of the item whose span holds `time`, or -1. */
export function currentItem(
  items: readonly Pick<MediaContentsItem, "start" | "end">[],
  time: number | undefined,
): number {
  if (time === undefined) return -1;
  return items.findIndex((it) => time >= it.start && time < it.end);
}

/** One media file's chapters as a list of contents beside its player: the one playing marked, and pressing one plays from its start. */
export function MediaContents({ label, items, time, onSeek, onSelect, className }: MediaContentsProps) {
  const current = currentItem(items, time);
  return (
    <ol aria-label={label} className={cn("grid min-w-0 gap-0", className)}>
      {items.map((item, i) => (
        <ContentsRow key={item.id} item={item} current={i === current} onSeek={onSeek} onSelect={onSelect} />
      ))}
    </ol>
  );
}

const ContentsRow = React.memo(function ContentsRow({
  item,
  current,
  onSeek,
  onSelect,
}: {
  item: MediaContentsItem;
  current: boolean;
  onSeek: (time: number) => void;
  onSelect?: (id: string) => void;
}) {
  const from = format.runningTime(item.start);
  return (
    <li aria-current={current ? "time" : undefined} data-current={current ? "" : undefined}>
      <AriaButton
        aria-label={`Play ${item.title}, from ${from}`}
        onPress={() => {
          onSeek(item.start);
          onSelect?.(item.id);
        }}
        className={cn(
          "grid w-full cursor-pointer grid-cols-[minmax(0,1fr)_auto] items-baseline gap-x-3 gap-y-0.5 border-l-2 border-transparent px-3 py-2 text-left transition-state hover:bg-muted",
          current && "border-primary bg-accent hover:bg-accent",
        )}
      >
        <span className="type-label text-foreground">{item.title}</span>
        <span className="type-body-sm tabular-nums text-muted-foreground whitespace-nowrap">{from}</span>
        {item.detail ? <span className="type-caption text-muted-foreground">{item.detail}</span> : <span />}
        <span className="type-caption tabular-nums text-muted-foreground whitespace-nowrap">
          {format.runningTime(item.end - item.start)} long
        </span>
      </AriaButton>
    </li>
  );
});
