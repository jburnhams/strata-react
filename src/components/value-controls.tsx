import * as React from "react";
import { useFieldControl } from "./field";
import { NBSP, format } from "../lib/format";
import { clamp, decimalsOf, parseHex, parseNumber, roundTo, stepValue, contrastRatio } from "../lib/number-input";
import { cn } from "../lib/utils";

// Controls for setting a number or a colour precisely (strata-react issue #73, from moving
// strata-vid onto Strata: opacity, rotation, volume, bitrate, a line colour). The native ones fail
// in the same few ways, and each rule below answers one:
//
// - `parseFloat(e.target.value)` turns an empty field into NaN. Here a value that is not known is
//   `null`, stays `null`, and prints `format.missing`; a typed value that is not a number, or is
//   outside the limits, is NOT coerced and NOT passed on: the control keeps what was typed and tells
//   the surrounding `Field` what is wrong ("Enter a value from 0% to 500%."), the same place a
//   server's 422 appears. The callback only ever receives a number inside the limits, or null.
// - The unit lives inside the control, muted, and in the spoken value ("40%", "90°"): a slider
//   whose unit is in a label elsewhere reads as a bare number to a screen reader.
// - Digits are the locale's: what is printed, what is read back from typing, and the message all go
//   through `Intl`, so 12,5 works in a de-DE app and 1.234,5 is not read as 1.234.
// - Typing commits on Enter and blur (`commit="change"` to follow every keystroke, for a cheap
//   preview). Arrow keys step and commit at once: Shift or PageUp/PageDown take the large step,
//   Home and End jump to the limits. Nothing animates when a value changes: these are dragged and
//   stepped dozens of times a minute (character.md, the frequency budget).
// - A colour a person picks for their own content (a route's line) is content, not theme, so it is
//   the one place a raw colour value is right; `against` checks it against what it is drawn on.
//
// Not React Aria's NumberField or Slider, on purpose: its field clamps a typed 600 to 500 on blur
// without saying so (coercion, which this control exists to avoid), and its slider's spoken value
// comes from `Intl` unit names, which have no "px", "Mbps" or "steps". The native `range` input
// gives the keyboard, touch and right-to-left behaviour for free and takes a spoken value as given.
// The focus outline is the base layer's.

const box =
  "flex h-(--control-h) w-full min-w-0 items-center rounded-control border border-input bg-background px-3 type-body text-foreground transition-state has-[input:disabled]:cursor-not-allowed has-[input:disabled]:bg-muted has-[input:disabled]:opacity-70 aria-invalid:border-danger has-[input:focus-visible]:outline-2 has-[input:focus-visible]:outline-offset-2 has-[input:focus-visible]:outline-ring";

/** A number with its unit joined by a non-breaking space; `%` and `°` stay attached. */
function withUnit(text: string, unit?: string) {
  if (!unit) return text;
  return unit === "%" || unit === "°" ? text + unit : text + NBSP + unit;
}

function useNumberText(locale: string, places: number) {
  return React.useMemo(() => {
    const f = new Intl.NumberFormat(locale, { maximumFractionDigits: places, minimumFractionDigits: 0 });
    return (n: number) => f.format(n);
  }, [locale, places]);
}

/** Props shared by the number field and the slider. */
export type RangeProps = {
  min?: number;
  max?: number;
  /** The size of one arrow-key step. Default 1. */
  step?: number;
  /** The unit shown with the value and spoken with it: "%", "°", "Mbps", "px". */
  unit?: string;
  /** The locale for digits and the decimal mark. Default the app's `format` locale. */
  locale?: string;
};

/** Props for `NumberField`. */
export type NumberFieldProps = RangeProps & {
  /** The current value; `null` when it is not known (shown as an en dash, not 0). */
  value: number | null;
  /** Receives a number inside the limits, or `null` when the field is cleared. Never NaN, never out of range. */
  onChange: (value: number | null) => void;
  /** The step Shift+arrow and PageUp/PageDown take. Default ten steps. */
  largeStep?: number;
  /** Decimal places to show and keep. Default the places in `step` (and `min`). */
  places?: number;
  /** Follow every keystroke instead of committing on Enter and blur. For cheap previews only. */
  commit?: "blur" | "change";
  /** An empty field is an error ("Enter a value.") rather than `null`. */
  required?: boolean;
  disabled?: boolean;
  /** Names the control when it is used without a `Field`. */
  "aria-label"?: string;
  id?: string;
  name?: string;
  className?: string;
};

function describeRange(min: number | undefined, max: number | undefined, show: (n: number) => string, unit?: string) {
  const a = min === undefined ? "" : withUnit(show(min), unit);
  const b = max === undefined ? "" : withUnit(show(max), unit);
  if (min !== undefined && max !== undefined) return `Enter a value from ${a} to ${b}.`;
  if (min !== undefined) return `Enter ${a} or more.`;
  if (max !== undefined) return `Enter ${b} or less.`;
  return "Enter a number.";
}

/** A number with a unit, keyboard stepping, and typing that is checked rather than coerced: out-of-range or non-numeric input is explained in the surrounding `Field` and never passed on; empty stays `null`. */
export function NumberField({
  value,
  onChange,
  min,
  max,
  step = 1,
  largeStep = step * 10,
  places,
  unit,
  locale = format.locale,
  commit = "blur",
  required = false,
  disabled,
  id: idProp,
  name,
  className,
  "aria-label": ariaLabel,
}: NumberFieldProps) {
  const { field, report } = useFieldControl();
  const digits = places ?? Math.max(decimalsOf(step), min === undefined ? 0 : decimalsOf(min));
  const show = useNumberText(locale, digits);
  const [draft, setDraft] = React.useState<string | null>(null);
  const [own, setOwn] = React.useState(false); // invalid, when there is no Field to say so
  const shown = draft ?? (value === null ? "" : show(value));

  const fail = (message: string) => {
    setOwn(true);
    report(message);
  };
  const ok = () => {
    setOwn(false);
    report(undefined);
  };

  /** Checks `text`; calls back and returns true when it is acceptable. */
  const commitText = (text: string): boolean => {
    const parsed = parseNumber(text, locale, unit);
    if (parsed.kind === "empty") {
      if (required) return fail("Enter a value."), false;
      ok();
      if (value !== null) onChange(null);
      return true;
    }
    if (parsed.kind === "invalid") return fail(describeRange(min, max, show, unit)), false;
    // Limits are checked on what was typed, before rounding: 500.4 is out of range, not 500.
    if (clamp(parsed.value, min, max) !== parsed.value) return fail(describeRange(min, max, show, unit)), false;
    const n = roundTo(parsed.value, digits);
    ok();
    if (n !== value) onChange(n);
    return true;
  };

  const stepBy = (by: number, size: number) => {
    const current = draft !== null ? (() => { const p = parseNumber(draft, locale, unit); return p.kind === "number" ? p.value : null; })() : value;
    const next = stepValue(current, by, size, min, max);
    setDraft(null);
    ok();
    if (next !== value) onChange(next);
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (disabled || e.nativeEvent.isComposing) return;
    const big = e.shiftKey;
    switch (e.key) {
      case "ArrowUp": e.preventDefault(); return stepBy(1, big ? largeStep : step);
      case "ArrowDown": e.preventDefault(); return stepBy(-1, big ? largeStep : step);
      case "PageUp": e.preventDefault(); return stepBy(1, largeStep);
      case "PageDown": e.preventDefault(); return stepBy(-1, largeStep);
      case "Home": if (min !== undefined && draft === null) { e.preventDefault(); setDraft(null); ok(); if (min !== value) onChange(min); } return;
      case "End": if (max !== undefined && draft === null) { e.preventDefault(); setDraft(null); ok(); if (max !== value) onChange(max); } return;
      case "Enter": if (draft !== null && commitText(draft)) setDraft(null); return;
      case "Escape": if (draft !== null) { setDraft(null); ok(); } return;
    }
  };

  const invalid = field?.invalid || own;
  const parsedNow = value === null ? undefined : value;
  return (
    <div className={cn(box, className)} aria-invalid={invalid || undefined}>
      <input
        id={idProp ?? field?.id}
        name={name}
        type="text"
        role="spinbutton"
        inputMode={digits > 0 || (min !== undefined && min < 0) ? "decimal" : "numeric"}
        autoComplete="off"
        spellCheck={false}
        disabled={disabled}
        aria-label={ariaLabel}
        aria-describedby={field?.describedBy}
        aria-invalid={invalid || undefined}
        aria-valuemin={min}
        aria-valuemax={max}
        aria-valuenow={parsedNow}
        aria-valuetext={value === null ? "Not set" : withUnit(show(value), unit)}
        placeholder={format.missing}
        value={shown}
        onChange={(e) => {
          setDraft(e.target.value);
          if (commit === "change") commitText(e.target.value);
        }}
        onBlur={() => {
          if (draft !== null && commitText(draft)) setDraft(null);
        }}
        onKeyDown={onKeyDown}
        className="min-w-0 flex-1 bg-transparent tabular-nums outline-none placeholder:text-muted-foreground disabled:cursor-not-allowed"
      />
      {unit && (
        <span aria-hidden className="ml-2 shrink-0 type-body-sm text-muted-foreground">
          {unit}
        </span>
      )}
    </div>
  );
}

/** Props for `Slider`. */
export type SliderProps = RangeProps & {
  value: number;
  onChange: (value: number) => void;
  /** Both limits are required: a slider with no ends is not a slider. */
  min: number;
  max: number;
  /** Replace the printed value with a `NumberField` beside the track, so an exact value can be typed. */
  editable?: boolean;
  /** Hide the printed value (when something else beside it already shows it). */
  hideValue?: boolean;
  /** Decimal places in the printed and spoken value. Default the places in `step`. */
  places?: number;
  disabled?: boolean;
  /** Names the slider when it is used without a `Field`. */
  "aria-label"?: string;
  id?: string;
  className?: string;
};

/** A range with its current value always printed beside it in words and unit, spoken as "40%"; `editable` adds a number field to type an exact value. Keyboard, touch and right-to-left are the platform's. */
export function Slider({
  value,
  onChange,
  min,
  max,
  step = 1,
  unit,
  locale = format.locale,
  editable = false,
  hideValue = false,
  places,
  disabled,
  id: idProp,
  className,
  "aria-label": ariaLabel,
}: SliderProps) {
  const { field } = useFieldControl();
  const numberId = React.useId();
  const digits = places ?? Math.max(decimalsOf(step), decimalsOf(min));
  const show = useNumberText(locale, digits);
  const span = max - min;
  const fill = span > 0 ? ((clamp(value, min, max) - min) / span) * 100 : 0;
  const text = withUnit(show(value), unit);
  return (
    <div className={cn("flex min-w-0 items-center gap-3", className)}>
      <input
        id={idProp ?? field?.id}
        type="range"
        min={min}
        max={max}
        step={step}
        value={clamp(value, min, max)}
        disabled={disabled}
        aria-label={ariaLabel}
        aria-describedby={field?.describedBy}
        aria-invalid={field?.invalid || undefined}
        aria-valuetext={text}
        onChange={(e) => onChange(roundTo(Number(e.target.value), digits))}
        style={{ "--fill": `${fill}%` } as React.CSSProperties}
        className="strata-range h-(--control-h) min-w-0 flex-1 cursor-pointer disabled:cursor-not-allowed disabled:opacity-50"
      />
      {editable ? (
        <NumberField id={numberId} className="w-28 shrink-0" aria-label={`${ariaLabel ?? field?.label ?? "Value"}, exact value`} value={value} onChange={(v) => v !== null && onChange(v)} min={min} max={max} step={step} unit={unit} locale={locale} places={digits} required disabled={disabled} />
      ) : (
        !hideValue && <output className="w-16 shrink-0 text-right type-body-sm tabular-nums text-foreground">{text}</output>
      )}
    </div>
  );
}

/** Props for `ColorField`. */
export type ColorFieldProps = {
  /** `#rrggbb`, or `null` when no colour is set. */
  value: string | null;
  /** Receives a valid `#rrggbb` (lower case) or `null` when cleared; never a half-typed value. */
  onChange: (value: string | null) => void;
  /** A short list the app suggests, as `#rrggbb`. Pressing one chooses it. */
  suggestions?: readonly string[];
  /** The colour this will be drawn on, `#rrggbb`: a note appears when the contrast would be low. */
  against?: string;
  /** What it is drawn on, in words: "the map". Completes the note. */
  againstLabel?: string;
  /** The lowest contrast ratio accepted before the note shows. Default 3, the WCAG minimum for graphics. */
  minContrast?: number;
  disabled?: boolean;
  "aria-label"?: string;
  id?: string;
  className?: string;
};

/** Choose a colour with the platform picker, see and type its hex value, pick from the app's suggestions, and get a note when it would be hard to see on `against`. A half-typed value is never passed on. */
export function ColorField({ value, onChange, suggestions, against, againstLabel = "the background", minContrast = 3, disabled, id: idProp, className, "aria-label": ariaLabel }: ColorFieldProps) {
  const { field, report } = useFieldControl();
  const [draft, setDraft] = React.useState<string | null>(null);
  const [own, setOwn] = React.useState(false);
  const text = draft ?? value ?? "";
  const ratio = value && against ? contrastRatio(value, against) : null;

  const commitText = (t: string): boolean => {
    if (t.trim() === "") {
      setOwn(false);
      report(undefined);
      if (value !== null) onChange(null);
      return true;
    }
    const hex = parseHex(t);
    if (!hex) {
      setOwn(true);
      report("Enter a colour like #1a7f64.");
      return false;
    }
    setOwn(false);
    report(undefined);
    if (hex !== value) onChange(hex);
    return true;
  };

  const pick = (hex: string) => {
    setDraft(null);
    setOwn(false);
    report(undefined);
    if (hex !== value) onChange(hex);
  };

  const invalid = field?.invalid || own;
  return (
    <div className={cn("grid min-w-0 gap-2", className)}>
      <div className={cn(box, "gap-2 px-2")} aria-invalid={invalid || undefined}>
        <span className="relative size-6 shrink-0 overflow-hidden rounded-control border border-input">
          {/* The swatch is the chosen colour itself: user content, not a theme role. */}
          <span aria-hidden className={cn("absolute inset-0", value === null && "bg-muted")} style={value ? { background: value } : undefined} />
          <input
            type="color"
            aria-label={ariaLabel ? `${ariaLabel}, picker` : "Colour picker"}
            value={value ?? "#000000"}
            disabled={disabled}
            onChange={(e) => pick(e.target.value)}
            className="absolute inset-0 size-full cursor-pointer opacity-0 disabled:cursor-not-allowed"
          />
        </span>
        <input
          id={idProp ?? field?.id}
          type="text"
          autoComplete="off"
          spellCheck={false}
          disabled={disabled}
          aria-label={ariaLabel}
          aria-describedby={field?.describedBy}
          aria-invalid={invalid || undefined}
          placeholder={format.missing}
          value={text}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={() => {
            if (draft !== null && commitText(draft)) setDraft(null);
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter" && draft !== null && commitText(draft)) setDraft(null);
            if (e.key === "Escape" && draft !== null) {
              setDraft(null);
              setOwn(false);
              report(undefined);
            }
          }}
          className="min-w-0 flex-1 bg-transparent tabular-nums outline-none placeholder:text-muted-foreground disabled:cursor-not-allowed"
        />
      </div>
      {suggestions && suggestions.length > 0 && (
        <div role="group" aria-label="Suggested colours" className="flex flex-wrap gap-1.5">
          {suggestions.map((hex) => (
            <button
              key={hex}
              type="button"
              disabled={disabled}
              aria-label={hex}
              aria-pressed={value === hex}
              onClick={() => pick(hex)}
              className="size-6 cursor-pointer rounded-control border border-input transition-state aria-pressed:outline-2 aria-pressed:outline-offset-2 aria-pressed:outline-foreground disabled:cursor-not-allowed disabled:opacity-50"
              style={{ background: hex }}
            />
          ))}
        </div>
      )}
      {ratio !== null && ratio < minContrast && (
        <p className="type-body-sm text-warning">
          Hard to see on {againstLabel}: contrast {format.decimal(ratio)}:1, aim for {format.decimal(minContrast)}:1 or more.
        </p>
      )}
    </div>
  );
}
