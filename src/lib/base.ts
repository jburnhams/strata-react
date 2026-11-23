// Behind a reverse proxy an app lives at /<prefix>/, not /. strata-python's `web.add_web` serves every
// page with a relative <base href> back to the server's root, and the app is built with `base: './'`,
// so the page's own base URL says where the app is mounted. Every app repeated the same two lines to
// read it (flashtap `web/src/api.ts`, strata-react issue #295); here they are once, safe where there
// is no document (SSR, a node test).
//
// Only a <base> element counts. Without one the page is at the origin's root by construction, and
// deriving a prefix from the current path would turn "/reports/42" into a base of "/reports".

/**
 * Where the app is mounted: the path of the page's `<base href>` without its trailing slash, `""` at the root or where there is no base (SSR, a plain page).
 * Give it to React Router as `createBrowserRouter(routes, { basename: appBase() || "/" })`.
 */
export function appBase(doc: Document | undefined = typeof document === "undefined" ? undefined : document): string {
  if (!doc?.querySelector("base[href]")) return "";
  return new URL(".", doc.baseURI).pathname.replace(/\/$/, "");
}

/**
 * Puts the app's base in front of a root-relative path (`/api/learners` becomes `/proxy/api/learners` behind a proxy).
 * Anything else (a relative path, a full URL, a protocol-relative `//host`) is returned as it is. Use it for every `fetch`, `<img src>` and download link the app builds; in-app links are router paths and need none.
 */
export function withBase(path: string, base: string = appBase()): string {
  return path.startsWith("/") && !path.startsWith("//") ? base + path : path;
}
