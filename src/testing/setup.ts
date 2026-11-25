import { cleanup } from "@testing-library/react";
import { toast } from "../components/toast";
import { forgetLoadedThumbnails } from "../components/thumbnail";
import { installLayoutShims, type LayoutBox } from "./layout";

// What every Strata app's test setup file repeats (issue #363, from the Quake 2 explorer's suite):
// unmount what each test rendered, give jsdom a layout, and forget module state between tests.
// With Vitest's `globals` off (its default) Testing Library does not register its own
// `afterEach(cleanup)`, so each `renderRoutes` stacked on the last (a second test found four
// `treegrid`s with the same name). Strata's own `tests/utils/setup.ts` calls `cleanup()` itself,
// which hid it from us.
//
// It takes the runner's `afterEach` rather than importing `vitest`: the runner is the app's, and
// naming it here would make it a dependency of the package (the stack decision is Jonathan's).
// MSW and jest-dom stay the app's, in the lines around this call.

/** The options of `setupStrataTests`. */
export type StrataTestSetup = {
  /** The runner's `afterEach` (`import { afterEach } from "vitest"`). */
  afterEach: (hook: () => void | Promise<void>) => void;
  /** The box every element reports (`installLayoutShims`); `false` to skip the shims. */
  layout?: Partial<LayoutBox> | false;
};

/**
 * One call in a Vitest setup file: installs the layout shims (a no-op without a DOM), and after each
 * test unmounts what it rendered, clears the toast queue and forgets loaded thumbnails. Returns a
 * function that puts the layout back. Add jest-dom and MSW's `server` lifecycle beside it.
 */
export function setupStrataTests({ afterEach, layout = {} }: StrataTestSetup): () => void {
  const restore = layout === false ? () => {} : installLayoutShims(layout);
  afterEach(() => {
    cleanup(); // a no-op where nothing was rendered, so node-environment files can share the setup
    toast.clear();
    forgetLoadedThumbnails();
  });
  return restore;
}
