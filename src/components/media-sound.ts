// A player's sound through Web Audio, for a level the element's own `volume` cannot reach (an app's loudness
// normalisation, issue from Tubes: a quiet video made as loud as the others, and a person's Louder past 100%).
//
// `volume` is a factor of 0 to 1, so anything louder needs the element's sound taken into an `AudioContext`
// (`createMediaElementSource`) and through gain there. Measured in Chromium (2026-11-28): the element's `volume`
// and `muted` still apply before the graph, so the volume slider keeps working unchanged under it; the graph adds
// only what lies past it. Three things shape this file:
//
// - An element can be given to a context once, ever (a second `createMediaElementSource` throws), and from then on
//   its sound is heard only through the graph. So the graph is made once per element (a WeakMap), kept for the
//   element's life, and is only made when a level other than 1 is first asked for: a player that never needs one
//   never routes its sound through Web Audio.
// - A suspended context is silent, and a context may only start after a gesture on the page. So the element is
//   routed only once its context is `running`; until then (and where there is no Web Audio at all) it plays as it
//   always did, at the plain level: the gain is lost, never the sound.
// - Gain past 1 can push peaks past full scale, which clip. A `DynamicsCompressorNode` set as a limiter (ratio 20,
//   no knee, threshold 1 dB under full scale) holds them; Chromium's has a 6 ms look-ahead, so it catches a peak
//   before it, not after. The spec gives the compressor an automatic make-up gain, `(1 / curve(1))^0.6`, which
//   would lift everything about 0.6 dB; a gain after it takes that back off, so below the threshold the limiter
//   changes nothing (checked with an OfflineAudioContext: 0.25 in, 0.25 out).
//
// A level set by the app glides there (a time constant of half a second), since it changes while playing as a
// measurement improves; the person's own boost follows the slider at once.
//
// The source must be same-origin or served with CORS (and the element's `crossOrigin` set): a browser gives a
// graph silence from a cross-origin file, so `gain` is for an app's own files.

/** The limiter's threshold, dB under full scale. */
export const LIMIT_DB = -1;
const RATIO = 20;
/** Seconds: how fast an app's level glides to a new value (a time constant; about three of them to arrive). */
export const GLIDE = 0.5;
const FOLLOW = 0.02;

/** The compressor's automatic make-up gain at the limiter's settings, as the Web Audio spec defines it. */
export function makeupGain(threshold = LIMIT_DB, ratio = RATIO) {
  const atFullScale = threshold + (0 - threshold) / ratio; // dB out for 0 dB in, with no knee
  return Math.pow(1 / Math.pow(10, atFullScale / 20), 0.6);
}

type Graph = {
  context: AudioContext;
  level: GainNode;
  boost: GainNode;
  routed: boolean;
  waiting: boolean;
};

const graphs = new WeakMap<HTMLMediaElement, Graph>();

/** Whether this browser can play a level past the element's own (it has Web Audio). */
export function canShapeSound() {
  return typeof window !== "undefined" && typeof window.AudioContext === "function";
}

function graphFor(el: HTMLMediaElement): Graph | null {
  const had = graphs.get(el);
  if (had) return had;
  if (!canShapeSound()) return null;
  const context = new AudioContext();
  const level = context.createGain();
  const boost = context.createGain();
  const limiter = context.createDynamicsCompressor();
  limiter.threshold.value = LIMIT_DB;
  limiter.knee.value = 0;
  limiter.ratio.value = RATIO;
  limiter.attack.value = 0.001;
  limiter.release.value = 0.1;
  const unlift = context.createGain();
  unlift.gain.value = 1 / makeupGain();
  level.connect(boost).connect(limiter).connect(unlift).connect(context.destination);
  const graph: Graph = { context, level, boost, routed: false, waiting: false };
  graphs.set(el, graph);
  return graph;
}

// Takes the element into the graph once the context runs, never before (a suspended context is silent).
function route(el: HTMLMediaElement, graph: Graph) {
  if (graph.routed) return;
  if (graph.context.state !== "running") {
    void graph.context.resume().catch(() => {});
    return;
  }
  try {
    graph.context.createMediaElementSource(el).connect(graph.level);
    graph.routed = true;
  } catch {
    // Given to another context already (an app's own): leave its sound as it is.
    graph.routed = true;
  }
}

/**
 * Applies `gain` (the app's level, a factor) and `boost` (the person's, a factor of 1 or more) to an element's sound.
 * Makes nothing while both are 1 and no graph exists yet. Call again whenever either changes, and on `play` (the
 * gesture that lets the context start).
 */
export function shapeSound(el: HTMLMediaElement, gain: number, boost: number, glide = true) {
  if (!graphs.has(el) && gain === 1 && boost === 1) return;
  const graph = graphFor(el);
  if (!graph) return;
  const now = graph.context.currentTime;
  const wanted = Math.max(0, gain);
  if (Math.abs(graph.level.gain.value - wanted) > 1e-4)
    graph.level.gain.setTargetAtTime(wanted, now, graph.routed && glide ? GLIDE : FOLLOW);
  if (Math.abs(graph.boost.gain.value - boost) > 1e-4) graph.boost.gain.setTargetAtTime(boost, now, FOLLOW);
  if (!graph.routed && !graph.waiting && graph.context.state !== "running") {
    graph.waiting = true;
    graph.context.addEventListener("statechange", function started() {
      if (graph.context.state !== "running") return;
      graph.context.removeEventListener("statechange", started);
      graph.waiting = false;
      route(el, graph);
    });
  }
  route(el, graph);
}
