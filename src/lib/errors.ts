// Errors, described for a person. Anything that fails in front of someone (a load in DataView, an
// action in AsyncButton) says what happened in a sentence, in the product's words, not the
// developer's: `HttpError`'s own message ("409 Conflict from /api/bookings") is for logs. Loads
// and actions share HttpError's status sentences, so the same failure reads the same everywhere,
// and differ only in what is true afterwards: a failed load changed nothing, while a failed action
// may have reached the server, so its sentence does not promise that.
//
// A server's own reason beats the status text (strata-react issue #42, from python-app-template).
// FastAPI and most JSON APIs say why a 4xx happened in the body (`{"detail": "the data folder must
// be an absolute path"}`), and a client that drops it has to repeat every server rule to show the
// person anything better than "Bad Request", which drifts and cannot cover rules only the server
// can check. So `fetchJson` reads an error response's body, `HttpError` keeps it with the reason
// and any per-field messages found in it, and the sentences below use the reason for a 4xx.
// Per-field messages (FastAPI's 422 `detail: [{loc, msg}]`) are keyed by field name, so
// `useAsyncAction`'s `fieldErrors` can put each under its `Field`, never in a toast. A 5xx body is
// not shown: it is usually a stack trace or a proxy's HTML page, and is kept on `body` for logs.

/** What `readErrorBody` finds in an error response: the server's sentence, and messages per field. */
export type ErrorBody = {
  /** Why the server refused, in its own words. */
  reason?: string;
  /** Messages for individual fields, keyed by field name (`"name"`, `"address.city"`). */
  fields?: Record<string, string>;
  /** The structured part of the body (`ErrorBody.payload` of the shared contract): what the app can act on, such as what is already running on a 409. Typed by the caller with `errorPayload`. */
  payload?: unknown;
};

/** Thrown by `fetchJson` on a non-2xx response; carries the status, the response body and the server's reason for `describeHttpError` and `describeActionError`. */
export class HttpError extends Error {
  /** The server's sentence for why it refused, from the body (`detail`, `message`, `error`), if it gave one. */
  readonly reason?: string;
  /** Messages for individual fields from the body (FastAPI's 422 `detail: [{loc, msg}]`), keyed by field name. Empty when there are none. */
  readonly fieldErrors: Readonly<Record<string, string>>;
  /** The body's `payload`, when it has one (`{ detail, payload }`): data for the app, not words for the person. Read it typed with `errorPayload`. */
  readonly payload?: unknown;

  constructor(
    readonly status: number,
    readonly statusText: string,
    readonly url: string,
    /** The response body: parsed JSON when it was JSON, else its text; undefined when empty. */
    readonly body?: unknown,
    found: ErrorBody = readErrorBody(body),
  ) {
    super(`${status} ${statusText} from ${url}`);
    this.name = "HttpError";
    this.reason = found.reason;
    this.fieldErrors = found.fields ?? {};
    this.payload = found.payload;
  }
}

const text = (value: unknown) => (typeof value === "string" && value.trim() ? value.trim() : undefined);

/** A field name from a FastAPI/pydantic `loc`: the path after where it came from (`["body", "address", "city"]` is `"address.city"`). */
function fieldName(loc: unknown) {
  if (!Array.isArray(loc)) return undefined;
  const path = loc.map(String);
  if (["body", "query", "path", "header", "cookie", "form"].includes(path[0]) && path.length > 1) path.shift();
  return path.join(".") || undefined;
}

/**
 * The default reading of an error body, for the shapes most JSON APIs use: `{ detail: "…" }`
 * (FastAPI), `{ message: "…" }`, `{ error: "…" }` or `{ error: { message: "…" } }` for the reason,
 * and FastAPI's validation list `{ detail: [{ loc, msg }] }` for per-field messages. A short
 * plain-text body (not HTML) is taken as the reason too. Pass your own to `fetchJson` for other APIs.
 */
export function readErrorBody(body: unknown): ErrorBody {
  if (typeof body === "string") {
    const t = text(body);
    return t && t.length <= 300 && !t.startsWith("<") ? { reason: t } : {};
  }
  if (!body || typeof body !== "object") return {};
  const b = body as Record<string, unknown>;
  const payload = b.payload !== undefined && b.payload !== null ? { payload: b.payload } : {};
  if (Array.isArray(b.detail)) {
    const fields: Record<string, string> = {};
    for (const item of b.detail as unknown[]) {
      const entry = item as { loc?: unknown; msg?: unknown } | null;
      const name = fieldName(entry?.loc);
      const msg = text(entry?.msg);
      if (name && msg && !fields[name]) fields[name] = msg;
    }
    return { fields, ...payload };
  }
  const nested = b.error && typeof b.error === "object" ? text((b.error as Record<string, unknown>).message) : undefined;
  return { reason: text(b.detail) ?? text(b.message) ?? text(b.error) ?? nested, ...payload };
}

/** Writes an error for a person: what happened, in a sentence. A product passes its own words. */
export type DescribeError = (error: unknown) => string;

/** A sentence ends once: "…absolute path" and "…absolute path." both end in one full stop. */
const sentence = (s: string) => (/[.!?…]$/.test(s) ? s : `${s}.`);

function refused(error: HttpError) {
  if (error.reason) return `The request was refused: ${sentence(error.reason)}`;
  if (Object.keys(error.fieldErrors).length) return "The request was refused: check the fields marked.";
  return `The request was refused (${error.status}): ${error.statusText || "no reason given"}.`;
}

/** The default `DescribeError` for loads: the HTTP status in a sentence (with the server's reason for a 4xx), else the error's message, else a plain fallback. */
export const describeHttpError: DescribeError = (error) =>
  error instanceof HttpError
    ? error.status >= 500
      ? `The server could not answer (${error.status}). Nothing was changed.`
      : refused(error)
    : error instanceof Error && error.message
      ? error.message
      : "The data could not be loaded. Nothing was changed.";

/** The default for `useAsyncAction`: the HTTP status in a sentence (with the server's reason for a 4xx), else the thrown Error's message, else undefined (the retry label alone). */
export const describeActionError = (error: unknown): string | undefined =>
  error instanceof HttpError
    ? error.status >= 500
      ? `The server could not answer (${error.status}).`
      : refused(error)
    : error instanceof Error && error.message
      ? error.message
      : undefined;

/** Messages for individual fields carried by what was thrown: an `HttpError`'s `fieldErrors`, else none. */
export function fieldErrorsOf(error: unknown): Readonly<Record<string, string>> {
  return error instanceof HttpError ? error.fieldErrors : {};
}

/** The payload of an error from the server as the type the app expects (`errorPayload<{ running: string }>(error)`), or `undefined` when it is not an `HttpError` or carries none. The type is the caller's claim: check it against the API's schema. */
export function errorPayload<T>(error: unknown): T | undefined {
  return error instanceof HttpError ? (error.payload as T | undefined) : undefined;
}
