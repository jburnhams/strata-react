// The default theme's own visual suite: examples/default-app (strata.css + theme.css and nothing
// else), a whole screen and a page of every control, light and dark, against its own baselines so
// the kiln fixture's 300-odd baselines do not move. Run with `npm run test:visual:default-theme`.
import { defineVisualConfig } from "./src/visual";
import { handlers } from "./stories/mocks/handlers";

export default defineVisualConfig({
  baselines: "tests/visual/baselines-default-theme",
  output: "tests/visual/output-default-theme",
  app: {
    dir: "examples/default-app/dist",
    base: "/default/",
    handlers,
    viewports: ["wide", "phone"],
    routes: [
      { name: "kiln-room", path: "/", states: { ready: [] } },
      { name: "controls", path: "/controls", states: { ready: [] } },
    ],
  },
});
