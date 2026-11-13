import Hls, { type HlsConfig } from "hls.js";
import type { SourceAttacher, StreamAttachment, StreamContext } from "../components/media-player";

// The HLS entry: `import { attachHls } from "strata-react/hls"` (strata-react issue #179, from
// strata-360, whose film preview is an HLS stream that starts playing after a couple of seconds and
// keeps growing while the rest is made). `hls.js` is an optional peer that only this entry imports, as
// `leaflet` is for the map, so an app that never plays a stream never installs it, and the main entry
// never reaches it (the peer-contract test walks the built chunks to keep that true).
//
// It is a `SourceAttacher`, the one shape the main entry knows: `<MediaPlayer attach={attachHls}
// src="…/film.m3u8" />`, or `useAttachedSource(ref, src, attachHls, media.reportProblem)` beside
// `useMediaElement` for a plain `<video>` (the panorama viewer, the compare components). It does three
// things the engine does not do for a player:
//
// - **The engine wherever it can run, the element's own HLS where it cannot.** The brief was "native
//   where the browser plays it", but Chromium now plays HLS natively and, checked in Chromium 158 here,
//   its native pipeline failed (`DEMUXER_ERROR_COULD_NOT_PARSE`) on a growing playlist that hls.js plays,
//   which is the case this exists for. So hls.js is used wherever Media Source Extensions exist, one
//   behaviour on every browser, and the element's `src` only where they do not (older iOS). `prefer:
//   "native"` turns that around for an app that wants the system's own player behaviour.
// - **Recovers what can be recovered, and says what cannot.** hls.js reports a fatal error for a
//   dropped connection or a decoder hiccup that its own `startLoad()` or `recoverMediaError()` fixes;
//   up to three of those are tried quietly (the count resets once a segment loads), and only then does
//   the player's load error appear, in words, with Try again. Try again restarts the engine at the
//   time playback had reached.
// - **Cleans up**: the engine is destroyed when the source changes, the attacher changes or the player
//   unmounts, so a source switch never leaves two engines on one element.
//
// What is *growing* is the player's business (`MediaPlayer growing`), not the engine's: hls.js plays a
// playlist with no end-list as a live one and the element reports the end of what exists as its
// seekable range.
//
// Checked: hls.js has `isSupported()` (false with no Media Source Extensions), `startPosition` for a
// restart in place, `startLoad()` and `recoverMediaError()` for the two recoverable kinds of fatal
// error, and `Events.FRAG_LOADED` to know it is working again.

/** The parts of hls.js this entry uses, so the engine can be handed in (a test's, or an app's own build). */
export type HlsEngine = typeof Hls;

const WORDS = {
  network: "The connection to the stream dropped.",
  media: "The stream could not be decoded.",
  other: "The stream could not be played.",
  unsupported: "This browser cannot play this kind of stream.",
};

/** The words an HLS attacher says for each way a stream fails. */
export type HlsWords = Partial<Record<keyof typeof WORDS, string>>;

/** Options of an HLS attacher. */
export type HlsAttacherOptions = {
  /** Which to use where both would do: `"engine"` (default) is hls.js, `"native"` is the element's own HLS. Where only one is available that one is used. */
  prefer?: "engine" | "native";
  /** hls.js's own configuration. */
  config?: Partial<HlsConfig>;
  /** What each failure says in the product's words (the connection dropped, the stream could not be decoded, anything else, no support here). Defaults are plain English. */
  words?: HlsWords;
};

/** Makes a `SourceAttacher` around an hls.js engine: the engine where the browser has Media Source Extensions, otherwise the element's own HLS. */
export function createHlsAttacher(Engine: HlsEngine, { prefer = "engine", config = {}, words = {} }: HlsAttacherOptions = {}): SourceAttacher {
  const say = { ...WORDS, ...words };
  return (el: HTMLMediaElement, src: string, context: StreamContext): StreamAttachment => {
    const canNative = el.canPlayType("application/vnd.apple.mpegurl") !== "";
    const native = canNative && (prefer === "native" || !Engine.isSupported());
    let engine: Hls | null = null;
    let seekOnLoad: (() => void) | null = null;

    const stop = () => {
      engine?.destroy();
      engine = null;
      if (seekOnLoad) el.removeEventListener("loadedmetadata", seekOnLoad);
      seekOnLoad = null;
    };

    const start = (at: number) => {
      stop();
      if (native) {
        el.src = src;
        if (at > 0) {
          seekOnLoad = () => {
            el.currentTime = at;
            seekOnLoad = null;
          };
          el.addEventListener("loadedmetadata", seekOnLoad, { once: true });
        }
        return;
      }
      if (!Engine.isSupported()) {
        context.onProblem(say.unsupported);
        return;
      }
      // Where playback had reached, else the app's own start, else the beginning of a source still being made
      // (an EVENT playlist counts as live to hls.js, which with -1 would start at the newest part), else hls.js's choice.
      const hls = new Engine({ ...config, startPosition: at > 0 ? at : (config.startPosition ?? (context.growing ? 0 : -1)) });
      engine = hls;
      let recoveries = 0;
      hls.on(Engine.Events.FRAG_LOADED, () => {
        recoveries = 0;
      });
      hls.on(Engine.Events.ERROR, (_event, data) => {
        if (!data.fatal || engine !== hls) return;
        if (recoveries < 3 && data.type === Engine.ErrorTypes.NETWORK_ERROR) {
          recoveries++;
          hls.startLoad();
        } else if (recoveries < 3 && data.type === Engine.ErrorTypes.MEDIA_ERROR) {
          recoveries++;
          hls.recoverMediaError();
        } else {
          context.onProblem(data.type === Engine.ErrorTypes.NETWORK_ERROR ? say.network : data.type === Engine.ErrorTypes.MEDIA_ERROR ? say.media : say.other);
          stop();
        }
      });
      hls.loadSource(src);
      hls.attachMedia(el);
    };

    start(context.startAt);
    return {
      detach: () => {
        stop();
        if (native) el.removeAttribute("src");
      },
      reload: start,
    };
  };
}

/** HLS for `MediaPlayer attach` and `useAttachedSource`: hls.js where the browser has Media Source Extensions, the element's own HLS where it does not. */
export const attachHls: SourceAttacher = createHlsAttacher(Hls);

/** An HLS attacher with options: `prefer: "native"`, or hls.js's own `config` (buffer sizes, headers). */
export const hlsAttacher = (options: HlsAttacherOptions): SourceAttacher => createHlsAttacher(Hls, options);

/** Whether this browser can play HLS at all, natively or through hls.js. */
export function hlsSupported(): boolean {
  if (typeof document === "undefined") return false;
  return document.createElement("video").canPlayType("application/vnd.apple.mpegurl") !== "" || Hls.isSupported();
}
