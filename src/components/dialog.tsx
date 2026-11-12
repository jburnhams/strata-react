import * as React from "react";
import {
  Dialog as AriaDialog,
  DialogTrigger,
  Heading,
  Modal,
  ModalOverlay,
} from "react-aria-components";
import { X } from "lucide-react";
import { Button, IconButton } from "./button";
import { describeActionError } from "../lib/errors";
import { cn } from "../lib/utils";
import { overlaySurface } from "../lib/overlay";

// Dialog is for a task that needs its own space; "a modal is never the first idea for a form that
// fits on the page" (components.md §3.11). AlertDialog is the only confirm in the library, for what
// cannot be undone: a reversible removal uses `UndoBar` instead (patterns.md §7).
//
// What the types and the component settle, so an app cannot get them wrong:
// - A title is required (visible, or `hideTitle` for a screen-reader-only one): an unnamed dialog is
//   announced as "dialog" and nothing else. An AlertDialog's `confirm` is required and is the verb,
//   "Delete 3 firings", never "OK".
// - React Aria moves focus in on open and back to the trigger on close, makes the page behind inert
//   and stops it scrolling. Content scrolls inside the dialog when tall (`overscroll-contain`), and
//   everything is portalled onto `layer-overlay`, above panes, sticky headers and the undo bar.
// - A dialog can be made not closable while work runs (`closable={false}`: no close control, no
//   Escape, no outside press), so an export cannot lose its Close button halfway, as strata-vid's did.
// - An AlertDialog ignores outside presses, focuses its safe choice (Cancel) first, and stays open
//   with the reason when an async confirm fails, since closing would hide that it did not happen.
// - The same surface is a Sheet with `placement="end"`: a side panel for a long form or a detail.

type Common = {
  /** What it is for: "Export video", "Delete 3 firings?". Required. */
  title: string;
  /** Shown under the title when it is not enough alone. */
  description?: React.ReactNode;
  /** The control that opens it. Leave out and drive it with `open` and `onOpenChange`. */
  trigger?: React.ReactElement;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  className?: string;
};

/** Props for `Dialog`. */
export type DialogProps = Common & {
  /** The body. It scrolls inside the dialog when it is taller than the window. */
  children?: React.ReactNode;
  /** The buttons along the bottom, built with `DialogActions`'s `close` render prop when one should close it. One filled button at most. */
  actions?: React.ReactNode | ((close: () => void) => React.ReactNode);
  /** Keep the title for screen readers only, when the body already says it. */
  hideTitle?: boolean;
  /** `false` while work cannot be interrupted: no close control, Escape or outside press. Default true. */
  closable?: boolean;
  /** `center` is a dialog; `end` is a sheet down the right edge. Default `center`. */
  placement?: "center" | "end";
  size?: "sm" | "md" | "lg";
};

const sizes = { sm: "max-w-sm", md: "max-w-lg", lg: "max-w-3xl" } as const;

// A dialog with a `trigger` is React Aria's DialogTrigger around it. One driven only by `open` has
// nothing pressable to put in a trigger, and React Aria warns "A PressResponder was rendered without a
// pressable child" for an empty one on every mount (issue #116), so it gets the controlled
// ModalOverlay alone: it still traps focus and, on close, returns it to whatever had it before.
function Overlay({ trigger, open, onOpenChange, children }: { trigger?: React.ReactElement; open?: boolean; onOpenChange?: (open: boolean) => void; children: React.ReactElement<React.ComponentProps<typeof ModalOverlay>> }) {
  if (trigger) {
    return (
      <DialogTrigger isOpen={open} onOpenChange={onOpenChange}>
        {trigger}
        {children}
      </DialogTrigger>
    );
  }
  return <Driven open={open} onOpenChange={onOpenChange}>{children}</Driven>;
}

// Without a trigger, React Aria has no element to hand focus back to, so the one that had it when
// the dialog opened is kept (read while rendering, before the dialog moves focus in) and given it
// back on close, unless the app has already put focus somewhere on purpose.
function Driven({ open, onOpenChange, children }: { open?: boolean; onOpenChange?: (open: boolean) => void; children: React.ReactElement<React.ComponentProps<typeof ModalOverlay>> }) {
  const opener = React.useRef<Element | null>(null);
  const wasOpen = React.useRef(false);
  if (open && !wasOpen.current) opener.current = typeof document === "undefined" ? null : document.activeElement;
  wasOpen.current = Boolean(open);
  React.useEffect(() => {
    if (!open) return;
    return () => {
      const back = opener.current;
      opener.current = null;
      requestAnimationFrame(() => {
        const idle = !document.activeElement || document.activeElement === document.body;
        if (idle && back instanceof HTMLElement && back.isConnected) back.focus();
      });
    };
  }, [open]);
  return React.cloneElement(children, { isOpen: open, onOpenChange });
}

const overlayClass = "layer-overlay fixed inset-0 grid overflow-hidden bg-foreground/40";

/** A modal dialog with a required title; focus goes in and returns, Escape and a close control dismiss it. `placement="end"` makes it a sheet. */
export function Dialog({
  title, description, trigger, open, onOpenChange, className, children, actions,
  hideTitle, closable = true, placement = "center", size = "md",
}: DialogProps) {
  const descriptionId = React.useId();
  return (
    <Overlay trigger={trigger} open={open} onOpenChange={onOpenChange}>
      <ModalOverlay isDismissable={closable} isKeyboardDismissDisabled={!closable} className={cn(overlayClass, placement === "end" ? "justify-items-end" : "place-items-center p-4")}>
        <Modal
          className={cn(
            "flex max-h-full min-h-0 w-full flex-col outline-none",
            overlaySurface,
            placement === "end" ? "h-full max-w-md rounded-r-none" : sizes[size],
            className,
          )}
        >
          <AriaDialog aria-describedby={description != null ? descriptionId : undefined} className="flex min-h-0 flex-1 flex-col gap-4 p-4 outline-none">
            {({ close }) => (
              <>
                <div className="flex items-start justify-between gap-4">
                  <div className="grid gap-1">
                    <Heading slot="title" className={cn("type-heading", hideTitle && "sr-only")}>
                      {title}
                    </Heading>
                    {description != null && <p id={descriptionId} className="type-body-sm text-muted-foreground">{description}</p>}
                  </div>
                  {closable && <IconButton icon={X} label="Close" onPress={close} className="-mr-2 -mt-2 shrink-0" />}
                </div>
                {children != null && <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">{children}</div>}
                {actions != null && (
                  <div className="flex flex-wrap justify-end gap-2">{typeof actions === "function" ? actions(close) : actions}</div>
                )}
              </>
            )}
          </AriaDialog>
        </Modal>
      </ModalOverlay>
    </Overlay>
  );
}

/** Props for `AlertDialog`. */
export type AlertDialogProps = Common & {
  /** The verb, repeating the action: "Delete 3 firings". Required; "OK" and "Confirm" are what this prevents. */
  confirm: string;
  /** Runs on confirm. When it returns a promise the dialog waits, shows the button busy, and stays open with the reason if it rejects. */
  onConfirm: () => void | Promise<unknown>;
  /** The safe choice, which has initial focus. Default "Cancel". */
  cancel?: string;
  /** `destructive` fills the confirm button with the destructive role. Default `destructive`. */
  tone?: "destructive" | "default";
};

/**
 * A confirm for what cannot be undone. Names the object and the consequence in `title`, repeats the
 * verb on the confirm button, focuses Cancel first and ignores outside presses.
 */
export function AlertDialog({
  title, description, trigger, open, onOpenChange, className, confirm, onConfirm, cancel = "Cancel", tone = "destructive",
}: AlertDialogProps) {
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string>();
  const [inner, setInner] = React.useState(false);
  const descriptionId = React.useId();
  const isOpen = open ?? inner;
  const change = (next: boolean) => {
    if (busy) return;
    setError(undefined);
    setInner(next);
    onOpenChange?.(next);
  };
  const run = async () => {
    try {
      const result = onConfirm();
      if (result && typeof (result as Promise<unknown>).then === "function") {
        setBusy(true);
        await result;
      }
      setBusy(false);
      change(false);
    } catch (thrown) {
      setBusy(false);
      setError(describeActionError(thrown) ?? "That did not go through. Nothing was confirmed; try again.");
    }
  };
  return (
    <Overlay trigger={trigger} open={isOpen} onOpenChange={change}>
      <ModalOverlay isDismissable={false} isKeyboardDismissDisabled={busy} className={cn(overlayClass, "place-items-center p-4")}>
        <Modal className={cn("flex max-h-full w-full max-w-sm flex-col outline-none", overlaySurface, className)}>
          <AriaDialog role="alertdialog" aria-describedby={description != null ? descriptionId : undefined} className="flex min-h-0 flex-1 flex-col gap-4 p-4 outline-none">
            {({ close }) => (
              <>
                {/* The message scrolls inside the dialog on a short window or with large text; the buttons stay in view. */}
                <div className="grid min-h-0 gap-3 overflow-y-auto overscroll-contain">
                  <div className="grid gap-1">
                    <Heading slot="title" className="type-heading">{title}</Heading>
                    {description != null && <p id={descriptionId} className="type-body-sm text-muted-foreground">{description}</p>}
                  </div>
                  {error && (
                    <p role="alert" className="rounded-control bg-danger-subtle px-3 py-2 type-body-sm text-danger">
                      {error}
                    </p>
                  )}
                </div>
                <div className="flex flex-wrap justify-end gap-2">
                  <Button autoFocus disabled={busy} onPress={close}>{cancel}</Button>
                  <Button variant={tone === "destructive" ? "destructive" : "default"} disabled={busy} aria-busy={busy || undefined} onPress={run}>
                    {busy ? `${confirm}…` : confirm}
                  </Button>
                </div>
              </>
            )}
          </AriaDialog>
        </Modal>
      </ModalOverlay>
    </Overlay>
  );
}

