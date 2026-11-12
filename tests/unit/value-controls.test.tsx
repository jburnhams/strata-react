import * as React from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { ColorField, Field, NumberField, Slider } from "../../src";
import { contrastRatio, parseHex } from "../../src/lib/number-input";

function Controlled({ initial, spy, ...props }: { initial: number | null; spy?: (v: number | null) => void } & Partial<React.ComponentProps<typeof NumberField>>) {
  const [value, setValue] = React.useState<number | null>(initial);
  return (
    <Field label="Volume" hint="Up to 500%. Over 100% makes it louder.">
      <NumberField value={value} onChange={(v) => { spy?.(v); setValue(v); }} min={0} max={500} unit="%" {...props} />
    </Field>
  );
}

describe("colour rules", () => {
  it("reads hex and measures contrast", () => {
    expect(parseHex("1A7F64")).toBe("#1a7f64");
    expect(parseHex("#abc")).toBe("#aabbcc");
    expect(parseHex("#12345")).toBeNull();
    expect(contrastRatio("#000000", "#ffffff")).toBeCloseTo(21, 0);
    expect(contrastRatio("#777777", "#808080")).toBeLessThan(1.2);
  });
});

describe("NumberField", () => {
  it("is labelled by its Field, with the hint and the spoken unit as its description", () => {
    render(<Controlled initial={40} />);
    const input = screen.getByRole("textbox", { name: "Volume" });
    expect(input).toHaveValue("40");
    expect(input).toHaveAccessibleDescription(/Up to 500%\. Over 100% makes it louder\./);
    expect(input).toHaveAccessibleDescription(/percent/);
  });

  it("commits a typed value on Enter and on blur, not on every keystroke", async () => {
    const user = userEvent.setup();
    const spy = vi.fn();
    render(<Controlled initial={40} spy={spy} />);
    const input = screen.getByRole("textbox");
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

  it("keeps an out-of-range entry on screen, explains it in the Field and does not call back; a good one clears it", async () => {
    const user = userEvent.setup();
    const spy = vi.fn();
    render(<Controlled initial={40} spy={spy} places={1} />);
    const input = screen.getByRole("textbox");
    await user.clear(input);
    await user.type(input, "600{Enter}");
    expect(spy).not.toHaveBeenCalled();
    expect(input).toHaveValue("600");
    expect(input).toBeInvalid();
    expect(screen.getByText("Enter a value from 0% to 500%.")).toBeInTheDocument();
    expect(input).toHaveAccessibleDescription(/Enter a value from 0% to 500%\./);
    await user.clear(input);
    await user.type(input, "500.4{Enter}"); // checked as typed, not after rounding
    expect(spy).not.toHaveBeenCalled();
    expect(input).toHaveValue("500.4");
    await user.clear(input);
    await user.type(input, "75{Enter}");
    expect(spy).toHaveBeenCalledWith(75);
    expect(screen.queryByText("Enter a value from 0% to 500%.")).toBeNull();
    expect(input).toBeValid();
  });

  it("follows the value when the screen changes it", () => {
    const { rerender } = render(<NumberField aria-label="Volume" value={40} onChange={() => {}} />);
    expect(screen.getByRole("textbox")).toHaveValue("40");
    rerender(<NumberField aria-label="Volume" value={75} onChange={() => {}} />);
    expect(screen.getByRole("textbox")).toHaveValue("75");
  });

  it("keeps an empty field as null and shows the missing mark, never 0 or NaN", async () => {
    const user = userEvent.setup();
    const spy = vi.fn();
    render(<Controlled initial={40} spy={spy} />);
    const input = screen.getByRole("textbox");
    await user.clear(input);
    await user.keyboard("{Enter}");
    expect(spy).toHaveBeenCalledWith(null);
    expect(input).toHaveValue("");
    expect(input).toHaveAttribute("placeholder", "–");
  });

  it("a required field refuses empty", async () => {
    const user = userEvent.setup();
    const spy = vi.fn();
    render(<Controlled initial={40} spy={spy} required />);
    const input = screen.getByRole("textbox");
    await user.clear(input);
    await user.keyboard("{Enter}");
    expect(spy).not.toHaveBeenCalled();
    expect(screen.getByText("Enter a value.")).toBeInTheDocument();
  });

  it("steps with arrows and jumps with Home and End, stopping at the limits", async () => {
    const user = userEvent.setup();
    render(<Controlled initial={40} />);
    const input = screen.getByRole("textbox");
    input.focus();
    await user.keyboard("{ArrowUp}");
    expect(input).toHaveValue("41");
    await user.keyboard("{ArrowDown}{ArrowDown}");
    expect(input).toHaveValue("39");
    await user.keyboard("{End}");
    expect(input).toHaveValue("500");
    await user.keyboard("{ArrowUp}");
    expect(input).toHaveValue("500");
    await user.keyboard("{Home}");
    expect(input).toHaveValue("0");
    await user.keyboard("{ArrowDown}");
    expect(input).toHaveValue("0");
  });

  it("uses the locale's digits and decimal mark, and reads them back", async () => {
    const user = userEvent.setup();
    const spy = vi.fn();
    render(<Controlled initial={1234.5} spy={spy} locale="de-DE" step={0.5} max={5000} unit="ms" />);
    const input = screen.getByRole("textbox");
    expect(input).toHaveValue("1.234,5");
    await user.clear(input);
    await user.type(input, "2.000,5{Enter}");
    expect(spy).toHaveBeenLastCalledWith(2000.5);
  });

  it("does not step or commit when disabled", async () => {
    const user = userEvent.setup();
    const spy = vi.fn();
    render(<Controlled initial={40} spy={spy} disabled />);
    await user.type(screen.getByRole("textbox"), "{ArrowUp}");
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
    const number = screen.getByRole("textbox", { name: "Opacity, exact value" });
    expect(range.id).toBeTruthy();
    expect(number.id).toBeTruthy();
    expect(number.id).not.toBe(range.id);
  });

  it("with editable, an exact value can be typed beside it, and out-of-range is refused", async () => {
    const user = userEvent.setup();
    const spy = vi.fn();
    render(<Slider aria-label="Opacity" value={40} onChange={spy} min={0} max={100} unit="%" editable />);
    const number = screen.getByRole("textbox", { name: "Opacity, exact value" });
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
