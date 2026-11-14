// Development-only checks (a warning for a mistake a type cannot catch). `import.meta.env.DEV` is
// replaced by the library build itself, so in the published package it is always false and the check
// never runs in an app's development. `process.env.NODE_ENV` is left for the app's bundler to replace
// (Vite, webpack and the rest do, in dependencies too), so the app decides. Where nothing replaces it
// `process` does not exist, and the check is off.

/** Whether the app is running in development, decided by the app's bundler. */
export function isDev(): boolean {
  try {
    return process.env.NODE_ENV !== "production";
  } catch {
    return false;
  }
}
