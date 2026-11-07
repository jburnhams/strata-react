import * as React from "react";
import { CircleAlert } from "lucide-react";
import { cn } from "../lib/utils";

// Field owns the wiring a generated form usually forgets: the label's htmlFor, aria-describedby
// pointing at the hint and the error, and aria-invalid. Controls read it from context, so a control
// inside a Field cannot end up unlabelled or silently invalid.

type FieldState = { id: string; describedBy?: string; invalid: boolean };
const FieldContext = React.createContext<FieldState | null>(null);

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

export type FieldProps = {
  label: string;
  /** The control's id, when the page needs a known one (an anchor, a test). Generated otherwise. */
  id?: string;
  /** What the person needs to know before typing, such as limits or units. */
  hint?: React.ReactNode;
  /** What went wrong and how to fix it, in one sentence. Shown under the control, never in a toast. */
  error?: string;
  children: React.ReactNode;
  className?: string;
};

/** A labelled form field: wires the label, hint, error, `aria-describedby` and `aria-invalid` into the one control it wraps. */
export function Field({ label, id: idProp, hint, error, children, className }: FieldProps) {
  const generated = React.useId();
  const id = idProp ?? generated;
  const hintId = hint ? `${id}-hint` : undefined;
  const errorId = error ? `${id}-error` : undefined;
  const describedBy = [errorId, hintId].filter(Boolean).join(" ") || undefined;

  return (
    <FieldContext.Provider value={{ id, describedBy, invalid: Boolean(error) }}>
      <div className={cn("grid min-w-0 content-start gap-1.5", className)}>
        <label htmlFor={id} className="type-label text-foreground">
          {label}
        </label>
        {children}
        {error && (
          <p id={errorId} className="flex items-start gap-1.5 type-body-sm text-danger">
            <CircleAlert aria-hidden className="mt-0.5 size-4 shrink-0" />
            {error}
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

// Radio choices: a fieldset with a legend, and each label wrapping its control so the whole row is
// one hit target. accent-color carries the theme into the native control.
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
    <fieldset className="grid gap-2" aria-describedby={error ? errorId : undefined}>
      <legend className="mb-1.5 type-label text-foreground">{legend}</legend>
      {choices.map((c) => (
        <label key={c.value} className="flex min-h-(--control-h-sm) cursor-pointer items-start gap-3 py-1">
          <input
            type="radio"
            name={name}
            value={c.value}
            checked={value === c.value}
            onChange={() => onChange(c.value)}
            className="mt-1 size-4 shrink-0 accent-primary"
          />
          <span className="grid">
            <span className="type-body">{c.label}</span>
            {c.detail && <span className="type-body-sm text-muted-foreground">{c.detail}</span>}
          </span>
        </label>
      ))}
      {error && (
        <p id={errorId} className="flex items-start gap-1.5 type-body-sm text-danger">
          <CircleAlert aria-hidden className="mt-0.5 size-4 shrink-0" />
          {error}
        </p>
      )}
    </fieldset>
  );
}
