// One vocabulary for failures, shared by reads and writes. A read that fails (DataView through
// `toLoad`) and a write that fails (an undoable removal's commit) are described for a person by
// the same `DescribeError`, so a product writes its error copy once and both paths use it.

/** Thrown by `fetchJson` for a non-2xx response; carries the status so the copy can say what happened. */
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

/** The default `DescribeError`: says whether the server failed or refused, and that nothing was changed. */
export const describeHttpError: DescribeError = (error) =>
  error instanceof HttpError
    ? error.status >= 500
      ? `The server could not answer (${error.status}). Nothing was changed.`
      : `The request was refused (${error.status}): ${error.statusText || "no reason given"}.`
    : error instanceof Error && error.message
      ? error.message
      : "The request did not complete. Nothing was changed.";
