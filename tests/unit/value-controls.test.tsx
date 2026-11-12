import * as React from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { ColorField, Field, NumberField, Slider } from "../../src";
import { contrastRatio, decimalsOf, parseHex, parseNumber, stepValue } from "../../src/lib/number-input";

function Controlled({ initial, spy, ...props }: { initial: number | null; spy?: (v: number | null) => void } & Partial<React.ComponentProps<typeof NumberField>>) {
  const [value, setValue] = React.useState<number | null>(initial);
  return (
    <Field label="Volume" hint="Up to 500%. Over 100% makes it louder.">
      <NumberField value={value} onChange={(v) => { spy?.(v); setValue(v); }} min={0} max={500} unit="%" {...props} />
    </Field>
  );
}

describe("number-input", () => {
  it("parses in the locale and rejects what is not a number", () => {
    expect(parseNumber("1,234.5", "en-GB")).toEqual({ kind: "number", value: 1234.5 });
    expect(parseNumber("1.234,5", "de-DE")).toEqual({ kind: "number", value: 1234.5 });
    expect(parseNumber("12,5", "de-DE")).toEqual({ kind: "number", value: 12.5 });
    expect(parseNumber("40%", "en-GB", "%")).toEqual({ kind: "number", value: 40 });
    expect(parseNumber("−3", "en-GB")).toEqual({ kind: "number", value: -3 });
    expect(parseNumber("  ", "en-GB")).toEqual({ kind: "empty" });
    // wrong-locale or malformed grouping is refused, not read as a different magnitude
    for (const bad of ["12,5", "1.234,5", "1,,234", "12,34", ",5,", "1,23"]) expect(parseNumber(bad, "en-GB").kind).toBe("invalid");
    expect(parseNumber("12.5", "en-GB")).toEqual({ kind: "number", value: 12.5 });
    expect(parseNumber("1 234,5", "fr-FR")).toEqual({ kind: "number", value: 1234.5 });
    // a locale's own digits are read back
    expect(parseNumber(new Intl.NumberFormat("ar-EG").format(1234.5), "ar-EG")).toEqual({ kind: "number", value: 1234.5 });
    for (const bad of ["abc", "1e5", "12 34x", "--1", "1.2.3", "Infinity"]) expect(parseNumber(bad, "en-GB").kind).toBe("invalid");
  });

  it("steps on the grid without float drift and stays in the limits", () => {
    expect(stepValue(0.1, 1, 0.1)).toBe(0.2);
    expect(stepValue(0.7, 1, 0.1)).toBe(0.8);
    expect(stepValue(7, 1, 5, 0)).toBe(10);
    expect(stepValue(7, -1, 5, 0)).toBe(5);
    expect(stepValue(500, 1, 1, 0, 500)).toBe(500);
    expect(stepValue(null, 1, 1, 10, 20)).toBe(10);
    expect(stepValue(null, -1, 1, 10, 20)).toBe(20);
    expect(decimalsOf(0.25)).toBe(2);
    expect(decimalsOf(5)).toBe(0);
  });

  it("reads hex and measures contrast", () => {
    expect(parseHex("1A7F64")).toBe("#1a7f64");
    expect(parseHex("#abc")).toBe("#aabbcc");
    expect(parseHex("#12345")).toBeNull();
    expect(contrastRatio("#000000", "#ffffff")).toBeCloseTo(21, 0);
    expect(contrastRatio("#777777", "#808080")).toBeLessThan(1.2);
  });
});

describe("NumberField", () => {
  it("is a spinbutton with its unit in the spoken value, inside a Field", () => {
    render(<Controlled initial={40} />);
    const input = screen.getByRole("spinbutton", { name: "Volume" });
    expect(input).toHaveValue("40");
    expect(input).toHaveAttribute("aria-valuetext", "40%");
    expect(input).toHaveAttribute("aria-valuemax", "500");
    expect(input).toHaveAccessibleDescription("Up to 500%. Over 100% makes it louder.");
  });

  it("commits a typed value on Enter and on blur, not on every keystroke", async () => {
    const user = userEvent.setup();
    const spy = vi.fn();
    render(<Controlled initial={40} spy={spy} />);
    const input = screen.getByRole("spinbutton");
    await user.clear(input);
    await user.type(input, "250");
    expect(spy).not.toHaveBeenCalledWith(250);
    await user.keyboard("{Enter}");
    expect(spy).toHaveBeenLastCalledWith(250);
    expect(input).toHaveValue("250");
    await user.clear(input);
    await user.type(input, "300");
    await user.tab();
    expect(spy).toHaveBeenLastCalledWith(300);
  });

  it("follows every keystroke with commit=change", async () => {
    const user = userEvent.setup();
    const spy = vi.fn();
    render(<Controlled initial={null} spy={spy} commit="change" />);
    await user.type(screen.getByRole("spinbutton"), "42");
    expect(spy.mock.calls.map((c) => c[0])).toEqual([4, 42]);
  });

  it("explains an out-of-range or non-numeric entry in the Field and does not call back", async () => {
    const user = userEvent.setup();
    const spy = vi.fn();
    render(<Controlled initial={40} spy={spy} />);
    const input = screen.getByRole("spinbutton");
    await user.clear(input);
    await user.type(input, "600{Enter}");
    expect(spy).not.toHaveBeenCalled();
    expect(input).toHaveValue("600");
    expect(input).toBeInvalid();
    expect(screen.getByText("Enter a value from 0% to 500%.")).toBeInTheDocument();
    expect(input).toHaveAccessibleDescription(/Enter a value from 0% to 500%\./);
    await user.clear(input);
    await user.type(input, "abc");
    await user.tab();
    expect(spy).not.toHaveBeenCalled();
    expect(screen.getByText("Enter a value from 0% to 500%.")).toBeInTheDocument();
    await user.clear(input);
    await user.type(input, "75{Enter}");
    expect(spy).toHaveBeenCalledWith(75);
    expect(screen.queryByText("Enter a value from 0% to 500%.")).toBeNull();
    expect(input).toBeValid();
  });

  it("checks the limits on what was typed, before rounding", async () => {
    const user = userEvent.setup();
    const spy = vi.fn();
    render(<Controlled initial={40} spy={spy} />);
    const input = screen.getByRole("spinbutton");
    await user.clear(input);
    await user.type(input, "500.4{Enter}");
    expect(spy).not.toHaveBeenCalled();
    expect(screen.getByText("Enter a value from 0% to 500%.")).toBeInTheDocument();
    await user.clear(input);
    await user.type(input, "-0.4{Enter}");
    expect(spy).not.toHaveBeenCalled();
  });

  it("escape drops a bad entry and restores the value", async () => {
    const user = userEvent.setup();
    render(<Controlled initial={40} />);
    const input = screen.getByRole("spinbutton");
    await user.clear(input);
    await user.type(input, "999{Enter}");
    await user.keyboard("{Escape}");
    expect(input).toHaveValue("40");
    expect(screen.queryByText(/Enter a value/)).toBeNull();
  });

  it("keeps an empty field as null and shows the missing mark, never 0 or NaN", async () => {
    const user = userEvent.setup();
    const spy = vi.fn();
    render(<Controlled initial={40} spy={spy} />);
    const input = screen.getByRole("spinbutton");
    await user.clear(input);
    await user.keyboard("{Enter}");
    expect(spy).toHaveBeenCalledWith(null);
    expect(input).toHaveValue("");
    expect(input).toHaveAttribute("placeholder", "–");
    expect(input).toHaveAttribute("aria-valuetext", "Not set");
    expect(input).not.toHaveAttribute("aria-valuenow");
  });

  it("a required field refuses empty", async () => {
    const user = userEvent.setup();
    const spy = vi.fn();
    render(<Controlled initial={40} spy={spy} required />);
    const input = screen.getByRole("spinbutton");
    await user.clear(input);
    await user.keyboard("{Enter}");
    expect(spy).not.toHaveBeenCalled();
    expect(screen.getByText("Enter a value.")).toBeInTheDocument();
  });

  it("steps with arrows, takes the large step on Shift and PageUp, and jumps with Home and End", async () => {
    const user = userEvent.setup();
    render(<Controlled initial={40} />);
    const input = screen.getByRole("spinbutton");
    input.focus();
    await user.keyboard("{ArrowUp}");
    expect(input).toHaveValue("41");
    await user.keyboard("{Shift>}{ArrowUp}{/Shift}");
    expect(input).toHaveValue("50"); // the large step lands on its own grid (multiples of 10)
    await user.keyboard("{PageDown}");
    expect(input).toHaveValue("40");
    await user.keyboard("{End}");
    expect(input).toHaveValue("500");
    await user.keyboard("{ArrowUp}");
    expect(input).toHaveValue("500");
    await user.keyboard("{Home}");
    expect(input).toHaveValue("0");
    await user.keyboard("{ArrowDown}");
    expect(input).toHaveValue("0");
  });

  it("starts stepping from the minimum when empty", async () => {
    const user = userEvent.setup();
    render(<Controlled initial={null} min={10} />);
    const input = screen.getByRole("spinbutton");
    input.focus();
    await user.keyboard("{ArrowUp}");
    expect(input).toHaveValue("10");
  });

  it("uses the locale's digits and decimal mark, and reads them back", async () => {
    const user = userEvent.setup();
    const spy = vi.fn();
    render(<Controlled initial={1234.5} spy={spy} locale="de-DE" step={0.5} max={5000} unit="ms" />);
    const input = screen.getByRole("spinbutton");
    expect(input).toHaveValue("1.234,5");
    await user.clear(input);
    await user.type(input, "2.000,5{Enter}");
    expect(spy).toHaveBeenLastCalledWith(2000.5);
  });

  it("does not step or commit when disabled", async () => {
    const user = userEvent.setup();
    const spy = vi.fn();
    render(<Controlled initial={40} spy={spy} disabled />);
    await user.type(screen.getByRole("spinbutton"), "{ArrowUp}");
    expect(spy).not.toHaveBeenCalled();
  });
});

describe("Slider", () => {
  it("is a range that speaks its value with the unit and prints it beside the track", () => {
    render(
      <Field label="Rotation">
        <Slider value={90} onChange={() => {}} min={0} max={360} unit="°" />
      </Field>,
    );
    const range = screen.getByRole("slider", { name: "Rotation" });
    expect(range).toHaveAttribute("aria-valuetext", "90°");
    expect(range).toHaveAttribute("min", "0");
    expect(range).toHaveAttribute("max", "360");
    expect(screen.getByText("90°")).toBeInTheDocument();
  });

  it("reports changes as rounded numbers and prints decimals in the locale", () => {
    const spy = vi.fn();
    render(<Slider aria-label="Tolerance" value={0.0005} onChange={spy} min={0} max={0.001} step={0.0001} locale="de-DE" />);
    expect(screen.getByRole("slider")).toHaveAttribute("aria-valuetext", "0,0005");
    fireEvent.change(screen.getByRole("slider"), { target: { value: "0.0007" } });
    expect(spy).toHaveBeenCalledWith(0.0007);
  });

  it("with editable, the two inputs have different ids and the number is named for the field", () => {
    render(
      <Field label="Opacity">
        <Slider value={40} onChange={() => {}} min={0} max={100} unit="%" editable />
      </Field>,
    );
    const range = screen.getByRole("slider", { name: "Opacity" });
    const number = screen.getByRole("spinbutton", { name: "Opacity, exact value" });
    expect(range.id).toBeTruthy();
    expect(number.id).toBeTruthy();
    expect(number.id).not.toBe(range.id);
  });

  it("with editable, an exact value can be typed beside it, and out-of-range is refused", async () => {
    const user = userEvent.setup();
    const spy = vi.fn();
    render(<Slider aria-label="Opacity" value={40} onChange={spy} min={0} max={100} unit="%" editable />);
    const number = screen.getByRole("spinbutton", { name: "Opacity, exact value" });
    await user.clear(number);
    await user.type(number, "150{Enter}");
    expect(spy).not.toHaveBeenCalled();
    await user.clear(number);
    await user.type(number, "55{Enter}");
    expect(spy).toHaveBeenCalledWith(55);
  });
});

describe("ColorField", () => {
  function Colour(props: Partial<React.ComponentProps<typeof ColorField>> & { spy?: (v: string | null) => void; initial?: string | null }) {
    const [value, setValue] = React.useState<string | null>(props.initial ?? "#1a7f64");
    return (
      <Field label="Line colour">
        <ColorField value={value} onChange={(v) => { props.spy?.(v); setValue(v); }} {...props} />
      </Field>
    );
  }

  it("shows the value, accepts typed hex in any common form and normalises it", async () => {
    const user = userEvent.setup();
    const spy = vi.fn();
    render(<Colour spy={spy} />);
    const input = screen.getByRole("textbox", { name: "Line colour" });
    expect(input).toHaveValue("#1a7f64");
    await user.clear(input);
    await user.type(input, "ABC{Enter}");
    expect(spy).toHaveBeenLastCalledWith("#aabbcc");
    expect(input).toHaveValue("#aabbcc");
  });

  it("refuses half a colour with a message in the Field and no callback", async () => {
    const user = userEvent.setup();
    const spy = vi.fn();
    render(<Colour spy={spy} />);
    const input = screen.getByRole("textbox", { name: "Line colour" });
    await user.clear(input);
    await user.type(input, "#12{Enter}");
    expect(spy).not.toHaveBeenCalled();
    expect(screen.getByText("Enter a colour like #1a7f64.")).toBeInTheDocument();
    expect(input).toBeInvalid();
  });

  it("clears to null and shows the missing mark", async () => {
    const user = userEvent.setup();
    const spy = vi.fn();
    render(<Colour spy={spy} />);
    const input = screen.getByRole("textbox");
    await user.clear(input);
    await user.tab();
    expect(spy).toHaveBeenCalledWith(null);
    expect(input).toHaveAttribute("placeholder", "–");
  });

  it("chooses from suggestions and from the platform picker", async () => {
    const user = userEvent.setup();
    const spy = vi.fn();
    render(<Colour spy={spy} suggestions={["#c2410c", "#0e7490"]} />);
    await user.click(screen.getByRole("button", { name: "#c2410c" }));
    expect(spy).toHaveBeenLastCalledWith("#c2410c");
    expect(screen.getByRole("button", { name: "#c2410c" })).toHaveAttribute("aria-pressed", "true");
    fireEvent.change(screen.getByLabelText("Colour picker"), { target: { value: "#112233" } });
    expect(spy).toHaveBeenLastCalledWith("#112233");
  });

  it("warns when the colour would be hard to see on what it is drawn on", () => {
    const { rerender } = render(<ColorField aria-label="Route" value="#777777" onChange={() => {}} against="#808080" againstLabel="the map" />);
    expect(screen.getByText(/Hard to see on the map/)).toBeInTheDocument();
    rerender(<ColorField aria-label="Route" value="#000000" onChange={() => {}} against="#ffffff" againstLabel="the map" />);
    expect(screen.queryByText(/Hard to see/)).toBeNull();
  });
});
