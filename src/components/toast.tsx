import * as React from "react";
import { UNSTABLE_Toast as AriaToast, UNSTABLE_ToastContent as ToastContent, UNSTABLE_ToastQueue as ToastQueue, UNSTABLE_ToastRegion as ToastRegion, Button as AriaButton, Text } from "react-aria-components";
import { CircleCheck, Info, TriangleAlert, X } from "lucide-react";
import { Button } from "./button";
import { cn } from "../lib/utils";
import { overlaySurface } from "../lib/overlay";
import { isDev } from "../lib/dev";

// A toast confirms background work that finished ("Export finished", "3 pieces synced"). It is a
// polite live region; it never carries an error a person must act on, which goes inline as an
// `Alert` with its recovery (components.md §3.13, patterns.md §7), so there is no danger tone:
// the type refuses it. `warning` is for a fact worth a glance ("Kiln 2 is 40 min behind").
//
// Rules the component owns so an app does not have to:
// - One region, once, at the app root (`ToastRegion`), on the `layer-bar` layer: bottom end of the
//   window on a wide screen, the top on a phone, so it does not sit on the undo bar or cover the
//   focused control. It is a labelled landmark the keyboard reaches with F6 (React Aria).
// - It stays long enough to read: 5 s plus 40 ms a character, up to 15 s, at least 8 s with an
//   action. The timer pauses while the pointer or focus is on it. There is always a dismiss control.
// - At most one action, a button ("Open file"); content is words, not a form.
// - Announcements are React Aria's: the toast's text is read when it appears and not again.
// - The queue is module-level, so `toast.show()` works from a mutation's `onSuccess` outside any
//   component; `toast.clear()` empties it for a test. React Aria marks its toast API unstable; it
//   is used only here, behind this small surface, so a change upstream stays in this file.
// - One region at a time, enforced (issue #230): the first mounted owns the queue and a second one draws nothing and
//   says so in development, naming the fix. Two regions on one queue show every toast twice, which looks like a bug in
//   the toast and (in a test) fails `findByText` with "Found multiple elements"; the usual cause is a route tree that
//   draws the region in its root layout while a test helper draws one too (`renderRoutes(..., { toasts: false })`),
//   or an app with a region in a layout and another in a page. Ownership is held by a mounted-order list, not by the
//   queue, so unmounting the owner hands it to the next region.
// Toasts are rare and brief, so they get the overlay entrance and nothing else (character.md §3).

/** What a toast says. */
export type ToastContentProps = {
  /** What finished, past tense, in the product's words: "Export finished". */
  title: string;
  /** One more sentence: what and where ("run.mp4, 2:31 at 1080p, in your Downloads folder."). */
  description?: string;
  /** `info` by default. There is no danger tone: an error the person must act on is an `Alert`. */
  tone?: "info" | "success" | "warning";
  /** One action beside the words. */
  action?: { label: string; onPress: () => void };
  /** Milliseconds before it goes. Defaults to enough to read the words. */
  timeout?: number;
};

const queue = new ToastQueue<ToastContentProps>({ maxVisibleToasts: 3 });

/** Milliseconds a toast stays: 5 s plus 40 ms a character, to at most 15 s, and at least 8 s with an action. */
export function toastTimeout(content: Pick<ToastContentProps, "title" | "description" | "action" | "timeout">): number {
  if (content.timeout !== undefined) return content.timeout;
  const chars = content.title.length + (content.description?.length ?? 0) + (content.action?.label.length ?? 0);
  return Math.max(content.action ? 8000 : 0, Math.min(15000, 5000 + 40 * chars));
}

/** The toast queue: `toast.show({ title })` from anywhere; `toast.close(key)`; `toast.clear()`. */
export const toast = {
  /** Shows a toast and returns its key. */
  show(content: ToastContentProps): string {
    // Nothing appears without a region, and nothing says so: in development the first such call does (issue #249).
    if (mounted.length === 0 && !warnedNoRegion && isDev()) {
      warnedNoRegion = true;
      console.warn("strata-react: toast.show() was called but no StrataToastRegion is mounted, so nothing will appear. Render <StrataToastRegion /> once at the app root.");
    }
    return queue.add(content, { timeout: toastTimeout(content) });
  },
  close(key: string) {
    queue.close(key);
  },
  clear() {
    queue.clear();
  },
};

const marks = { info: { icon: Info, color: "text-info" }, success: { icon: CircleCheck, color: "text-success" }, warning: { icon: TriangleAlert, color: "text-warning" } } as const;

/** Props for `ToastRegion`. */
export type StrataToastRegionProps = {
  /** Names the landmark. Default "Notifications". */
  label?: string;
  className?: string;
};

// The regions mounted now, oldest first: the first draws, the rest stay empty.
const mounted: string[] = [];
let warnedNoRegion = false;
/** For tests: forget that the missing-region warning was given. */
export function resetToastWarnings() {
  warnedNoRegion = false;
}
const watchers = new Set<() => void>();
const changed = () => watchers.forEach((w) => w());
const watch = (w: () => void) => {
  watchers.add(w);
  return () => void watchers.delete(w);
};

/** True while this region is the one that draws. The server and the first client render say yes, so hydration matches. */
function useOwnsQueue(): boolean {
  const id = React.useId();
  React.useLayoutEffect(() => {
    mounted.push(id);
    changed();
    return () => {
      mounted.splice(mounted.indexOf(id), 1);
      changed();
    };
  }, [id]);
  const owns = React.useSyncExternalStore(watch, () => mounted[0] === id, () => true);
  const [warned, setWarned] = React.useState(false);
  React.useEffect(() => {
    if (owns || warned || mounted.indexOf(id) < 1) return;
    setWarned(true);
    if (isDev()) {
      console.warn("strata-react: a StrataToastRegion is already mounted, so this one draws nothing. Render it once at the app root; in a test of a route tree that draws its own, pass `toasts: false` to renderRoutes.");
    }
  }, [owns, warned, id]);
  return owns;
}

/** The one place toasts appear. Render it once at the app root; a second one mounted at the same time draws nothing and warns in development. A labelled landmark (F6), polite, above panes and the undo bar. */
export function StrataToastRegion({ label = "Notifications", className }: StrataToastRegionProps) {
  const owns = useOwnsQueue();
  if (!owns) return null;
  return (
    <ToastRegion
      queue={queue}
      aria-label={label}
      className={cn("layer-bar fixed inset-x-4 top-4 grid justify-items-end gap-2 outline-none sm:inset-x-auto sm:top-auto sm:right-4 sm:bottom-4", className)}
    >
      {({ toast: t }) => (
        <AriaToast
          toast={t}
          className={cn("flex w-full max-w-sm items-start gap-3 p-3 outline-none focus-visible:outline-2 focus-visible:outline-ring", overlaySurface)}
        >
          {(() => {
            const { icon: Icon, color } = marks[t.content.tone ?? "info"];
            return <Icon aria-hidden className={cn("mt-0.5 size-4 shrink-0", color)} />;
          })()}
          <ToastContent className="grid min-w-0 flex-1 gap-0.5">
            <Text slot="title" className="type-label">
              {t.content.title}
            </Text>
            {t.content.description && <Text slot="description" className="type-body-sm text-muted-foreground">{t.content.description}</Text>}
          </ToastContent>
          {t.content.action && (
            <Button size="sm" onPress={() => { t.content.action?.onPress(); queue.close(t.key); }}>
              {t.content.action.label}
            </Button>
          )}
          <AriaButton slot="close" aria-label="Dismiss" className="grid size-6 shrink-0 cursor-pointer place-items-center rounded-control text-muted-foreground transition-state hover:bg-muted hover:text-foreground">
            <X aria-hidden className="size-4" />
          </AriaButton>
        </AriaToast>
      )}
    </ToastRegion>
  );
}
