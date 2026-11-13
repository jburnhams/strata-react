import * as React from "react";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { Field, SecretField, type SecretTestResult } from "../src";

// A credential the server keeps and never shows again (issue #221). Every state is one component:
// not set, set (no characters, no length), editing with a named Show toggle, saving, a refusal, and
// a Test with its result. The set states draw no input at all.

const meta = { title: "Form/Secret field", parameters: { layout: "padded" } } satisfies Meta;
export default meta;
type Story = StoryObj<typeof meta>;

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));
const setAt = "2026-11-12T14:02:00Z";

function Row({ children }: { children: React.ReactNode }) {
  return <div className="max-w-xl">{children}</div>;
}

/** Nothing stored yet: a masked entry, Show named for what it reveals, and Save waiting for something typed. */
export const NotSet: Story = {
  render: () => (
    <Row>
      <Field label="Map API key" hint="Kept on the server and never shown again.">
        <SecretField noun="API key" isSet={false} onSave={() => wait(0)} />
      </Field>
    </Row>
  ),
};

/** A key is stored: it says "Set" and when, never a character or a length, and offers Replace, Remove and Test. */
export const Set: Story = {
  render: () => (
    <Row>
      <Field label="Map API key" hint="Kept on the server and never shown again.">
        <SecretField noun="API key" isSet setAt={setAt} onRemove={() => wait(0)} consequence="Map labels stop loading until a new key is set." test={async () => ({ ok: true })} />
      </Field>
    </Row>
  ),
};

function Editing() {
  const [value, setValue] = React.useState<string | null>(null);
  return (
    <Row>
      <Field label="Script writer key" hint="Paste the key from the provider's dashboard.">
        <SecretField noun="API key" isSet setAt={setAt} onChange={setValue} onSave={() => wait(0)} />
      </Field>
      <p className="mt-2 type-body-sm text-muted-foreground">{value === null ? "Nothing to send: the stored key stays." : "A new key is typed; it is held here only."}</p>
    </Row>
  );
}

/** Replacing: press Replace API key, type or paste; Cancel puts "Set" back and the form sends nothing. Skipped by the visual suite. */
export const Replacing: Story = { tags: ["no-visual"], render: () => <Editing /> };

/** The server refused the key: its reason sits on the field through `Field`'s `error`, and the entry is kept to correct. */
export const Refused: Story = {
  render: () => (
    <Row>
      <Field label="Map API key" error="The map provider does not recognise that key. Check it was copied whole.">
        <SecretField noun="API key" isSet={false} onSave={() => wait(0)} />
      </Field>
    </Row>
  ),
};

function Testing({ result }: { result: SecretTestResult }) {
  return (
    <Row>
      <Field label="Map API key">
        <SecretField noun="API key" isSet setAt={setAt} test={async () => result} />
      </Field>
    </Row>
  );
}

/** Test API key asks the server whether the stored key works. Skipped by the visual suite (it needs a press). */
export const TestingAccepted: Story = { tags: ["no-visual"], render: () => <Testing result={{ ok: true }} /> };

/** And when it does not: the provider's reason, beside the field, as text. */
export const TestingRefused: Story = { tags: ["no-visual"], render: () => <Testing result={{ ok: false, message: "The provider says the key has expired." }} /> };
