import type { PictureBox } from "../../src";

// A stand-in for a photo of people at a kiln opening, for the face stories (strata-models' face
// store): three people drawn as heads and shoulders on a wall, as inline SVG so stories and baselines
// need no files. The colours are the picture's own pixels, not interface colour. 1600 by 1000, so a
// face box's coordinates are real pixels of the photo, as the face store gives them.

export const PHOTO_SIZE = { w: 1600, h: 1000 } as const;

const people = [
  {
    id: "f1",
    cx: 420,
    cy: 380,
    r: 95,
    skin: "#e0b48f",
    shirt: "#3d6b74",
    label: "Face 1: Ada Okafor, confirmed",
    tone: "success" as const,
  },
  { id: "f2", cx: 820, cy: 330, r: 105, skin: "#8d5a3b", shirt: "#b5683a", label: "Face 2: not named yet" },
  {
    id: "f3",
    cx: 1230,
    cy: 420,
    r: 85,
    skin: "#f1cdb0",
    shirt: "#55606e",
    label: "Face 3: suggested, Tom Ellery",
    tone: "warning" as const,
  },
];

/** The faces in the photo, as the face store finds them: a little wider than the head, taller than wide. */
export const photoFaces: PictureBox[] = people.map((p) => ({
  id: p.id,
  x: p.cx - p.r * 0.85,
  y: p.cy - p.r * 1.05,
  w: p.r * 1.7,
  h: p.r * 2.1,
  label: p.label,
  tone: p.tone,
}));

function photoSvg(): string {
  const bodies = people
    .map(
      (p) =>
        `<ellipse cx="${p.cx}" cy="${p.cy + p.r * 3.1}" rx="${p.r * 2.1}" ry="${p.r * 1.9}" fill="${p.shirt}"/>` +
        `<ellipse cx="${p.cx}" cy="${p.cy}" rx="${p.r * 0.8}" ry="${p.r}" fill="${p.skin}"/>` +
        `<path d="M${p.cx - p.r * 0.82} ${p.cy - p.r * 0.2} Q${p.cx} ${p.cy - p.r * 1.6} ${p.cx + p.r * 0.82} ${p.cy - p.r * 0.2} Q${p.cx} ${p.cy - p.r * 0.9} ${p.cx - p.r * 0.82} ${p.cy - p.r * 0.2}Z" fill="#2b2420"/>` +
        `<circle cx="${p.cx - p.r * 0.3}" cy="${p.cy - p.r * 0.05}" r="${p.r * 0.08}" fill="#2b2420"/><circle cx="${p.cx + p.r * 0.3}" cy="${p.cy - p.r * 0.05}" r="${p.r * 0.08}" fill="#2b2420"/>` +
        `<path d="M${p.cx - p.r * 0.3} ${p.cy + p.r * 0.45} Q${p.cx} ${p.cy + p.r * 0.65} ${p.cx + p.r * 0.3} ${p.cy + p.r * 0.45}" stroke="#2b2420" stroke-width="${p.r * 0.06}" fill="none"/>`,
    )
    .join("");
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${PHOTO_SIZE.w} ${PHOTO_SIZE.h}"><rect width="${PHOTO_SIZE.w}" height="${PHOTO_SIZE.h}" fill="#c9b8a0"/><rect y="760" width="${PHOTO_SIZE.w}" height="240" fill="#8a7560"/><rect x="60" y="80" width="260" height="200" fill="#d9cdb8"/>${bodies}</svg>`;
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
}

/** The photo, as a data URL. */
export const groupPhoto = photoSvg();
