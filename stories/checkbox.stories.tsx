import * as React from "react";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { Checkbox } from "../src";

const meta = {
  title: "Form/Checkbox",
  component: Checkbox,
  args: { label: "Glaze the foot ring", checked: false, onCheckedChange: () => undefined },
} satisfies Meta<typeof Checkbox>;
export default meta;
type Story = StoryObj<typeof meta>;

/** The box and its label are one target. Unchecked, checked, mixed (a select-all over part of a list), disabled, with a detail line, and label hidden (named by aria-label). */
export const States: Story = {
  render: () => (
    <div className="grid max-w-md justify-items-start gap-3">
      <Checkbox label="Glaze the foot ring" checked={false} onCheckedChange={() => undefined} />
      <Checkbox label="Wax resist on the base" checked onCheckedChange={() => undefined} />
      <Checkbox label="Select all shown" checked="mixed" onCheckedChange={() => undefined} />
      <Checkbox label="Fire with the lid on" checked={false} disabled onCheckedChange={() => undefined} />
      <Checkbox
        label="Email me when it is out"
        detail="Sent when the kiln is below 60 °C."
        checked
        onCheckedChange={() => undefined}
      />
      <Checkbox label="Select Tom Ellery" hideLabel checked onCheckedChange={() => undefined} />
    </div>
  ),
};

function Live() {
  const [on, setOn] = React.useState(false);
  return <Checkbox label="Email me when it is out" checked={on} onCheckedChange={setOn} />;
}

export const Interactive: Story = { tags: ["no-visual"], render: () => <Live /> };
