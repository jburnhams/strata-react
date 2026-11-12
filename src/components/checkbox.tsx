import * as React from "react";
import { Checkbox as AriaCheckbox } from "react-aria-components";
import { Check, Minus } from "lucide-react";
import { cn } from "../lib/utils";

// A checkbox cannot be written without a name: `label` is required, as `IconButton`'s is. Shown,
// it sits beside the box inside one <label>, so the label and the control are a single target
// with no dead zone between them (Vercel's interface guidelines; ux-design audit.md). Hidden
// (`hideLabel`, for a table cell where the row already says what it is), it becomes the
// accessible name through aria-label, never through visually hidden text: a hidden span inside a
// label joined to a neighbour did not form a name with its space in dom-testing-library (strata-
// react issue #11), and an aria-label leaves no room for that.
//
// It is React Aria's Checkbox (a visually hidden native input inside the label), so keyboard,
// forms, `aria-checked="mixed"` and press handling are the library's, and the 18px box is drawn
// from our tokens (it is no longer the platform's `accent-primary` control: that one could not show
// a tick and a dash in the theme's own roles). `checked="mixed"` is the indeterminate state a
// select-all needs. It used to be native; the visual baselines changed for it (CHANGELOG).
//
// `onCheckedChange` also says whether Shift was held, which is how a list of checkboxes extends a
// range (strata-react issue #32). A change event carries no modifier keys, so the label notes Shift
// on the press that leads to it: a mouse press anywhere on the target, or Space on the box.

/** A checkbox with its label as one target. `label` is required; `checked="mixed"` is indeterminate. */
export type CheckboxProps = Omit<React.ComponentProps<"input">, "type" | "checked" | "onChange" | "aria-label" | "children" | "style"> & {
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

/** A checkbox and its label as one target. `label` is required; `hideLabel` keeps it as the accessible name only. */
export function Checkbox({ label, hideLabel = false, detail, checked, onCheckedChange, className, disabled, required, ...props }: CheckboxProps) {
  const shift = useShiftNote();
  // Shift is noted in the capture phase on a wrapper, because React Aria's press handling stops the
  // events it uses before they bubble. `contents` keeps the wrapper out of layout.
  return (
    <span className="contents" onMouseDownCapture={shift.handlers.onMouseDown} onKeyDownCapture={shift.handlers.onKeyDown}>
      <AriaCheckbox
        isSelected={checked === true}
        isIndeterminate={checked === "mixed"}
        isDisabled={disabled}
        isRequired={required}
        onChange={(selected) => onCheckedChange(selected, shift.take())}
        aria-label={hideLabel ? label : undefined}
        {...(props as object)}
        className={cn(
          "group inline-flex min-h-6 min-w-6 items-start gap-3",
          hideLabel && "items-center justify-center",
          disabled ? "cursor-not-allowed opacity-50" : "cursor-pointer",
          className,
        )}
      >
        {({ isSelected, isIndeterminate }) => (
          <>
            <CheckboxBox selected={isSelected} indeterminate={isIndeterminate} hideLabel={hideLabel} />
            {!hideLabel && (
              <span className="grid">
                <span className="type-body">{label}</span>
                {detail && <span className="type-body-sm text-muted-foreground">{detail}</span>}
              </span>
            )}
          </>
        )}
      </AriaCheckbox>
    </span>
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

// The drawn box, shared by `Checkbox` and the table's selection checkbox.
function CheckboxBox({ selected, indeterminate, hideLabel }: { selected: boolean; indeterminate: boolean; hideLabel: boolean }) {
  return (
    <span
      aria-hidden
      className={cn(
        "grid size-4.5 shrink-0 place-items-center rounded-control border border-input bg-background transition-state",
        "group-focus-visible:outline-2 group-focus-visible:outline-offset-2 group-focus-visible:outline-ring",
        (selected || indeterminate) && "border-primary bg-primary text-primary-foreground",
        !hideLabel && "mt-0.5",
      )}
    >
      {indeterminate ? <Minus className="size-3.5" strokeWidth={3} /> : selected ? <Check className="size-3.5" strokeWidth={3} /> : null}
    </span>
  );
}

/**
 * The checkbox of a React Aria `Table` row or header (`slot="selection"`): its checked, mixed and
 * disabled state come from the table, so it takes only a name. A `Checkbox` is controlled and would
 * fight the table's own selection state. Not exported from the package: `DataTable` uses it.
 * @internal
 */
export function TableSelectionCheckbox({ label, className, disabled }: { label: string; className?: string; disabled?: boolean }) {
  // The table names a row's checkbox from its own label and the row header's text; ours is named
  // by the caller's `rowLabel` alone ("Select Tom Ellery"), so it labels itself.
  const id = React.useId();
  return (
    <AriaCheckbox
      slot="selection"
      isDisabled={disabled}
      id={id}
      aria-labelledby={id}
      aria-label={label}
      className={({ isDisabled }) =>
        cn("group inline-flex min-h-6 min-w-6 items-center justify-center", isDisabled ? "cursor-not-allowed opacity-50" : "cursor-pointer", className)
      }
    >
      {({ isSelected, isIndeterminate }) => <CheckboxBox selected={isSelected} indeterminate={isIndeterminate} hideLabel />}
    </AriaCheckbox>
  );
}
