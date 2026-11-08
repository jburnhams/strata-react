import * as React from "react";
import { cn } from "../lib/utils";

// A checkbox cannot be written without a name: `label` is required, as `IconButton`'s is. Shown,
// it sits beside the box inside one <label>, so the label and the control are a single target
// with no dead zone between them (Vercel's interface guidelines; ux-design audit.md). Hidden
// (`hideLabel`, for a table cell where the row already says what it is), it becomes the
// accessible name through aria-label, never through visually hidden text: a hidden span inside a
// label joined to a neighbour did not form a name with its space in dom-testing-library (strata-
// react issue #11), and an aria-label leaves no room for that.
//
// It is the native control (an 18px box, `accent-primary`), so keyboard, forms and the platform's
// own focus and checked rendering come free. `checked="mixed"` is the indeterminate state a
// select-all needs; React has no prop for it, so it is set on the element.
//
// `onCheckedChange` also says whether Shift was held, which is how a list of checkboxes extends a
// range (strata-react issue #32). A change event carries no modifier keys, so the label notes Shift
// on the press that leads to it: a mouse press anywhere on the target, or Space on the box.

/** A checkbox with its label as one target. `label` is required; `checked="mixed"` is indeterminate. */
export type CheckboxProps = Omit<React.ComponentProps<"input">, "type" | "checked" | "onChange" | "aria-label" | "children"> & {
  /** Names the checkbox. Shown beside it unless `hideLabel`. */
  label: string;
  /** Keep the label as the accessible name only, for a cell or toolbar where the context shows what it is. */
  hideLabel?: boolean;
  /** A muted second line under a shown label. */
  detail?: string;
  checked: boolean | "mixed";
  /** Called with the new state, and whether Shift was held (a range click or Shift+Space). */
  onCheckedChange: (checked: boolean, gesture: CheckboxGesture) => void;
};

/** How a checkbox was changed: `shiftKey` is true for Shift+click and Shift+Space, which extend a range in a list. */
export type CheckboxGesture = { shiftKey: boolean };

/** A native checkbox and its label as one target. `label` is required; `hideLabel` keeps it as the accessible name only. */
export function Checkbox({ label, hideLabel = false, detail, checked, onCheckedChange, className, disabled, ...props }: CheckboxProps) {
  const ref = React.useRef<HTMLInputElement>(null);
  const shift = useShiftNote();
  React.useEffect(() => {
    if (ref.current) ref.current.indeterminate = checked === "mixed";
  }, [checked]);
  return (
    <label
      {...shift.handlers}
      className={cn(
        "inline-flex min-h-6 min-w-6 items-start gap-3",
        hideLabel && "items-center justify-center",
        disabled ? "cursor-not-allowed opacity-50" : "cursor-pointer",
        className,
      )}
    >
      <input
        ref={ref}
        type="checkbox"
        checked={checked === true}
        aria-checked={checked === "mixed" ? "mixed" : undefined}
        aria-label={hideLabel ? label : undefined}
        disabled={disabled}
        onChange={(e) => onCheckedChange(e.target.checked, shift.take())}
        className={cn("size-4.5 shrink-0 accent-primary", !hideLabel && "mt-0.5", disabled ? "cursor-not-allowed" : "cursor-pointer")}
        {...props}
      />
      {!hideLabel && (
        <span className="grid">
          <span className="type-body">{label}</span>
          {detail && <span className="type-body-sm text-muted-foreground">{detail}</span>}
        </span>
      )}
    </label>
  );
}

/** Notes Shift on the press that leads to a checkbox's change event, which has no modifier keys of its own. */
export function useShiftNote() {
  const held = React.useRef(false);
  return React.useMemo(
    () => ({
      handlers: {
        onMouseDown: (e: React.MouseEvent) => void (held.current = e.shiftKey),
        onKeyDown: (e: React.KeyboardEvent) => void (held.current = e.shiftKey),
      },
      take: (): CheckboxGesture => {
        const shiftKey = held.current;
        held.current = false;
        return { shiftKey };
      },
    }),
    [],
  );
}
