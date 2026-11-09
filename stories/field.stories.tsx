import * as React from "react";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { AsyncButton, Button, ChoiceGroup, Field, Input, NativeSelect, Textarea, fetchJson, useAsyncAction } from "../src";
import { api, inviteInvalid, inviteTaken } from "./mocks/handlers";

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

const inviteLabels = { idle: "Invite", pending: "Inviting…", done: "Invited" };

/** A one-field form: the button sits on the input's row at the same height, and the hint and error run under both, so neither moves the button off the input. */
export const WithAction: Story = {
  render: () => (
    <div className="grid max-w-lg gap-8">
      <Field label="Invite by email" hint="They get a link to set a password." action={<Button variant="default">Invite</Button>}>
        <Input type="email" name="email" defaultValue="ada@example.org" />
      </Field>
      <Field
        label="Invite by email"
        hint="They get a link to set a password."
        error="ada@example.org is already a member of the studio."
        action={<Button>Invite</Button>}
      >
        <Input type="email" name="email-taken" defaultValue="ada@example.org" />
      </Field>
      <Field
        label="Paste a link to the glaze recipe you want added to the studio's shared book, from the supplier's page or a member's notes"
        action={<Button>Add recipe</Button>}
      >
        <Input name="recipe" placeholder="https://" />
      </Field>
    </div>
  ),
};

/** On a phone: a short action stays on the input's row, as a search box's button does. */
export const WithActionPhone: Story = { ...WithAction, tags: ["visual-phone"] };

// The whole form: `validate` writes the empty-field message, the server's 409 and 422 come back
// through `fieldErrors` and `error`, and typing clears the field's message. No problem state.
function InviteForm() {
  const [email, setEmail] = React.useState("");
  const invite = useAsyncAction(
    (address: string) => fetchJson(api.invites, { method: "POST", body: JSON.stringify({ email: address }) }),
    {
      validate: (address) => ({ email: address.trim() ? undefined : "Type the member's email address." }),
      onInvalid: () => document.getElementById("invite-email")?.focus(),
    },
  );
  return (
    <form
      className="max-w-lg"
      onSubmit={(e) => {
        e.preventDefault();
        void invite.run(email);
      }}
    >
      <Field
        id="invite-email"
        label="Invite by email"
        hint="They get a link to set a password."
        error={invite.fieldErrors.email ?? (invite.phase === "error" ? invite.error : undefined)}
        action={<AsyncButton type="submit" variant="default" phase={invite.phase} labels={inviteLabels} />}
      >
        <Input
          type="email"
          value={email}
          onChange={(e) => {
            setEmail(e.target.value);
            invite.clearFieldError();
          }}
        />
      </Field>
    </form>
  );
}

/** Submit it empty, then with any address: the server's reason appears under the field. */
export const WithActionInteractive: Story = { tags: ["no-visual"], beforeEach: ({ msw }) => msw.use(inviteTaken), render: () => <InviteForm /> };

/** As above, but the server's 422 names the field: its message goes under the input. */
export const WithActionServerValidation: Story = { tags: ["no-visual"], beforeEach: ({ msw }) => msw.use(inviteInvalid), render: () => <InviteForm /> };
