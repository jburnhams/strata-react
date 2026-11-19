// The kiln app's route tree, in its own module so the app (main.tsx) and its tests
// (tests/unit/testing.test.tsx, through renderRoutes) build their routers from the same objects.
// A test that hand-copied the tree would keep passing after the app's routes changed.
import type { RouteObject } from "react-router";
import { useRef } from "react";
import { MediaPlayer, usePlayerWarnings, type SpanKind } from "../../../src";
import fullscreenClip from "../../../stories/fixtures/video/fullscreen.webm?url";
import { KilnRoomScreen } from "../../../stories/screens/kiln-room";

/** The base path the app is served under: `base` in ../vite.config.ts, without its trailing slash. */
export const basename = "/kiln";

const fullscreenSpanKinds = { intro: { label: "Intro", behaviour: "ask" } } satisfies Record<string, SpanKind>;

function FullscreenPlayer() {
  const { warning, warn } = usePlayerWarnings();
  const warned = useRef(false);
  return (
    <MediaPlayer
      kind="video"
      label="Kiln cam"
      src={fullscreenClip}
      controls="strata"
      spans={[{ start: 1, end: 11, kind: "intro" }]}
      spanKinds={fullscreenSpanKinds}
      status={<p role="status" className="type-body-sm">Playback details are loading</p>}
      warning={warning}
      onTimeChange={(time) => {
        if (time < 4 || warned.current) return;
        warned.current = true;
        warn({ title: "Playback details unavailable", timeout: 1000 });
      }}
    />
  );
}

export const routes: RouteObject[] = [
  { path: "/fullscreen-player", element: <FullscreenPlayer /> },
  { path: "*", element: <KilnRoomScreen /> },
];
