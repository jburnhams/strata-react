import * as React from "react";
import { Dialog as AriaDialog, Modal, ModalOverlay } from "react-aria-components";
import { UNSAFE_PortalProvider, useUNSAFE_PortalContext } from "react-aria";
import { cn } from "../lib/utils";
import { overlaySurface } from "../lib/overlay";

// Full screen for a picture, a pair to compare or a player: the thing being judged gets the whole
// screen, with its controls still around it. The browser's Fullscreen API is the first choice,
// because it hides the browser's own chrome too; the iPhone's Safari has no such API for anything
// but video, so there the same content opens in a React Aria modal that fills the window. Either
// way the caller holds `active` (so a key and a button can both toggle it), and zoom, mode and the
// question being answered live in the caller's state, so they survive the change. In the modal the
// content is re-mounted (an image is drawn again from the browser's cache); natively it is not.
//
// React Aria checked: `Modal`/`ModalOverlay` give the fallback its focus containment, inert page
// behind it and Escape; they do not offer the Fullscreen API, which is why the native path is
// ours (an effect on `requestFullscreen` and the `fullscreenchange` event, the browser's own way
// to say the person pressed Escape). If the browser refuses (it needs a recent click or key) the
// fallback is used, so asking for full screen never silently does nothing.
//
// While natively full screen, React Aria's overlays (a select's list, a menu, a tooltip) portal into the frame
// (`UNSAFE_PortalProvider`): the browser shows only the full-screen element and its descendants in the top layer,
// so a popover portalled to <body> opened behind it, out of sight and out of reach (#325 review). The provider is
// always there, so going full screen never mounts the content again (a playing video); outside full screen it
// passes on whatever container the app set, else <body>.

/** Props for `FullscreenFrame`. */
export type FullscreenFrameProps = {
  /** Names the full-screen view for screen readers: "Compare renderings". Required. */
  label: string;
  /** Whether the frame is full screen. The caller owns it so a button and a key can share it. */
  active: boolean;
  /** Called with `false` when the person leaves with Escape or the browser's own control. */
  onActiveChange: (active: boolean) => void;
  /** Open a window-filling modal where the browser has no Fullscreen API or refuses. Default true. `false` for content that must not be mounted again (a playing video): where the browser cannot or will not, `onActiveChange(false)` is called instead. */
  modal?: boolean;
  children: React.ReactNode;
  className?: string;
};

/** Whether this browser can show an element full screen. False in jsdom and on iPhone, where the modal fallback is used. */
export function canFullscreen(): boolean {
  return typeof document !== "undefined" && document.fullscreenEnabled === true && typeof Element.prototype.requestFullscreen === "function";
}

/** Shows its children full screen while `active`: the browser's Fullscreen API where there is one, a window-filling modal where there is not. */
export function FullscreenFrame({ label, active, onActiveChange, modal: allowModal = true, children, className }: FullscreenFrameProps) {
  const ref = React.useRef<HTMLDivElement>(null);
  const [native, setNative] = React.useState(false);
  const [refused, setRefused] = React.useState(false);
  const change = React.useRef(onActiveChange);
  change.current = onActiveChange;

  React.useEffect(() => {
    const el = ref.current;
    if (!active) {
      setNative(false);
      setRefused(false);
      if (document.fullscreenElement && document.fullscreenElement === el) void document.exitFullscreen();
      return;
    }
    if (!el) return;
    if (!canFullscreen()) {
      if (!allowModal) change.current(false);
      return;
    }
    let cancelled = false;
    el.requestFullscreen().then(
      () => !cancelled && setNative(true),
      () => {
        if (cancelled) return;
        if (allowModal) setRefused(true); // refused (no recent click or key, say): the modal below opens instead
        else change.current(false);
      },
    );
    const onChange = () => {
      if (document.fullscreenElement !== el && !cancelled) change.current(false);
    };
    document.addEventListener("fullscreenchange", onChange);
    return () => {
      cancelled = true;
      document.removeEventListener("fullscreenchange", onChange);
    };
  }, [active, allowModal]);

  // The modal is the answer where the browser cannot, or has refused. While a request is in flight the content stays in place.
  const modal = allowModal && active && !native && (!canFullscreen() || refused);
  const outer = useUNSAFE_PortalContext();
  const getContainer = React.useCallback(() => (native && ref.current ? ref.current : (outer.getContainer?.() ?? document.body)), [native, outer]);
  const inner = (
    <div ref={ref} className={cn(active && "flex h-full min-h-0 flex-col bg-background p-4", className)}>
      <UNSAFE_PortalProvider getContainer={getContainer}>{children}</UNSAFE_PortalProvider>
    </div>
  );
  if (!modal) return inner;
  return (
    <ModalOverlay isOpen onOpenChange={(o) => !o && onActiveChange(false)} isDismissable className="layer-overlay fixed inset-0 scrim">
      <Modal className={cn("h-full w-full outline-none", overlaySurface, "rounded-none")}>
        <AriaDialog aria-label={label} className="h-full outline-none">
          {inner}
        </AriaDialog>
      </Modal>
    </ModalOverlay>
  );
}
