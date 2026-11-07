// Errors, described for a person. Anything that fails in front of someone (a load in DataView, an
// action in AsyncButton) says what happened in a sentence, in the product's words, not the
// developer's: `HttpError`'s own message ("409 Conflict from /api/bookings") is for logs. Loads
// and actions share HttpError's status sentences, so the same failure reads the same everywhere,
// and differ only in what is true afterwards: a failed load changed nothing, while a failed action
// may have reached the server, so its sentence does not promise that.

/** Thrown by `fetchJson` on a non-2xx response; carries the status for `describeHttpError` and `describeActionError`. */
export class HttpError extends Error {
  constructor(
    readonly status: number,
    readonly statusText: string,
    readonly url: string,
  ) {
    super(`${status} ${statusText} from ${url}`);
    this.name = "HttpError";
  }
}

/** Writes an error for a person: what happened, in a sentence. A product passes its own words. */
export type DescribeError = (error: unknown) => string;

function refused(error: HttpError) {
  return `The request was refused (${error.status}): ${error.statusText || "no reason given"}.`;
}

/** The default `DescribeError` for loads: the HTTP status in a sentence, else the error's message, else a plain fallback. */
export const describeHttpError: DescribeError = (error) =>
  error instanceof HttpError
    ? error.status >= 500
      ? `The server could not answer (${error.status}). Nothing was changed.`
      : refused(error)
    : error instanceof Error && error.message
      ? error.message
      : "The data could not be loaded. Nothing was changed.";

/** The default for `useAsyncAction`: the HTTP status in a sentence, else the thrown Error's message, else undefined (the retry label alone). */
export const describeActionError = (error: unknown): string | undefined =>
  error instanceof HttpError
    ? error.status >= 500
      ? `The server could not answer (${error.status}).`
      : refused(error)
    : error instanceof Error && error.message
      ? error.message
      : undefined;
