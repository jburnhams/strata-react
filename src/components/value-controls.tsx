import * as React from "react";
import {
  I18nProvider,
  Input as AriaInput,
  NumberField as AriaNumberField,
  Slider as AriaSlider,
  SliderOutput,
  SliderThumb,
  SliderTrack,
} from "react-aria-components";
import { useFieldControl } from "./field";
import { NBSP, format } from "../lib/format";
import { contrastRatio, parseHex } from "../lib/number-input";
import { cn } from "../lib/utils";
import { controlHeight, type ControlSize } from "../lib/control";

// Controls for setting a number or a colour precisely (strata-react issue #73, from moving
// strata-vid onto Strata: opacity, rotation, volume, bitrate, a line colour). The native ones fail
// in the same few ways, and each rule below answers one:
//
// - `parseFloat(e.target.value)` turns an empty field into NaN. Here a value that is not known is
//   `null`, stays `null`, and prints `format.missing`; a typed value outside the limits is NOT
//   clamped and NOT passed on: React Aria's field runs with `commitBehavior="validate"` (it keeps
//   what was typed instead of snapping 600 to 500), and the control tells the surrounding `Field`
//   what is wrong ("Enter a value from 0% to 500%."), the same place a server's 422 appears. The
//   callback only ever receives a number inside the limits, or null.
// - The unit lives inside the control, muted. A slider's spoken value carries it ("40%", "90°")
//   when `Intl` knows the unit (percent, degree, millisecond, megabit-per-second and the like):
//   React Aria builds `aria-valuetext` from an `Intl.NumberFormat`, so "px" or "steps" are in the
//   printed value and the label but cannot be in the spoken one.
// - Digits are the locale's: what is printed and what is read back go through `Intl` (React Aria's
//   `NumberParser`), so 12,5 works in a de-DE app, and the message is in the same digits.
// - Behaviour is React Aria's: arrows step, PageUp/PageDown take ten steps, Home/End jump to the
//   limits, a field commits on Enter and blur. Nothing animates when a value changes: these are
//   dragged and stepped dozens of times a minute (character.md, the frequency budget).
// - A colour a person picks for their own content (a route's line) is content, not theme, so it is
//   the one place a raw colour value is right; `against` checks it against what it is drawn on.
//   The colour field's text box is ours: React Aria's colour field puts the old colour back when
//   the text is not a colour, where this one says so under the control; the swatch opens the
//   platform picker.

const box =
  "flex w-full min-w-0 items-center rounded-control border border-input bg-background px-3 type-body text-foreground transition-state disabled:cursor-not-allowed disabled:bg-muted disabled:opacity-70 has-[input:disabled]:cursor-not-allowed has-[input:disabled]:bg-muted has-[input:disabled]:opacity-70 aria-invalid:border-danger has-[input:focus-visible]:outline-2 has-[input:focus-visible]:outline-offset-2 has-[input:focus-visible]:outline-ring";

/** A number with its unit joined by a non-breaking space; `%` and `°` stay attached. */
function withUnit(text: string, unit?: string) {
  if (!unit) return text;
  return unit === "%" || unit === "°" ? text + unit : text + NBSP + unit;
}

// Units `Intl` can speak, by the symbol an app prints. Anything else is printed but not spoken.
const intlUnits: Record<string, string> = {
  "%": "percent",
  "°": "degree",
  ms: "millisecond",
  s: "second",
  kB: "kilobyte",
  MB: "megabyte",
  GB: "gigabyte",
  kbps: "kilobit-per-second",
  Mbps: "megabit-per-second",
};

function decimalsOf(n: number): number {
  const s = String(n);
  if (s.includes("e-")) return Number(s.split("e-")[1]) + (s.split("e-")[0].split(".")[1]?.length ?? 0);
  return s.split(".")[1]?.length ?? 0;
}

function useNumberText(locale: string, places: number) {
  return React.useMemo(() => {
    const f = new Intl.NumberFormat(locale, { maximumFractionDigits: places, minimumFractionDigits: 0 });
    return (n: number) => f.format(n);
  }, [locale, places]);
}

function formatOptionsFor(places: number, unit?: string): Intl.NumberFormatOptions {
  const base: Intl.NumberFormatOptions = { maximumFractionDigits: places, minimumFractionDigits: 0 };
  const known = unit ? intlUnits[unit] : undefined;
  return known ? { ...base, style: "unit", unit: known, unitDisplay: "narrow" } : base;
}

/** Props shared by the number field and the slider. */
export type RangeProps = {
  min?: number;
  max?: number;
  /** The size of one arrow-key step. Default 1. */
  step?: number;
  /** The unit shown with the value: "%", "°", "Mbps", "px". Spoken too when `Intl` has it (%, °, ms, s, kB, MB, GB, kbps, Mbps). */
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
  /** Decimal places to show and keep. Default the places in `step` (and `min`). */
  places?: number;
  /** An empty field is an error ("Enter a value.") rather than `null`. */
  required?: boolean;
  disabled?: boolean;
  /** Names the control when it is used without a `Field`. */
  "aria-label"?: string;
  id?: string;
  name?: string;
  /** `sm` is --control-h-sm, the height of a small `Toggle` or `IconButton` beside it. Default --control-h. */
  size?: ControlSize;
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

/** A number with a unit on React Aria's number field: typed input is validated, not clamped, so an out-of-range value is explained in the surrounding `Field` and never passed on; empty stays `null`. */
export function NumberField({
  value,
  onChange,
  min,
  max,
  step = 1,
  places,
  unit,
  locale = format.locale,
  required = false,
  disabled,
  id: idProp,
  name,
  size = "default",
  className,
  "aria-label": ariaLabel,
}: NumberFieldProps) {
  const { field, report } = useFieldControl();
  const digits = places ?? Math.max(decimalsOf(step), min === undefined ? 0 : decimalsOf(min));
  const show = useNumberText(locale, digits);
  const [own, setOwn] = React.useState(false); // invalid, when there is no Field to say so
  const unitId = React.useId();
  // What the field shows. It follows `value`, but also holds an entry we refused, so the person sees
  // (and can correct) what they typed instead of the field snapping back to the old value.
  const [local, setLocal] = React.useState<number>(value ?? Number.NaN);
  const [seen, setSeen] = React.useState(value);
  if (seen !== value) {
    setSeen(value);
    setLocal(value ?? Number.NaN);
  }

  const fail = (message: string) => {
    setOwn(true);
    report(message);
  };
  const ok = () => {
    setOwn(false);
    report(undefined);
  };

  const handle = (n: number) => {
    setLocal(n);
    if (Number.isNaN(n)) {
      if (required) return fail("Enter a value.");
      ok();
      if (value !== null) onChange(null);
      return;
    }
    if ((min !== undefined && n < min) || (max !== undefined && n > max)) return fail(describeRange(min, max, show, unit));
    ok();
    if (n !== value) onChange(n);
  };

  const invalid = field?.invalid || own;
  return (
    <I18nProvider locale={locale}>
      <AriaNumberField
        value={local}
        onChange={handle}
        minValue={min}
        maxValue={max}
        step={step}
        formatOptions={{ maximumFractionDigits: digits, minimumFractionDigits: 0 }}
        commitBehavior="validate"
        isDisabled={disabled}
        isInvalid={invalid || undefined}
        name={name}
        aria-label={ariaLabel ?? field?.label}
        className={cn(box, controlHeight[size], className)}
      >
        <AriaInput
          id={idProp ?? field?.id}
          placeholder={format.missing}
          aria-describedby={[field?.describedBy, unit ? unitId : undefined].filter(Boolean).join(" ") || undefined}
          className="min-w-0 flex-1 bg-transparent tabular-nums outline-none placeholder:text-muted-foreground disabled:cursor-not-allowed"
        />
        {unit && (
          <span id={unitId} className="ml-2 shrink-0 type-body-sm text-muted-foreground">
            <span aria-hidden>{unit}</span>
            <span className="sr-only">{intlUnits[unit] ? intlUnits[unit].replace(/-/g, " ") : unit}</span>
          </span>
        )}
      </AriaNumberField>
    </I18nProvider>
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
  className?: string;
};

/** A slider on React Aria with its current value always printed beside the track (and spoken with the unit when `Intl` knows it); `editable` adds a number field to type an exact value. */
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
  className,
  "aria-label": ariaLabel,
}: SliderProps) {
  const { field } = useFieldControl();
  const digits = places ?? Math.max(decimalsOf(step), decimalsOf(min));
  const show = useNumberText(locale, digits);
  const name = ariaLabel ?? field?.label ?? "Value";
  const text = withUnit(show(value), unit);
  return (
    <I18nProvider locale={locale}>
      <AriaSlider
        value={value}
        onChange={(v) => onChange(v as number)}
        minValue={min}
        maxValue={max}
        step={step}
        formatOptions={formatOptionsFor(digits, unit)}
        isDisabled={disabled}
        aria-label={name}
        aria-describedby={field?.describedBy}
        className={cn("flex min-w-0 items-center gap-3", className)}
      >
        <SliderTrack className="relative flex h-(--control-h) min-w-0 flex-1 cursor-pointer items-center disabled:cursor-not-allowed disabled:opacity-50">
          {({ state }) => (
            <>
              <span aria-hidden className="absolute inset-x-0 h-1.5 rounded-pill bg-muted" />
              <span aria-hidden className="absolute left-0 h-1.5 rounded-pill bg-primary" style={{ width: `${state.getThumbPercent(0) * 100}%` }} />
              <SliderThumb className="top-1/2 size-5 rounded-pill border-2 border-primary bg-background focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring" />
            </>
          )}
        </SliderTrack>
        {editable ? (
          <NumberField className="w-28 shrink-0" aria-label={`${name}, exact value`} value={value} onChange={(v) => v !== null && onChange(v)} min={min} max={max} step={step} unit={unit} locale={locale} places={digits} required disabled={disabled} />
        ) : (
          !hideValue && (
            <SliderOutput aria-hidden className="w-16 shrink-0 text-right type-body-sm tabular-nums text-foreground">
              {text}
            </SliderOutput>
          )
        )}
      </AriaSlider>
    </I18nProvider>
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
  // Named for the `aria-label` or, failing that, the surrounding Field's label, so two colour fields in one panel never share a name (issue #116).
  const label = ariaLabel ?? field?.label;
  const pickerName = label ? `${label}, picker` : "Colour picker";
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
      <div className={cn(box, controlHeight.default, "gap-2 px-2")} aria-invalid={invalid || undefined}>
        <span className="relative size-6 shrink-0 overflow-hidden rounded-control border border-input">
          {/* The swatch is the chosen colour itself: user content, not a theme role. */}
          <span aria-hidden className={cn("absolute inset-0", value === null && "bg-muted")} style={value ? { background: value } : undefined} />
          <input
            type="color"
            aria-label={pickerName}
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
