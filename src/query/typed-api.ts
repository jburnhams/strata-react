import { createApi, type ApiOptions } from "./api";

// A client typed by the server's own schema: `createTypedApi<paths>()` with the `paths` that
// `strata-api-types` writes, so the path, its `{params}`, the query, the JSON body and the answer are
// all checked against the Python side and the hand-kept endpoint table goes away (issue #296's last
// ask). Types only on top of `createApi`: no `openapi-fetch`, no new dependency (Jonathan, 2026-11-14:
// `fetchJson` and TanStack Query stay the client). Only JSON answers are typed, and a JSON body; a body in another media type is sent as it is (`body`); a 204 answers `void`.
// The shapes read are openapi-typescript's: `paths[path][method]` with `parameters.path|query`,
// `requestBody.content["application/json"]` and `responses[2xx].content["application/json"]`.

type Method = "get" | "post" | "put" | "patch" | "delete";
type Json = "application/json";

type PathsWith<P, M extends Method> = { [K in keyof P]: P[K] extends { [m in M]: object } ? K : never }[keyof P] &
  string;
type Operation<P, K extends keyof P, M extends Method> = P[K] extends { [m in M]: infer O } ? O : never;

type Params<O, Where extends "path" | "query"> = O extends { parameters: { [w in Where]?: infer V } }
  ? Exclude<V, undefined | never>
  : never;
// `requestBody?: never` (an operation with no body) must not match the pattern below: an optional
// `never` property matches `{ requestBody?: {…} }` and infers `unknown`, which asked for a `json` the
// server does not take (issue #305). So the body is read from `NonNullable<…>`, and `never` stays `never`.
type Body<O> = O extends { requestBody?: infer R }
  ? [NonNullable<R>] extends [never]
    ? never
    : NonNullable<R> extends { content: { [j in Json]: infer B } }
      ? B
      : never
  : never;
// A body in another media type (`audio/wav`, `application/octet-stream`): sent as it is, so the call takes `body`
// (a Blob, whose `type` becomes the Content-Type, or bytes) instead of `json` (issue #318). Not typed beyond that:
// openapi-typescript writes a binary schema as `string`, which is no help to the caller. JSON wins where both are offered.
type RawBody<O> = O extends { requestBody?: infer R }
  ? [NonNullable<R>] extends [never]
    ? never
    : NonNullable<R> extends { content: infer C }
      ? [Exclude<keyof C, Json>] extends [never]
        ? never
        : Blob | BufferSource
      : never
  : never;
type Answer<O> = O extends { responses: infer R }
  ? R extends { 200: { content: { [j in Json]: infer T } } }
    ? T
    : R extends { 201: { content: { [j in Json]: infer T } } }
      ? T
      : R extends { 202: { content: { [j in Json]: infer T } } }
        ? T
        : void
  : void;

type HasKeys<T> = [T] extends [never] ? false : [keyof T] extends [never] ? false : true;
type RequiredKeys<T> = { [K in keyof T]-?: object extends Pick<T, K> ? never : K }[keyof T];
/** `{ path, query }`, each present only where the operation has them, and required only where one of its values is. */
type Request<O> = (HasKeys<Params<O, "path">> extends true ? { path: Params<O, "path"> } : { path?: undefined }) &
  (HasKeys<Params<O, "query">> extends true
    ? RequiredKeys<Params<O, "query">> extends never
      ? { query?: Params<O, "query"> }
      : { query: Params<O, "query"> }
    : { query?: undefined }) &
  Omit<RequestInit, "method" | "body">;

// The request argument may be left out only when nothing in it is required: an operation with a
// required `path` or `query` value needs the argument, with or without a body (a call that omitted it
// type-checked and then threw in `fill`).
type Optional<O> = [RequiredKeys<Request<O>>] extends [never] ? [request?: Request<O>] : [request: Request<O>];
type Args<O, WithBody extends boolean> = WithBody extends true
  ? [Body<O>] extends [never]
    ? [RawBody<O>] extends [never]
      ? Optional<O>
      : [request: Request<O> & { body: RawBody<O> }]
    : [request: Request<O> & { json: Body<O> }]
  : Optional<O>;

/** A client whose paths, parameters, JSON bodies and answers come from `strata-api-types`' `paths`. */
export type TypedApi<P> = {
  /** The path with the app's base: for an `<img src>`, a download link or an `EventSource`. */
  url(path: string): string;
} & {
  [M in Method]: <K extends PathsWith<P, M>>(
    path: K,
    ...args: Args<Operation<P, K, M>, M extends "get" | "delete" ? false : true>
  ) => Promise<Answer<Operation<P, K, M>>>;
};

function fill(
  path: string,
  values: Record<string, unknown> | undefined,
  query: Record<string, unknown> | undefined,
): string {
  const filled = path.replace(/\{([^}]+)\}/g, (_, name: string) => {
    const value = values?.[name];
    if (value === undefined || value === null)
      throw new Error(`strata-react: the path ${path} needs "${name}" in \`path\``);
    return encodeURIComponent(String(value));
  });
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(query ?? {})) {
    for (const item of Array.isArray(value) ? value : [value])
      if (item !== undefined && item !== null) search.append(key, String(item));
  }
  const text = search.toString();
  return text ? `${filled}${filled.includes("?") ? "&" : "?"}${text}` : filled;
}

/**
 * `createApi` typed by the server's schema: `const api = createTypedApi<paths>()`, then `api.post("/api/learners", { json: { nickname } })` and
 * `api.get("/api/learners/{id}", { path: { id } })`; the path, `path` and `query` values, `json` and the answer are checked, and `{id}` is filled and escaped.
 */
export function createTypedApi<P>(options: ApiOptions = {}): TypedApi<P> {
  const api = createApi(options);
  const call = (method: Method) => (path: string, request?: Record<string, unknown>) => {
    const {
      path: values,
      query,
      json,
      body,
      ...init
    } = (request ?? {}) as {
      path?: Record<string, unknown>;
      query?: Record<string, unknown>;
      json?: unknown;
      body?: unknown;
    } & Record<string, unknown>;
    const target = fill(path, values, query);
    const rest = init as Parameters<typeof api.get>[1];
    return method === "get"
      ? api.get(target, rest)
      : method === "delete"
        ? api.delete(target, rest)
        : api[method](target, body ?? json, rest);
  };
  return {
    url: api.url,
    get: call("get"),
    post: call("post"),
    put: call("put"),
    patch: call("patch"),
    delete: call("delete"),
  } as TypedApi<P>;
}
