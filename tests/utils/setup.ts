import "@testing-library/jest-dom/vitest";
import { afterAll, afterEach, beforeAll } from "vitest";
import { cleanup } from "@testing-library/react";
import { server } from "./server";
import { installLayoutShims } from "../../src/testing";

// jsdom does no layout and has no ResizeObserver; the same shims an app's suite would install
// (strata-react/testing). Real layout is checked by the visual suite in Chromium, not here.
installLayoutShims();

beforeAll(() => server.listen({ onUnhandledFrame: "error" }));
afterEach(() => {
  cleanup();
  server.resetHandlers();
});
afterAll(async () => {
  server.close();
  // React Aria's live announcer, when asked to speak while no `act` is open (a `waitFor`), delays
  // the message by 100ms with a timer. A file that ends inside that window lets it fire after
  // jsdom is torn down ("document is not defined", an uncaught error that fails the whole run, seen
  // once in the release job). Let the timer run out first.
  await new Promise((resolve) => setTimeout(resolve, 150));
});
