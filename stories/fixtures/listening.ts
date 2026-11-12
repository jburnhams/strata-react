import type { TranscriptGroup, TranscriptPhrase } from "../../src";

// Fixtures for the listening components (Waveform, TranscriptView, the window and group stories):
// a track as peaks with its beats and sung spans, and a talk as timed phrases in two languages.

/** A 90 second track as 900 peaks: a quiet intro, a verse and a louder chorus, with a beat in it. */
export const trackDuration = 90;
export const trackPeaks = Array.from({ length: 900 }, (_, i) => {
  const t = i / 10;
  const level = t < 8 ? 0.12 : t < 40 ? 0.45 : t < 52 ? 0.3 : 0.85;
  const beat = Math.pow(Math.abs(Math.sin((t * Math.PI * 2) / 0.5 / 2)), 3);
  return Math.min(1, level * (0.45 + 0.55 * beat) * (0.8 + 0.2 * Math.sin(i / 7)));
});
/** 120 bpm: a beat every half second, a bar every two seconds, the first downbeat at 2 s, and the chapters. */
export const trackMarks = [
  ...Array.from({ length: 170 }, (_, i) => ({ time: 2 + i * 0.5, kind: "beat" as const })),
  ...Array.from({ length: 44 }, (_, i) => ({ time: 2 + i * 2, kind: i === 0 ? ("downbeat" as const) : ("bar" as const), label: i === 0 ? "First downbeat" : `Bar ${i + 1}` })),
  { time: 40, kind: "chapter" as const, label: "Bridge" },
  { time: 52, kind: "chapter" as const, label: "Chorus" },
];
export const trackSpans = [
  { from: 8, to: 40, label: "Sung", tone: "info" as const },
  { from: 52, to: 84, label: "Sung", tone: "info" as const },
  { from: 40, to: 52, label: "Instrumental", tone: "neutral" as const },
];

const talk = [
  ["Ada", "Welcome, everyone, and thank you for coming this evening", "Bienvenue à tous, et merci d'être venus ce soir"],
  ["Ada", "Tonight we are going to look at how the kiln is loaded", "Ce soir, nous allons voir comment le four est chargé"],
  ["Ben", "Can I ask about the shelves before we start", "Puis-je poser une question sur les étagères avant de commencer"],
  ["Ada", "Of course, the shelves come first", "Bien sûr, les étagères d'abord"],
  ["Ben", "They look quite close together to me", "Elles me semblent assez proches les unes des autres"],
  ["Ada", "A finger's width is enough for stoneware", "La largeur d'un doigt suffit pour le grès"],
] as const;

/** Builds a phrase from a sentence, one word every 0.4 s (the last a little longer). */
export function makePhrase(id: string, start: number, text: string, speaker?: string, translated?: string): TranscriptPhrase {
  const words = text.split(" ").map((w, i) => ({ text: w, start: start + i * 0.4, end: start + (i + 1) * 0.4 }));
  return { id, start, end: start + words.length * 0.4 + 0.3, words, speaker, alt: translated ? { french: translated } : undefined };
}

/** A short talk in two clips with two speakers and a French alternate. */
export const talkGroups: TranscriptGroup[] = (() => {
  let at = 0;
  const phrases = talk.map(([who, en, fr], i) => {
    const p = makePhrase(`t${i}`, at, en, who, fr);
    at = p.end + 0.6;
    return p;
  });
  return [
    { id: "clip-1", title: "Welcome", phrases: phrases.slice(0, 2) },
    { id: "clip-2", title: "Questions", phrases: phrases.slice(2) },
  ];
})();
export const talkLength = talkGroups[1].phrases[talkGroups[1].phrases.length - 1].end;

/** 2000 phrases in 40 clips, for the virtualised story. */
export const longTalk: TranscriptGroup[] = Array.from({ length: 40 }, (_, g) => ({
  id: `long-${g}`,
  title: `Clip ${g + 1}`,
  phrases: Array.from({ length: 50 }, (_, i) => {
    const n = g * 50 + i;
    return makePhrase(`l${n}`, n * 4, `Phrase number ${n + 1} says something short`, n % 2 ? "Ben" : "Ada");
  }),
}));
