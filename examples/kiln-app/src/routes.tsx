// The kiln app's route tree, in its own module so the app (main.tsx) and its tests
// (tests/unit/testing.test.tsx, through renderRoutes) build their routers from the same objects.
// A test that hand-copied the tree would keep passing after the app's routes changed.
import type { RouteObject } from "react-router";
import { MediaPlayer } from "../../../src";
import fullscreenClip from "../../../stories/fixtures/video/fullscreen.webm?url";
import { KilnRoomScreen } from "../../../stories/screens/kiln-room";

/** The base path the app is served under: `base` in ../vite.config.ts, without its trailing slash. */
export const basename = "/kiln";

export const routes: RouteObject[] = [
  { path: "/fullscreen-player", element: <MediaPlayer kind="video" label="Kiln cam" src={fullscreenClip} controls="strata" /> },
  { path: "*", element: <KilnRoomScreen /> },
];
