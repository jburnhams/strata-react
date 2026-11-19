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
        name: "fullscreen-player",
        path: "/fullscreen-player",
        viewports: ["default"],
        setup: async (page) => {
          await page.getByRole("button", { name: "Full screen", exact: true }).click();
          await page.waitForFunction(() => document.fullscreenElement !== null);
        },
        states: {
          paused: [],
          idle: {
            setup: async (page) => {
              await page.getByRole("button", { name: "Play", exact: true }).click();
              const exit = await page.getByRole("button", { name: "Leave full screen" }).elementHandle();
              const waitForControls = (visible: boolean) =>
                page.waitForFunction(({ exit, visible }) => exit.checkVisibility({ opacityProperty: true }) === visible, { exit, visible });

              const video = page.locator("video");
              const visibleBounds = await video.boundingBox();
              const playerBounds = await page.getByRole("group", { name: "Kiln cam", exact: true }).boundingBox();
              if (!visibleBounds || !playerBounds) throw new Error("Could not measure the fullscreen player");

              const status = await page.getByText("Playback details are loading").elementHandle();
              await waitForControls(false);
              if (await status.evaluate((node) => node.checkVisibility({ opacityProperty: true }))) {
                throw new Error("The player status should hide with the controls");
              }
              const skip = await page.getByRole("button", { name: "Skip intro" }).elementHandle();
              if (!(await skip.evaluate((node) => node.checkVisibility({ opacityProperty: true })))) {
                throw new Error("A timed Skip action should stay visible while the controls are hidden");
              }
              const idleBounds = await video.boundingBox();
              if (!idleBounds || idleBounds.height <= visibleBounds.height || Math.abs(idleBounds.y + idleBounds.height - playerBounds.y - playerBounds.height) > 1) {
                throw new Error(`Idle video should fill the player vertically: visible height ${visibleBounds.height}, idle height ${idleBounds?.height}, player height ${playerBounds.height}`);
              }

              const warning = page.getByText("Playback details unavailable");
              await warning.waitFor({ state: "visible" });
              await waitForControls(false);
              await warning.waitFor({ state: "detached" });

              await page.mouse.move(200, 120);
              await waitForControls(true);
              if (!(await status.evaluate((node) => node.checkVisibility({ opacityProperty: true })))) {
                throw new Error("The player status should reappear with the controls");
              }
              const restoredBounds = await video.boundingBox();
              if (!restoredBounds || Math.abs(restoredBounds.height - visibleBounds.height) > 1) {
                throw new Error("The control bar should reclaim its space when the mouse moves");
              }
              await waitForControls(false);
            },
          },
        },
      },
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
