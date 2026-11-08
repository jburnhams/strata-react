import type { Glaze, ShelfPhoto } from "./kiln";

// A stand-in for a photo of a fired piece: its form drawn in its glaze, on the kiln shelf. The
// colours are the picture's content (what the glaze looks like), not interface colour, so they are
// plain values here as a photo's pixels would be. Inline SVG, so stories and visual baselines need
// no network and no image files.

const glazeColour: Record<Glaze, string> = {
  celadon: "#8fb5a3",
  tenmoku: "#4a2a1c",
  shino: "#e3c6a8",
  cobalt: "#2d4f8f",
  "copper-red": "#9b2c2c",
  bisque: "#d9c2a7",
  raku: "#cfcac0",
};

const forms = [
  "M20 45q30-14 60 0l-8 30q-22 8-44 0z", // bowl
  "M30 30h40l-4 50q-16 6-32 0z", // mug
  "M38 22h24l-2 14q18 10 12 40q-22 8-44 0q-6-30 12-40z", // jug
  "M42 18h16v12q14 12 10 46q-18 8-36 0q-4-34 10-46z", // vase
  "M12 66q38-12 76 0l-4 8q-34 6-68 0z", // plate
  "M45 14h10v18q16 10 12 44q-17 8-34 0q-4-34 12-44z", // bottle
];

/** Draws one piece. `alt` is left to the tile's box, which names the piece. */
export function PiecePicture({ photo }: { photo: ShelfPhoto }) {
  const n = Number(photo.id.slice(2));
  const fill = glazeColour[photo.glaze];
  return (
    <svg viewBox="0 0 100 100" aria-hidden preserveAspectRatio="xMidYMid slice">
      <rect width="100" height="100" fill="#ece6dc" />
      <rect y="80" width="100" height="20" fill="#cbc2b4" />
      <path d={forms[(n * 5 - 5) % forms.length]} fill={fill} opacity={photo.thin ? 0.55 : 1} />
    </svg>
  );
}
