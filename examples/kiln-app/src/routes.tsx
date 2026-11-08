// The kiln app's route tree, in its own module so the app (main.tsx) and its tests
// (tests/unit/testing.test.tsx, through renderRoutes) build their routers from the same objects.
// A test that hand-copied the tree would keep passing after the app's routes changed.
import type { RouteObject } from "react-router";
import { KilnRoomScreen } from "../../../stories/screens/kiln-room";

/** The base path the app is served under: `base` in ../vite.config.ts, without its trailing slash. */
export const basename = "/kiln";

export const routes: RouteObject[] = [{ path: "*", element: <KilnRoomScreen /> }];
