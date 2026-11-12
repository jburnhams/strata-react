import type { Meta, StoryObj } from "@storybook/react-vite";
import * as React from "react";
import { Button, SeekBar, TimeReadout, Transport, useMediaElement } from "../src";
import { PanoramaViewer, describeView, type PanoramaView } from "../src/panorama";
import panoVideo from "./fixtures/video/pano.webm?url";

// Issue #178: a 360 picture as a window you pan and zoom. The picture is a synthetic equirectangular
// test card (shapes only, so no font changes it): a sky and a ground, a line every 30° of longitude
// and latitude, the horizon and the prime meridian heavier, and a coloured block at each quarter turn
// (red ahead, green right, blue behind, amber left). Resting stories are the visual baselines, drawn
// by the real shader in Chromium; the ones that play or move are skipped by the visual suite.

const card = (() => {
  const w = 2048;
  const h = 1024;
  const lon = (deg: number) => ((deg + 180) / 360) * w;
  const lat = (deg: number) => ((90 - deg) / 180) * h;
  const lines: string[] = [];
  for (let d = -180; d <= 180; d += 30) lines.push(`<line x1="${lon(d)}" x2="${lon(d)}" y1="0" y2="${h}" stroke="${d === 0 ? "#fff" : "#ffffff88"}" stroke-width="${d === 0 ? 8 : 3}"/>`);
  for (let d = -60; d <= 60; d += 30) lines.push(`<line x1="0" x2="${w}" y1="${lat(d)}" y2="${lat(d)}" stroke="${d === 0 ? "#fff" : "#ffffff88"}" stroke-width="${d === 0 ? 8 : 3}"/>`);
  const block = (deg: number, colour: string, ticks: number) => {
    const x = lon(deg);
    const y = lat(0);
    const marks = Array.from({ length: ticks }, (_, i) => `<rect x="${x - 40 + i * 30}" y="${y + 70}" width="16" height="48" fill="#fff"/>`).join("");
    return `<rect x="${x - 60}" y="${y - 120}" width="120" height="180" rx="12" fill="${colour}"/>${marks}`;
  };
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}">` +
    `<defs><linearGradient id="g" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#2d4f8f"/><stop offset="0.5" stop-color="#9ec3e6"/><stop offset="0.5" stop-color="#6b7f4b"/><stop offset="1" stop-color="#2f3a22"/></linearGradient></defs>` +
    `<rect width="${w}" height="${h}" fill="url(#g)"/>${lines.join("")}` +
    block(0, "#c0392b", 1) +
    block(90, "#2e8b57", 2) +
    block(-90, "#d98e04", 3) +
    block(180, "#2a5db0", 4) +
    block(-180, "#2a5db0", 4) +
    `<circle cx="${lon(0)}" cy="${lat(60)}" r="60" fill="#fff"/><circle cx="${lon(0)}" cy="${lat(-60)}" r="60" fill="#222"/>` +
    `</svg>`;
  return `data:image/svg+xml,${encodeURIComponent(svg)}`;
})();

const meta = { title: "Data/PanoramaViewer", component: PanoramaViewer, args: { label: "360 view of the test room", image: card, className: "w-full max-w-3xl" }, parameters: { layout: "padded" } } satisfies Meta<typeof PanoramaViewer>;
export default meta;
type Story = StoryObj<typeof meta>;

/** Straight ahead at 90°: the red block ahead, the green one a quarter turn to the right. Drag, arrow keys, `+` `-` `0` and the wheel work; the canvas is named by where it looks. */
export const Ahead: Story = { args: { defaultView: { yaw: 0, pitch: 0, fov: 90 } } };

/** Looking 60° left and 20° up, narrower: the amber block at the left, the 60° line of latitude curving overhead. */
export const LookingElsewhere: Story = { args: { view: { yaw: -60, pitch: 20, fov: 70 } } };

/** Across the seam: looking just past 180°, where the blue block is split by the edge of the picture and there is no line down it. */
export const AcrossTheSeam: Story = { args: { view: { yaw: 180, pitch: 0, fov: 100 } } };

/** An overlay in the picture's coordinates: markers are DOM (text, focusable), placed with `project`, and stay on their direction when the view changes. */
const marks = [
  { yaw: 0, pitch: 25, text: "Window" },
  { yaw: 90, pitch: -10, text: "Door" },
  { yaw: 40, pitch: 0, text: "Table" },
];
function Marked({ view }: { view?: PanoramaView }) {
  return (
    <PanoramaViewer
      label="360 view of the test room"
      image={card}
      className="w-full max-w-3xl"
      view={view}
      defaultView={{ yaw: 20, pitch: 5, fov: 90 }}
      overlay={({ project }) =>
        marks.map((m) => {
          const at = project(m.yaw, m.pitch);
          return at?.inside ? (
            <span key={m.text} className="absolute -translate-x-1/2 -translate-y-1/2 rounded-pill border border-border bg-background px-2 py-0.5 type-caption text-foreground" style={{ left: at.x, top: at.y }}>
              {m.text}
            </span>
          ) : null;
        })
      }
    />
  );
}
export const WithMarkers: Story = { render: () => <Marked /> };

/** The field-of-view slider as well. */
export const WithFieldOfViewSlider: Story = { args: { defaultView: { yaw: 0, pitch: 0, fov: 70 }, fovSlider: true } };

/** Without WebGL2 the flat picture is drawn, cropped to the same window with the same controls (forced here with `mode="flat"`), and a line says so. */
export const FlatPicture: Story = { args: { mode: "flat", defaultView: { yaw: 0, pitch: 0, fov: 90 } } };

/** Phone width. */
export const Phone: Story = { tags: ["visual-phone"], args: { defaultView: { yaw: 90, pitch: 0, fov: 80 }, className: "w-full", aspect: "4/3" } };

function Aimed() {
  const [aim, setAim] = React.useState(0);
  const [view, setView] = React.useState<PanoramaView>({ yaw: 0, pitch: 0, fov: 90 });
  // The app's own aim mode: follow a heading that moves with time, plus whatever the person added by dragging.
  const [extra, setExtra] = React.useState(0);
  React.useEffect(() => {
    let frame = 0;
    const start = performance.now();
    const tick = (now: number) => {
      setAim(((now - start) / 40) % 360);
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, []);
  const shown = { ...view, yaw: aim + extra };
  return (
    <div className="grid max-w-3xl gap-2">
      <PanoramaViewer
        label="360 view, following a heading"
        image={card}
        view={shown}
        onViewChange={(v) => {
          setView(v);
          setExtra(v.yaw - aim);
        }}
        overlay={({ project }) => {
          const at = project(0, 0);
          return at?.inside ? <span className="absolute size-4 -translate-x-1/2 -translate-y-1/2 rounded-pill border-2 border-background bg-danger" style={{ left: at.x, top: at.y }} /> : null;
        }}
      />
      <p className="type-body-sm tabular-nums text-muted-foreground">{describeView(shown)}. The app sets the heading every frame (no animation in the viewer); a drag adds to it; the dot stays on the red block.</p>
    </div>
  );
}

/** The view driven from outside: the heading advances every frame, a drag adds an offset, and the dot stays on its direction. Skipped by the visual suite. */
export const DrivenFromOutside: Story = { tags: ["no-visual"], render: () => <Aimed /> };

function Playing() {
  const ref = React.useRef<HTMLVideoElement>(null);
  const media = useMediaElement(ref);
  return (
    <div className="grid max-w-3xl gap-2">
      <video ref={ref} src={panoVideo} loop muted playsInline className="hidden" crossOrigin="anonymous" />
      <PanoramaViewer label="360 video of the test room" video={ref} />
      <div className="flex items-center gap-3">
        <Transport playing={media.playing} onPlayPause={media.toggle} />
        <SeekBar time={media.time} duration={media.duration} onSeek={media.seek} label="Seek in the 360 video" />
        <TimeReadout time={media.time} duration={media.duration} />
      </div>
      <Button size="sm" variant="outline" onClick={() => media.seek(0)}>
        Back to the start
      </Button>
    </div>
  );
}

/** A video: the viewer reads the element the app owns, which `Transport` and `SeekBar` drive like any video; one texture upload per frame shown, none while it is off screen. Skipped by the visual suite. */
export const Video: Story = { tags: ["no-visual"], render: () => <Playing /> };
