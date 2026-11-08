import * as React from "react";

// One IntersectionObserver hook for everything that waits until it is near the screen: the
// sentinel at the end of an InfiniteList and an image in a Thumbnail. Both watch from the nearest
// `[data-strata-scroll]` region (a VirtualList's) or else the viewport, with a root
// margin so the work starts before the element is reached. They differ in two ways, which are
// options rather than two hooks:
//
// - `once`: an image, once asked for, stays asked for; scrolling it away again must not unload it.
//   A sentinel reports in and out of view every time.
// - `unsupported`: where there is no IntersectionObserver (an old browser, a test without the
//   fake), an image loads at once, because a photo that never loads is worse than one loaded
//   early. A sentinel reports out of view, because InfiniteList's Show more button is the path
//   that always works.

/** Options for {@link useInView}. */
export type InViewOptions = {
  /** Watch only while this is true. Default true. */
  active?: boolean;
  /** How far outside the scroll region still counts as in view (IntersectionObserver `rootMargin`). */
  rootMargin?: string;
  /** Stay in view after the first time, and stop watching. */
  once?: boolean;
  /** What to report where `IntersectionObserver` does not exist. Default false. */
  unsupported?: boolean;
};

/**
 * Whether an element is within `rootMargin` of its scroll region (the nearest
 * `[data-strata-scroll]` ancestor, else the viewport). Returns a callback ref, so it follows the
 * element as it mounts and unmounts.
 */
export function useInView({ active = true, rootMargin = "0px", once = false, unsupported = false }: InViewOptions = {}) {
  const [inView, setInView] = React.useState(false);
  const [el, setEl] = React.useState<Element | null>(null);
  const seen = once && inView;
  React.useEffect(() => {
    if (seen) return;
    if (!active || !el) {
      setInView(false);
      return;
    }
    if (typeof IntersectionObserver === "undefined") {
      setInView(unsupported);
      return;
    }
    const root = el.parentElement?.closest<HTMLElement>("[data-strata-scroll]") ?? null;
    const observer = new IntersectionObserver((entries) => setInView(entries[entries.length - 1].isIntersecting), { root, rootMargin });
    observer.observe(el);
    return () => observer.disconnect();
  }, [active, el, rootMargin, seen, unsupported]);
  return { ref: setEl, inView };
}
