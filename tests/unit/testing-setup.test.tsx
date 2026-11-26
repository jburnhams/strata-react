// @vitest-environment node
import { describe, expect, it, vi } from "vite-plus/test";
import { installLayoutShims, setupStrataTests } from "../../src/testing";

// Issue #363: a setup file shared by jsdom tests and node-environment tests must not throw where there
// is no DOM, and `setupStrataTests` registers the cleanup an app with Vitest's `globals` off lacks.

describe("without a DOM", () => {
  it("installLayoutShims does nothing and returns a function that does nothing", () => {
    expect(typeof Element).toBe("undefined");
    const restore = installLayoutShims();
    expect(() => restore()).not.toThrow();
  });

  it("setupStrataTests registers one afterEach hook, whose cleanup is safe with nothing rendered", async () => {
    const hooks: Array<() => void | Promise<void>> = [];
    const restore = setupStrataTests({ afterEach: (h) => void hooks.push(h) });
    expect(hooks).toHaveLength(1);
    await expect(Promise.resolve(hooks[0]!())).resolves.toBeUndefined();
    expect(() => restore()).not.toThrow();
  });

  it("layout: false skips the shims", () => {
    const afterEach = vi.fn();
    const restore = setupStrataTests({ afterEach, layout: false });
    expect(afterEach).toHaveBeenCalledOnce();
    restore();
  });
});
