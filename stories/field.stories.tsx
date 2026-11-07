import * as React from "react";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { ChoiceGroup, Field, Input, NativeSelect, Textarea } from "../src";

const meta = { title: "Form/Field", component: Field, args: { label: "Pieces", children: null } } satisfies Meta<typeof Field>;
export default meta;
type Story = StoryObj<typeof meta>;

/** Field wires the label, hint, error, aria-describedby and aria-invalid into its control. */
export const States: Story = {
  render: () => (
    <div className="grid max-w-md gap-6">
      <Field label="Pieces" hint="Up to 20 per booking.">
        <Input name="pieces" inputMode="numeric" defaultValue="6" />
      </Field>
      <Field
        label="Tallest piece (cm)"
        hint="Kiln 1 has 45 cm between shelves, kiln 2 has 30 cm."
        error="Kiln 2's shelves are 30 cm apart, and your tallest piece is 38 cm. Choose kiln 1, which takes up to 45 cm."
      >
        <Input name="tallest" inputMode="numeric" defaultValue="38" />
      </Field>
      <Field label="Kiln">
        <NativeSelect name="kiln" defaultValue="2">
          <option value="1">Kiln 1, large electric</option>
          <option value="2">Kiln 2, small electric</option>
        </NativeSelect>
      </Field>
      <Field label="Notes for whoever loads the kiln" hint="Optional.">
        <Textarea name="notes" defaultValue="The lidded jar fires with its lid on." />
      </Field>
      <Field label="Member number">
        <Input name="member" disabled defaultValue="0417" />
      </Field>
    </div>
  ),
};

function Choices() {
  const [value, setValue] = React.useState("glaze");
  return (
    <div className="max-w-md">
      <ChoiceGroup
        legend="Firing"
        name="firing"
        value={value}
        onChange={setValue}
        choices={[
          { value: "bisque", label: "Bisque, cone 04", detail: "Fridays, out on Saturday after 10:00." },
          { value: "glaze", label: "Glaze, cone 6", detail: "Tuesdays and Thursdays." },
          { value: "raku", label: "Raku", detail: "Saturdays, in the yard; you take part in the firing." },
        ]}
      />
    </div>
  );
}

export const ChoiceGroupStory: Story = { name: "ChoiceGroup", render: () => <Choices /> };
