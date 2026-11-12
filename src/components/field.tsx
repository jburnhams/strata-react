import * as React from "react";
import { CircleAlert } from "lucide-react";
import { Label, Radio, RadioGroup } from "react-aria-components";
import { cn } from "../lib/utils";

// Field owns the wiring a generated form usually forgets: the label's htmlFor, aria-describedby
// pointing at the hint and the error, and aria-invalid. Controls read it from context, so a control
// inside a Field cannot end up unlabelled or silently invalid.
//
// A one-field form ("paste a link, Add", a search box, "invite by email") puts its button on the
// control's row, not beside the whole field (strata-react issue #46, from the Tubes Library
// screen): in a plain flex row the button lines up with label, hint and error together and drifts
// off the input whenever one shows. `action` is drawn on the control's row, both at --control-h,
// with the hint and the error under both across the full width. It wraps under the control only
// when the row cannot keep the control 10rem wide beside it (a 250px inspector body keeps a Reset beside its slider, issue #116): on a phone a short "Add" stays on the
// row, as a search box's button does, and a long label or a narrow column wraps. The error and hint stay the input's description; the
// button is not described by them. Field messages for a form come from `useAsyncAction`'s
// `fieldErrors` (its `validate`, or the server's 422), so no `problem` state is kept by hand.

type FieldState = { id: string; label: string; describedBy?: string; invalid: boolean; report: (message: string | undefined) => void };
const FieldContext = React.createContext<FieldState | null>(null);

// A control that checks what was typed (a number field, a colour field) reports its own message to
// the Field it sits in, which draws it as the field's error, so a value outside the limits is
// explained in the same place and way as a server's 422, with nothing for the screen to wire.
// `error` from the screen wins over the control's own. Outside a Field `report` does nothing and
// the control marks itself invalid without a message.
/** @internal The surrounding Field, and where a control reports its own message. */
export function useFieldControl() {
  const field = React.useContext(FieldContext);
  return { field, report: field?.report ?? noReport };
}

function useField(id?: string) {
  const field = React.useContext(FieldContext);
  return {
    // Inside a Field the Field's id wins, so the label always points at the control. To choose the
    // id yourself, pass it to Field.
    id: field?.id ?? id,
    "aria-describedby": field?.describedBy,
    "aria-invalid": field?.invalid || undefined,
  };
}

const noReport = () => {};

export type FieldProps = {
  label: string;
  /** The control's id, when the page needs a known one (an anchor, a test). Generated otherwise. */
  id?: string;
  /** What the person needs to know before typing, such as limits or units. */
  hint?: React.ReactNode;
  /** What went wrong and how to fix it, in one sentence. Shown under the control, never in a toast. */
  error?: string;
  /** A button on the control's row, for a one-field form (an `AsyncButton` "Add"). The hint and error run under both; on a narrow screen it wraps under the control. */
  action?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
};

/** A labelled form field: wires the label, hint, error, `aria-describedby` and `aria-invalid` into the one control it wraps. */
export function Field({ label, id: idProp, hint, error, action, children, className }: FieldProps) {
  const generated = React.useId();
  const id = idProp ?? generated;
  const hintId = hint ? `${id}-hint` : undefined;
  const [reported, report] = React.useState<string>();
  const shown = error ?? reported;
  const errorId = shown ? `${id}-error` : undefined;
  const describedBy = [errorId, hintId].filter(Boolean).join(" ") || undefined;

  return (
    <FieldContext.Provider value={{ id, label, describedBy, invalid: Boolean(shown), report }}>
      <div className={cn("grid min-w-0 content-start gap-1.5", className)}>
        <label htmlFor={id} className="type-label text-foreground">
          {label}
        </label>
        {action ? (
          <div className="flex flex-wrap items-start gap-2">
            <div className="min-w-40 flex-1">{children}</div>
            <div className="flex shrink-0 items-center">{action}</div>
          </div>
        ) : (
          children
        )}
        {shown && (
          <p id={errorId} className="flex items-start gap-1.5 type-body-sm text-danger">
            <CircleAlert aria-hidden className="mt-0.5 size-4 shrink-0" />
            {shown}
          </p>
        )}
        {hint && (
          <p id={hintId} className="type-body-sm text-muted-foreground">
            {hint}
          </p>
        )}
      </div>
    </FieldContext.Provider>
  );
}

const control =
  "w-full min-w-0 rounded-control border border-input bg-background px-3 type-body text-foreground transition-state placeholder:text-muted-foreground disabled:cursor-not-allowed disabled:bg-muted disabled:opacity-70 aria-invalid:border-danger";

/** A text input that picks up its id and descriptions from the surrounding `Field`. */
export function Input({ className, id, ...props }: React.ComponentProps<"input">) {
  return <input {...useField(id)} className={cn(control, "h-(--control-h)", className)} {...props} />;
}

/** A multi-line input that picks up its id and descriptions from the surrounding `Field`. */
export function Textarea({ className, id, ...props }: React.ComponentProps<"textarea">) {
  return <textarea {...useField(id)} className={cn(control, "min-h-24 py-2", className)} {...props} />;
}

// A native select, styled. For short option lists on a touch screen it beats a custom listbox:
// the platform picker, typeahead and form autofill all work with no code.
/** The platform select, styled. The default for short lists, especially on touch screens. */
export function NativeSelect({ className, id, ...props }: React.ComponentProps<"select">) {
  return <select {...useField(id)} className={cn(control, "h-(--control-h) pr-8", className)} {...props} />;
}

// Radio choices: React Aria's RadioGroup (a group named by its label, arrow-key movement, one tab
// stop), and each row wraps its control so the whole row is one hit target. The dot is drawn from
// tokens, not the platform's accent-color radio.
export type Choice = { value: string; label: string; detail?: string };

/** Radio choices in a fieldset with a legend; each whole row is the hit target. For 2 to 5 options that each need a sentence. */
export function ChoiceGroup({
  legend,
  name,
  choices,
  value,
  onChange,
  error,
}: {
  legend: string;
  name: string;
  choices: Choice[];
  value: string;
  onChange: (value: string) => void;
  error?: string;
}) {
  const errorId = React.useId();
  return (
    <RadioGroup name={name} value={value} onChange={onChange} aria-describedby={error ? errorId : undefined} className="grid gap-2">
      <Label className="mb-1.5 type-label text-foreground">{legend}</Label>
      {choices.map((c) => (
        <Radio key={c.value} value={c.value} className="group flex min-h-(--control-h-sm) cursor-pointer items-start gap-3 py-1">
          <span
            aria-hidden
            className="mt-1 grid size-4 shrink-0 place-items-center rounded-pill border border-input bg-background transition-state group-selected:border-primary group-focus-visible:outline-2 group-focus-visible:outline-offset-2 group-focus-visible:outline-ring"
          >
            <span className="size-2 rounded-pill bg-primary opacity-0 group-selected:opacity-100" />
          </span>
          <span className="grid">
            <span className="type-body">{c.label}</span>
            {c.detail && <span className="type-body-sm text-muted-foreground">{c.detail}</span>}
          </span>
        </Radio>
      ))}
      {error && (
        <p id={errorId} className="flex items-start gap-1.5 type-body-sm text-danger">
          <CircleAlert aria-hidden className="mt-0.5 size-4 shrink-0" />
          {error}
        </p>
      )}
    </RadioGroup>
  );
}
