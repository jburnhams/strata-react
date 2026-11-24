import { appBase, withBase } from "../lib/base";
import { fetchJson, type FetchJsonInit, type FetchJsonOptions } from "./index";

// The app's one door to its server. Every Strata app wrote the same three things around `fetchJson`: the
// base prefix a reverse proxy adds (#295), a helper that builds a JSON `RequestInit` (#296), and a
// table of endpoint paths. `createApi` is the first two; paths stay the app's own constants (or, from
// `strata-api-types`, the generated `paths`). It adds nothing to what `fetchJson` does (errors are still
// `HttpError` with the server's reason), so `useLoad`'s `queryFn` and a write's `commit` use it alike.
// A typed client over the generated `paths` is the next step, not part of this.

/** Options for `createApi`. */
export type ApiOptions = FetchJsonOptions & {
  /** The mount path put before a root-relative path. Default the page's own (`appBase()`), read when each request is made. */
  base?: string;
};

type Init = Omit<FetchJsonInit, "method" | "json" | "body">;

// A body that is already bytes (a recording, a file) goes as it is: `JSON.stringify` of a Blob is `{}`, and
// `fetch` sets the Content-Type of a Blob from its own `type` (issue #318: Flashtap's `audio/wav` upload).
const isRaw = (body: unknown): body is Blob | BufferSource | FormData | URLSearchParams | ReadableStream =>
  (typeof Blob !== "undefined" && body instanceof Blob) ||
  body instanceof ArrayBuffer ||
  ArrayBuffer.isView(body) ||
  (typeof FormData !== "undefined" && body instanceof FormData) ||
  body instanceof URLSearchParams ||
  (typeof ReadableStream !== "undefined" && body instanceof ReadableStream);

/** The methods `createApi` returns: each applies the base and answers `fetchJson`'s `T`. */
export type Api = {
  /** The path with the app's base: for an `<img src>`, a download link or an `EventSource`. */
  url(path: string): string;
  get<T>(path: string, init?: Init): Promise<T>;
  post<T>(path: string, body?: unknown, init?: Init): Promise<T>;
  put<T>(path: string, body?: unknown, init?: Init): Promise<T>;
  patch<T>(path: string, body?: unknown, init?: Init): Promise<T>;
  delete<T = void>(path: string, init?: Init): Promise<T>;
};

/**
 * A small client over `fetchJson` for the app's own server: root-relative paths get the app's base (so it works behind a reverse proxy),
 * and `post`, `put` and `patch` send their body as JSON (a `Blob`, bytes, `FormData` or a stream is sent as it is, with the Blob's own type). `api.post<Learner>("/api/learners", { nickname })`.
 */
export function createApi({ base, ...options }: ApiOptions = {}): Api {
  const url = (path: string) => withBase(path, base ?? appBase());
  const send = <T>(method: string, path: string, body: unknown, init?: Init) =>
    fetchJson<T>(url(path), { ...init, method, ...(body === undefined ? {} : isRaw(body) ? { body } : { json: body }) }, options);
  return {
    url,
    get: (path, init) => send("GET", path, undefined, init),
    post: (path, body, init) => send("POST", path, body, init),
    put: (path, body, init) => send("PUT", path, body, init),
    patch: (path, body, init) => send("PATCH", path, body, init),
    delete: (path, init) => send("DELETE", path, undefined, init),
  };
}
