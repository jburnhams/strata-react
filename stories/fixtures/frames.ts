// Stand-ins for frames of a home video (a garden party filmed on a camcorder): a lawn, a sky, a
// table, and a figure that walks across as time passes, so a strip of them visibly moves through
// the scene. The colours are the picture's content, not interface colour, so they are plain values
// as a frame's pixels would be. Data URIs, so stories and visual baselines need no network or files.

const svg = (t: number) => {
  const x = 20 + ((t * 7) % 260);
  const sky = t % 120 < 60 ? "#b9d3e6" : "#c9d9e2";
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 320 240" width="320" height="240">
<rect width="320" height="240" fill="${sky}"/><rect y="150" width="320" height="90" fill="#7fa36a"/>
<rect x="190" y="130" width="100" height="10" fill="#e8e2d6"/><rect x="200" y="140" width="6" height="40" fill="#8a7a66"/><rect x="274" y="140" width="6" height="40" fill="#8a7a66"/>
<circle cx="${x}" cy="118" r="12" fill="#e0b896"/><rect x="${x - 11}" y="130" width="22" height="44" rx="6" fill="#c65b4f"/>
<rect y="232" width="320" height="8" fill="#00000022"/></svg>`;
};

/** A frame's picture at `t` seconds, as an address an `<img>` can load. */
export const frameAt = (t: number) => `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg(t))}`;

/** Frames every `step` seconds from `start`, as `FilmStrip` takes them. */
export const framesFrom = (start: number, count: number, step = 10) => Array.from({ length: count }, (_, i) => ({ time: start + i * step, src: frameAt(start + i * step) }));
