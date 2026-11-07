import { setupServer } from "msw/node";
import { handlers } from "../../stories/mocks/handlers";

// One MSW server for the unit suite, started in setup.ts. It serves the same handlers the
// Storybook stories use, so a story and its test see the same API. A test overrides a route with
// server.use(...) and the override is reset after each test.
export const server = setupServer(...handlers);
