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
afterAll(() => server.close());
