import * as React from "react";
import { ImageOff } from "lucide-react";
import { Skeleton } from "./data-view";
import { useInView } from "../lib/in-view";
import { cn } from "../lib/utils";

// A photo or crop from an API, in a list, a table cell or a grid (strata-react issue #33, from
// the Bright Horizons review app, where some crops 404 because the file is missing on disk). A
// plain <img> gets three things wrong there, and each is a state generated UI leaves out:
//
// - it has no size until it loads, so the rows below jump as each one arrives. The box here has
//   its aspect ratio before anything is fetched, and the image is cropped (`cover`) or fitted
//   (`contain`) into it, so nothing moves.
// - while it loads it is a blank, and on a slow connection a blank reads as "no photo". Here it
//   is a `Skeleton`, the same placeholder DataView's loading layouts are made of.
// - when it fails it is the browser's broken-image icon and the alt text crammed into the box.
//   Here it says what happened in the product's words: `missing` is required ("Photo not
//   found"), for the same reason DataView requires `empty`. A record with no photo at all
//   (`src={null}`) shows the same words without a request.
//
// `alt` is required too; pass "" only when the name beside the thumbnail already says everything
// it shows. The missing state is an `img` named "<alt>: <missing>", so a screen reader hears
// which photo is gone. Thumbnails come in dozens, so the request waits until the box is near the
// screen (`useInView`, the hook InfiniteList's sentinel uses, with the same scroll region and a
// root margin), and once asked for it is not unloaded. `eager` is for the first few on screen.
// There is no fade-in: a list of thumbnails is seen many times a day (ux-character.md, character
// by frequency), so the photo simply replaces its skeleton.
//
// Two more uses from the Tubes viewer (strata-react issue #51), which drew plain <img>s and lost
// all of the above:
//
// - `children` are drawn above the image in the same positioned box: a video's running time in
//   one corner, "Saved" in another. They keep their place while the image loads, fails or is
//   missing, because the box, not the image, holds them. Position them yourself (`absolute
//   bottom-1 right-1`); they are not part of the image's name.
// - `fallback` replaces the icon and words with the product's own drawing, such as a channel's
//   first letter on a disc for an avatar with no picture. The missing state is still one `img`,
//   named `alt` (with `missing` after it, when given, as "Night Sky: No picture"), so a person
//   using a screen reader hears whose picture it is either way. A round avatar is `aspect={1}`
//   with `className="rounded-pill"`. With `alt=""` and no `missing` words (a decorative avatar beside a
//   name that already says it) there is nothing to name, so the missing state is not an image role at all
//   (strata-react issue #209: an `img` named "" is flagged by axe, and the `<img alt="">` it replaces is
//   presentational).
//
// What a third party's pictures need from the app (issue #209, from Tubes), which made it draw its own
// `<img>` and lose everything above:
//
// - `src` may be a list, tried in order: the next one when a request fails or is rejected, the missing
//   state after the last (`maxres`, then `hq`).
// - `onLoad(img)` sees each loaded image and may return `false` to reject it: a host that answers a
//   missing item with a 200 and a small grey placeholder is recognised by its `naturalWidth`, and the
//   next source is tried as if it had failed.
// - `onMissing()` is called once when the thumbnail ends in its missing state after asking for
//   something (not for `src={null}`), so an app can record that the item behind it has gone.

/** A width-over-height ratio: a number (`1.5`) or a fraction (`"4/3"`). */
export type AspectRatio = number | `${number}/${number}`;

/** The thumbnail's props. Either `missing` (the words shown when there is no image) or a `fallback` drawing is required. */
export type ThumbnailProps = {
  /** The image URL, or a list of them tried in order (the next one when a request fails or `onLoad` rejects it). `null` or an empty list when the record has no photo: the `missing` words show without a request. */
  src: string | readonly string[] | null;
  /** What the photo shows ("Celadon bowl, front"). `""` only when the text beside it already says it. */
  alt: string;
  /** Width over height. The box has this shape before the image loads. Default `1`. */
  aspect?: AspectRatio;
  /** `cover` crops to fill the box (default); `contain` fits the whole image in it. */
  fit?: "cover" | "contain";
  srcSet?: string;
  sizes?: string;
  /** Load at once rather than when near the screen: for the first few above the fold. */
  eager?: boolean;
  /** How far outside the scroll region the request starts (IntersectionObserver `rootMargin`). */
  rootMargin?: string;
  /** Layout at the call site: a width (`w-24`, `w-full`), or `rounded-pill` for an avatar. The height follows from `aspect`. */
  className?: string;
  /** Sees each image that loaded, with the index of its source. Return `false` to reject it (a host's grey placeholder answered with a 200): the next source is tried, or the missing state shows. */
  onLoad?: (image: HTMLImageElement, index: number) => boolean | void;
  /** Called once when the thumbnail ends in its missing state after a request failed or was rejected, never for a record with no source. */
  onMissing?: () => void;
  /** Overlays drawn above the image in the same box (a running time, a "Saved" badge), in place whether the image has loaded, failed or is missing. */
  children?: React.ReactNode;
} & (
  | {
      /** What to show when there is no photo or it cannot be loaded, in the product's words: "Photo not found". */
      missing: string;
      /** Drawn instead of the icon and `missing` words when there is no image: a letter on a disc for an avatar. */
      fallback?: React.ReactNode;
    }
  | {
      /** Added to the missing state's name after `alt` ("Night Sky: No picture"), when given. */
      missing?: string;
      /** Drawn when there is no image or it cannot be loaded: a letter on a disc for an avatar. */
      fallback: React.ReactNode;
    }
);

type Phase = "loading" | "loaded" | "missing";
type Outcome = { key: string; index: number; done: "loaded" | "missing" | null };

const ratio = (aspect: AspectRatio) => (typeof aspect === "number" ? String(aspect) : aspect.replace("/", " / "));

/** A box of fixed aspect ratio for a remote image: a skeleton until it loads, the `missing` words (or a `fallback`) if it cannot, a request only when it nears the screen, and `children` overlaid in its corners. `alt` and `missing` or `fallback` are required. */
export function Thumbnail({
  src,
  alt,
  missing,
  aspect = 1,
  fit = "cover",
  srcSet,
  sizes,
  eager = false,
  rootMargin = "200px",
  className,
  fallback,
  onLoad,
  onMissing,
  children,
}: ThumbnailProps) {
  // The outcome is kept with the request it belongs to (the sources and `srcSet`, since the browser may
  // have loaded a candidate from either), so a new request starts loading again without an effect
  // to reset it, and a late event from the old image cannot mark the new one. `index` is the source being tried.
  const sources = React.useMemo(() => (src === null ? [] : typeof src === "string" ? (src ? [src] : []) : src.filter(Boolean)), [src]);
  const key = sources.length ? `${sources.join("\n")} ${srcSet ?? ""}` : null;
  const [outcome, setOutcome] = React.useState<Outcome | null>(null);
  const mine = key !== null && outcome?.key === key ? outcome : null;
  const index = mine?.index ?? 0;
  const phase: Phase = key === null ? "missing" : mine?.done ?? "loading";
  const current = sources[index];
  const near = useInView({ active: !eager && sources.length > 0, rootMargin, once: true, unsupported: true });
  const requested = eager || near.inView;
  // The next source, or the end of the list.
  const fail = () => setOutcome(index + 1 < sources.length ? { key: key!, index: index + 1, done: null } : { key: key!, index, done: "missing" });
  // An app that records what is gone is told once per request that ended without a picture.
  const told = React.useRef<string | null>(null);
  const tell = React.useRef(onMissing);
  tell.current = onMissing;
  React.useEffect(() => {
    if (key !== null && phase === "missing" && told.current !== key) {
      told.current = key;
      tell.current?.();
    }
  }, [key, phase]);

  const name = [alt, missing].filter(Boolean).join(": ");
  return (
    <div
      ref={near.ref}
      className={cn("relative overflow-hidden rounded-control bg-muted", className)}
      style={{ aspectRatio: ratio(aspect) }}
      aria-busy={phase === "loading" || undefined}
    >
      {phase === "loading" && <Skeleton className="absolute inset-0" />}
      {key !== null && phase !== "missing" && requested && (
        <img
          key={`${key}#${index}`}
          src={current}
          srcSet={srcSet}
          sizes={sizes}
          alt={alt}
          decoding="async"
          onLoad={(e) => (onLoad?.(e.currentTarget, index) === false ? fail() : setOutcome({ key: key!, index, done: "loaded" }))}
          onError={fail}
          className={cn("absolute inset-0 size-full", fit === "cover" ? "object-cover" : "object-contain", phase === "loading" && "opacity-0")}
        />
      )}
      {phase === "missing" && (
        <div
          {...(name ? { role: "img", "aria-label": name } : { "aria-hidden": true })}
          className={cn(
            "absolute inset-0 grid",
            fallback === undefined && "content-center justify-items-center gap-0.5 p-1 text-center text-muted-foreground",
          )}
        >
          {fallback === undefined ? (
            <>
              <ImageOff aria-hidden className="size-4 shrink-0" />
              <span className="type-caption text-balance">{missing}</span>
            </>
          ) : (
            <div aria-hidden className="grid size-full min-h-0 min-w-0">
              {fallback}
            </div>
          )}
        </div>
      )}
      {children}
    </div>
  );
}

/** The loading shape of a `Thumbnail`, for a `DataView` skeleton: the same box and aspect ratio, so nothing moves when the list arrives. */
export function ThumbnailSkeleton({ aspect = 1, className }: { aspect?: AspectRatio; className?: string }) {
  return (
    <div aria-hidden className={cn("relative overflow-hidden rounded-control bg-muted", className)} style={{ aspectRatio: ratio(aspect) }}>
      <Skeleton className="absolute inset-0" />
    </div>
  );
}
