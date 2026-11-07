// strata-react's own visual suite, written the way an app writes its own (strata-react/visual).
// Two targets: every story of the built Storybook, and the kiln-room example app's one screen in
// each server state, served from its production build. The app has no stories and is not told
// it is being tested; MSW handlers (the same ones the unit tests and stories use) answer its
// requests in Node. Run with `npm run test:visual`.
import { defineVisualConfig } from "./src/visual";
import { bookingsEmpty, bookingsLoading, bookingsServerError, handlers } from "./stories/mocks/handlers";

export default defineVisualConfig({
  storybook: "storybook-static",
  app: {
    dir: "examples/kiln-app/dist",
    base: "/kiln/",
    handlers,
    viewports: ["wide", "phone"],
    routes: [
      {
        name: "kiln-room",
        path: "/",
        states: {
          ready: [],
          loading: [bookingsLoading],
          empty: [bookingsEmpty],
          // The app's query client retries once, so the alert comes a second after the first 503.
          error: { handlers: [bookingsServerError], waitFor: "role=alert" },
          // Sort lives in the URL, so a sorted table is a path, not an interaction.
          sorted: { path: "/?sort=pieces.desc" },
          // A reversible removal shows the undo bar; the click is the only way to reach it.
          withdrawn: {
            setup: async (page) => {
              await page.getByRole("button", { name: "Withdraw" }).first().click();
              await page.getByRole("button", { name: "Undo" }).waitFor();
            },
          },
        },
      },
    ],
  },
});
