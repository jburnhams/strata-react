import * as React from "react";

// Bringing local files into an app (strata issue #75, from a video editor's library): pick or
// drop, then one outcome per file. This is the logic with no drawing, so a screen can render the
// outcomes however it likes (`FileOutcomes` is the default) and a test can feed it `File`s without
// a dialog.
//
// Why a hook of per-file outcomes and not one "upload" state: a drop of six files has six stories
// (two added, one still processing, one the wrong type, one too big, one the app could not read),
// and the person needs to hear about each by name, inline, without the screen being blocked
// (patterns.md §7: an error a person must act on is inline with its recovery, not a toast). The
// rest of the batch is never held up by one file: each runs on its own.
//
// Nothing here assumes a server. `process` is the app's own work on a file (parse a GPX, make a
// thumbnail, upload it); it may throw, and its message is shown as the reason, so write it in the
// product's words ("run-02.mp4 is not a video this browser can play. Convert it to MP4 (H.264)
// and add it again."). Without `process`, an accepted file counts as added at once.

export type FileOutcome =
  | { id: string; name: string; size: number; status: "processing" }
  | { id: string; name: string; size: number; status: "added" }
  | { id: string; name: string; size: number; status: "rejected"; reason: string }
  | { id: string; name: string; size: number; status: "failed"; reason: string };

export type FileIntakeOptions = {
  /** What is accepted, as the picker's `accept` list: extensions (`.gpx`), exact types (`audio/mpeg`) or families (`video/*`). */
  accept: readonly string[];
  /** The accepted kinds in words, used in the rejection reason and the drop hint: "a video, an audio file or a GPX track". */
  acceptLabel: string;
  /** More than one file at a time. Default true; with false, extra files in one drop are rejected by name. */
  multiple?: boolean;
  /** Largest size in bytes. Larger files are rejected with their size in the reason. */
  maxBytes?: number;
  /** Extra checks after the type check, for what a type cannot say. Return the reason in the product's words, or `null` to accept. */
  check?: (file: File) => string | null | Promise<string | null>;
  /** The app's own work on an accepted file. A throw marks it `failed` with the error's message and offers a retry. */
  process?: (file: File, context: { signal: AbortSignal }) => void | Promise<void>;
};

export type FileIntake = {
  /** One outcome per file offered, in the order offered, newest batch last. */
  outcomes: readonly FileOutcome[];
  /** Offers files (from the picker or a drop). Rejections appear as outcomes at once; accepted files are processed. */
  add: (files: Iterable<File> | ArrayLike<File>) => void;
  /** Runs `process` again for a failed file. */
  retry: (id: string) => void;
  /** Removes an outcome (and aborts its processing if still running). */
  dismiss: (id: string) => void;
  /** Removes every finished outcome (added, rejected and failed), leaving those still processing. */
  clear: () => void;
  /** Files still being processed. */
  pending: number;
};

/** Whether a file matches one entry of an `accept` list: extension, exact type or `family/*`, ignoring case. */
export function matchesAccept(file: { name: string; type: string }, accept: readonly string[]): boolean {
  const name = file.name.toLowerCase();
  const type = file.type.toLowerCase();
  return accept.some((entry) => {
    const a = entry.trim().toLowerCase();
    if (a.startsWith(".")) return name.endsWith(a);
    if (a.endsWith("/*")) return type.startsWith(a.slice(0, -1));
    return type === a;
  });
}

const MB = 1024 * 1024;
const sizeWords = (bytes: number) => (bytes >= MB ? `${(bytes / MB).toFixed(bytes >= 100 * MB ? 0 : 1)} MB` : `${Math.max(1, Math.round(bytes / 1024))} kB`);

/** Per-file outcomes for files picked or dropped: type and size checks with a named reason, the app's own `process` per file, retry and dismiss. */
export function useFileIntake(options: FileIntakeOptions): FileIntake {
  const [outcomes, setOutcomes] = React.useState<readonly FileOutcome[]>([]);
  const opts = React.useRef(options);
  opts.current = options;
  const files = React.useRef(new Map<string, File>());
  const controllers = React.useRef(new Map<string, AbortController>());
  const counter = React.useRef(0);
  const alive = React.useRef(true);

  const patch = React.useCallback((id: string, next: (o: FileOutcome) => FileOutcome) => {
    setOutcomes((all) => all.map((o) => (o.id === id ? next(o) : o)));
  }, []);

  const run = React.useCallback(
    (id: string, file: File) => {
      const controller = new AbortController();
      controllers.current.set(id, controller);
      const base = { id, name: file.name, size: file.size };
      patch(id, () => ({ ...base, status: "processing" }));
      Promise.resolve()
        .then(() => opts.current.process?.(file, { signal: controller.signal }))
        .then(
          () => !controller.signal.aborted && patch(id, () => ({ ...base, status: "added" })),
          (error: unknown) => {
            if (controller.signal.aborted) return;
            const reason = error instanceof Error && error.message ? error.message : `${file.name} could not be added. Try again.`;
            patch(id, () => ({ ...base, status: "failed", reason }));
          },
        )
        .finally(() => controllers.current.delete(id));
    },
    [patch],
  );

  // The app's own check, then its `process`. A check that throws (synchronously or not) fails the
  // file with a retry rather than accepting it unchecked or escaping `add`; nothing runs after the
  // screen is gone or the file was dismissed.
  const start = React.useCallback(
    (id: string, file: File) => {
      const base = { id, name: file.name, size: file.size };
      patch(id, () => ({ ...base, status: "processing" }));
      Promise.resolve()
        .then(() => opts.current.check?.(file))
        .then(
          (reason) => {
            if (!alive.current || !files.current.has(id)) return;
            if (reason) {
              files.current.delete(id);
              patch(id, () => ({ ...base, status: "rejected", reason }));
            } else run(id, file);
          },
          (error: unknown) => {
            if (!alive.current || !files.current.has(id)) return;
            const reason = error instanceof Error && error.message ? error.message : `${file.name} could not be checked. Try again.`;
            patch(id, () => ({ ...base, status: "failed", reason }));
          },
        );
    },
    [patch, run],
  );

  const add = React.useCallback(
    (offered: Iterable<File> | ArrayLike<File>) => {
      const list = Array.from(offered as ArrayLike<File>);
      const { accept, acceptLabel, multiple = true, maxBytes } = opts.current;
      list.forEach((file, index) => {
        const id = `f${++counter.current}`;
        const base = { id, name: file.name, size: file.size };
        const reject = (reason: string) => setOutcomes((all) => [...all, { ...base, status: "rejected", reason }]);
        if (!multiple && index > 0) return reject(`${file.name} was not added: this takes one file at a time.`);
        if (!matchesAccept(file, accept)) return reject(`${file.name} is not a type this accepts. Add ${acceptLabel}.`);
        if (maxBytes !== undefined && file.size > maxBytes) {
          return reject(`${file.name} is ${sizeWords(file.size)}, over the ${sizeWords(maxBytes)} limit.`);
        }
        files.current.set(id, file);
        setOutcomes((all) => [...all, { ...base, status: "processing" }]);
        start(id, file);
      });
    },
    [patch, start],
  );

  const dismiss = React.useCallback((id: string) => {
    controllers.current.get(id)?.abort();
    controllers.current.delete(id);
    files.current.delete(id);
    setOutcomes((all) => all.filter((o) => o.id !== id));
  }, []);

  const retry = React.useCallback(
    (id: string) => {
      const file = files.current.get(id);
      if (file) start(id, file);
    },
    [start],
  );

  const clear = React.useCallback(() => {
    setOutcomes((all) => {
      for (const o of all) if (o.status !== "processing") files.current.delete(o.id);
      return all.filter((o) => o.status === "processing");
    });
  }, []);

  React.useEffect(() => {
    alive.current = true;
    const live = controllers.current;
    return () => {
      alive.current = false;
      for (const c of live.values()) c.abort();
      live.clear();
    };
  }, []);

  const pending = outcomes.filter((o) => o.status === "processing").length;
  return React.useMemo(() => ({ outcomes, add, retry, dismiss, clear, pending }), [outcomes, add, retry, dismiss, clear, pending]);
}
