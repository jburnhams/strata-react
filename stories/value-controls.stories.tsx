import * as React from "react";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { ColorField, Field, NumberField, Slider } from "../src";

// Controls for setting a number or a colour precisely. A value that is not known is `null` and
// shows an en dash; a typed value outside the limits is explained under the control and is never
// passed on. The unit sits inside the control and is spoken with the value.

const meta = { title: "Form/Value controls", parameters: { layout: "padded" } } satisfies Meta;
export default meta;
type Story = StoryObj<typeof meta>;

function NumberDemo({ initial = 40, ...props }: { initial?: number | null } & Partial<React.ComponentProps<typeof NumberField>>) {
  const [v, setV] = React.useState<number | null>(initial);
  return <NumberField value={v} onChange={setV} {...props} />;
}

function Range({ initial = 40, ...props }: { initial?: number } & Partial<React.ComponentProps<typeof Slider>>) {
  const [v, setV] = React.useState(initial);
  return <Slider value={v} onChange={setV} min={0} max={100} {...props} />;
}

function Colour({ initial = "#1a7f64", ...props }: { initial?: string | null } & Partial<React.ComponentProps<typeof ColorField>>) {
  const [v, setV] = React.useState<string | null>(initial);
  return <ColorField value={v} onChange={setV} {...props} />;
}

/** Number fields with a unit, a hint that explains the limit before it is hit, and tabular figures. */
export const NumberFields: Story = {
  render: () => (
    <div className="grid max-w-sm gap-5">
      <Field label="Volume" hint="Up to 500%. Over 100% makes it louder.">
        <NumberDemo initial={120} min={0} max={500} unit="%" />
      </Field>
      <Field label="Video bitrate">
        <NumberDemo initial={8} min={1} max={50} step={0.5} unit="Mbps" />
      </Field>
      <Field label="Width">
        <NumberDemo initial={1920} min={16} max={7680} unit="px" />
      </Field>
    </div>
  ),
};

/** At the limits the arrow keys stop; a value that is not known shows the missing mark rather than 0. */
export const LimitsAndMissing: Story = {
  render: () => (
    <div className="grid max-w-sm gap-5">
      <Field label="Rotation" hint="−180° to 180°.">
        <NumberDemo initial={180} min={-180} max={180} unit="°" />
      </Field>
      <Field label="Sync offset">
        <NumberDemo initial={null} unit="ms" />
      </Field>
    </div>
  ),
};

/** An entry outside the limits is explained under the control by the screen or the control itself. */
export const WithError: Story = {
  render: () => (
    <div className="grid max-w-sm gap-5">
      <Field label="Volume" hint="Up to 500%." error="Enter a value from 0% to 500%.">
        <NumberDemo initial={600} min={0} max={500} unit="%" />
      </Field>
      <Field label="Line colour" error="Enter a colour like #1a7f64.">
        <Colour initial={null} />
      </Field>
    </div>
  ),
};

export const Disabled: Story = {
  render: () => (
    <div className="grid max-w-sm gap-5">
      <Field label="Volume">
        <NumberDemo initial={40} min={0} max={500} unit="%" disabled />
      </Field>
      <Field label="Opacity">
        <Range initial={40} unit="%" disabled />
      </Field>
    </div>
  ),
};

/** The current value is always printed beside the track with its unit; `editable` swaps it for a number field. */
export const Sliders: Story = {
  render: () => (
    <div className="grid max-w-md gap-5">
      <Field label="Opacity">
        <Range initial={40} unit="%" />
      </Field>
      <Field label="Rotation">
        <Range initial={90} min={0} max={360} step={5} unit="°" />
      </Field>
      <Field label="GPX simplification" hint="Higher removes more points.">
        <Range initial={0.0004} min={0} max={0.001} step={0.0001} />
      </Field>
      <Field label="Master volume" hint="Type an exact value if the slider is too coarse.">
        <Range initial={65} unit="%" editable />
      </Field>
    </div>
  ),
};

export const SliderLimits: Story = {
  render: () => (
    <div className="grid max-w-md gap-5">
      <Field label="Zoom at minimum">
        <Range initial={10} min={10} max={200} unit="px" />
      </Field>
      <Field label="Zoom at maximum">
        <Range initial={200} min={10} max={200} unit="px" />
      </Field>
    </div>
  ),
};

/** A raw hex value is right here: the colour is the person's content. The swatch opens the platform picker. */
export const Colours: Story = {
  render: () => (
    <div className="grid max-w-sm gap-5">
      <Field label="Line colour">
        <Colour initial="#c2410c" suggestions={["#c2410c", "#0e7490", "#4d7c0f", "#a21caf"]} />
      </Field>
      <Field label="Marker colour" hint="Drawn on the map.">
        <Colour initial="#d9d6cf" against="#e5e2dc" againstLabel="the map" />
      </Field>
      <Field label="Background colour">
        <Colour initial={null} />
      </Field>
    </div>
  ),
};

/** Compact density: every control follows `--control-h`. */
export const Compact: Story = {
  decorators: [(Story) => <div data-density="compact"><Story /></div>],
  render: () => (
    <div className="grid max-w-sm gap-5">
      <Field label="Volume">
        <NumberDemo initial={120} min={0} max={500} unit="%" />
      </Field>
      <Field label="Opacity">
        <Range initial={40} unit="%" editable />
      </Field>
      <Field label="Line colour">
        <Colour initial="#0e7490" suggestions={["#c2410c", "#0e7490"]} />
      </Field>
    </div>
  ),
};

export const Phone: Story = {
  tags: ["visual-phone"],
  render: () => (
    <div className="grid gap-5">
      <Field label="Volume" hint="Up to 500%. Over 100% makes it louder.">
        <NumberDemo initial={120} min={0} max={500} unit="%" />
      </Field>
      <Field label="Opacity">
        <Range initial={40} unit="%" editable />
      </Field>
      <Field label="Line colour">
        <Colour initial="#0e7490" suggestions={["#c2410c", "#0e7490", "#4d7c0f"]} />
      </Field>
    </div>
  ),
};
