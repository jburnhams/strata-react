// Node 25 and later define a global `localStorage` that is undefined unless Node runs with
// `--localstorage-file`, and it shadows jsdom's. In a Vitest jsdom project on Node 26 (Strata's floor)
// `localStorage.getItem` then throws, so any app code that reads storage (a remembered choice, a
// `ColorSchemeChoice` on a settings screen tested with storage on) fails in its tests. Strata's own
// tests never hit it because `renderWithStrata` turns theme storage off. Every app would have copied
// the same dozen lines (issue #298), so `installLayoutShims` installs this when, and only when, the
// platform's storage is unusable; where it works nothing is replaced.

/** An in-memory `Storage`, with the platform's behaviour (values are strings, `key` and `length` work). */
export function memoryStorage(): Storage {
  const data = new Map<string, string>();
  return {
    get length() {
      return data.size;
    },
    clear: () => data.clear(),
    getItem: (key) => data.get(String(key)) ?? null,
    key: (index) => [...data.keys()][index] ?? null,
    removeItem: (key) => void data.delete(String(key)),
    setItem: (key, value) => void data.set(String(key), String(value)),
  };
}

function usable(name: "localStorage" | "sessionStorage"): boolean {
  try {
    return typeof (globalThis as unknown as Record<string, Storage | undefined>)[name]?.getItem === "function";
  } catch {
    return false;
  }
}

/**
 * Replaces `localStorage` and `sessionStorage` with in-memory ones where the runtime's are missing or throw (Node 25+ under jsdom), and empties them after each test when the test runner has a global `afterEach`.
 * Does nothing where storage works. Returns a function that puts the originals back. Called by `installLayoutShims`.
 */
export function installStorageShim(): () => void {
  const restore: (() => void)[] = [];
  for (const name of ["localStorage", "sessionStorage"] as const) {
    if (usable(name)) continue;
    const storage = memoryStorage();
    const targets = [globalThis, typeof window !== "undefined" ? window : undefined].filter(
      (t): t is typeof globalThis => t !== undefined,
    );
    for (const target of new Set(targets)) {
      const before = Object.getOwnPropertyDescriptor(target, name);
      Object.defineProperty(target, name, { configurable: true, value: storage });
      restore.push(() => {
        if (before) Object.defineProperty(target, name, before);
        else delete (target as unknown as Record<string, unknown>)[name];
      });
    }
    const after = (globalThis as { afterEach?: (fn: () => void) => void }).afterEach;
    if (typeof after === "function") after(() => storage.clear());
  }
  return () => {
    for (const undo of restore.reverse()) undo();
  };
}
