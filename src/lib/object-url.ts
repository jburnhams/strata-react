import * as React from "react";

// Bytes as a URL (issue #367, from the Quake 2 explorer). `MediaPlayer src`, `Thumbnail src` and a
// download link take URLs, but a browser tool often holds the bytes: a WAV read out of an archive, a
// rendered PNG, a file the person dropped. Each app wrote the same effect, `createObjectURL` into
// state and a revoke on change and on unmount, with nothing rendered on the first pass, and each
// version that forgot the revoke leaked the whole file until the tab closed.
//
// The URL is made in an effect, never during render, so Strict Mode's rehearsal (mount, unmount,
// mount) revokes the first URL and makes a second, and no render ever leaves one behind. The first
// pass therefore returns `null`: say so in the screen (a `Thumbnail` skeleton, a disabled link).
// The URL is keyed on the data's identity and `type`, so a re-render with the same array or Blob
// keeps the same URL; pass a new value to get a new one. Memoise bytes you build in render.

/** Bytes (or a Blob) as an object URL: made once per value, revoked when the value changes or the component unmounts. `null` until made, and for `null` data. `type` is the MIME type for bytes ("audio/wav"); a Blob keeps its own unless `type` is given. */
export function useObjectUrl(data: Blob | BufferSource | null | undefined, type?: string): string | null {
  const [url, setUrl] = React.useState<string | null>(null);
  React.useEffect(() => {
    if (data === null || data === undefined) {
      setUrl(null);
      return;
    }
    const blob = data instanceof Blob && (type === undefined || data.type === type) ? data : new Blob([data as BlobPart], type ? { type } : undefined);
    const made = URL.createObjectURL(blob);
    setUrl(made);
    return () => {
      URL.revokeObjectURL(made);
      setUrl((now) => (now === made ? null : now));
    };
  }, [data, type]);
  return url;
}
