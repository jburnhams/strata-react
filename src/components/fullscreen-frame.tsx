import * as React from "react";
import { Dialog as AriaDialog, Modal, ModalOverlay } from "react-aria-components";
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

/** Props for `FullscreenFrame`. */
export type FullscreenFrameProps = {
  /** Names the full-screen view for screen readers: "Compare renderings". Required. */
  label: string;
  /** Whether the frame is full screen. The caller owns it so a button and a key can share it. */
  active: boolean;
  /** Called with `false` when the person leaves with Escape or the browser's own control. */
  onActiveChange: (active: boolean) => void;
  children: React.ReactNode;
  className?: string;
};

/** Whether this browser can show an element full screen. False in jsdom and on iPhone, where the modal fallback is used. */
export function canFullscreen(): boolean {
  return typeof document !== "undefined" && document.fullscreenEnabled === true && typeof Element.prototype.requestFullscreen === "function";
}

/** Shows its children full screen while `active`: the browser's Fullscreen API where there is one, a window-filling modal where there is not. */
export function FullscreenFrame({ label, active, onActiveChange, children, className }: FullscreenFrameProps) {
  const ref = React.useRef<HTMLDivElement>(null);
  const [native, setNative] = React.useState(false);
  const change = React.useRef(onActiveChange);
  change.current = onActiveChange;

  React.useEffect(() => {
    const el = ref.current;
    if (!active) {
      setNative(false);
      if (document.fullscreenElement && document.fullscreenElement === el) void document.exitFullscreen();
      return;
    }
    if (!el || !canFullscreen()) return;
    let cancelled = false;
    el.requestFullscreen().then(
      () => !cancelled && setNative(true),
      () => undefined, // refused: the modal below opens instead
    );
    const onChange = () => {
      if (document.fullscreenElement !== el && !cancelled) change.current(false);
    };
    document.addEventListener("fullscreenchange", onChange);
    return () => {
      cancelled = true;
      document.removeEventListener("fullscreenchange", onChange);
    };
  }, [active]);

  // Until the browser has said yes, the modal is the answer: no browser support or a refusal shows it at once.
  const modal = active && !native && !canFullscreen();
  const inner = (
    <div ref={ref} className={cn(active && "flex h-full min-h-0 flex-col bg-background p-4", className)}>
      {children}
    </div>
  );
  if (!modal) return inner;
  return (
    <ModalOverlay isOpen onOpenChange={(o) => !o && onActiveChange(false)} isDismissable className="layer-overlay fixed inset-0 bg-foreground/40">
      <Modal className={cn("h-full w-full outline-none", overlaySurface, "rounded-none")}>
        <AriaDialog aria-label={label} className="h-full outline-none">
          {inner}
        </AriaDialog>
      </Modal>
    </ModalOverlay>
  );
}
