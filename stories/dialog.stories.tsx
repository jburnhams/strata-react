import type { Meta, StoryObj } from "@storybook/react-vite";
import { AlertDialog, Button, Dialog, Field, Input, Popover } from "../src";

// Overlays are pinned open (`open`) so the visual suite sees them; the "Live" stories use the
// trigger and are skipped by the visual suite. All render on the `layer-overlay` layer.

const meta = {
  title: "Overlays/Dialog",
  component: Dialog,
  parameters: { layout: "fullscreen" },
  // Phone width: the dialog is as tall as it needs inside the viewport, and the narrow layout is the
  // one most likely to break (a title and a close control, actions that wrap).
  tags: ["visual-phone"],
  args: { title: "Export schedule", open: true },
  // The overlay is portalled out of the story root, so the page behind it is drawn here: it keeps
  // the root non-empty and shows the dimmed ground a real dialog sits on.
  decorators: [
    (Story) => (
      <div className="grid h-96 content-start gap-2 p-4">
        <p className="type-heading">Kiln schedule</p>
        <p className="type-body text-muted-foreground">Fridays, out on Saturday after 10:00.</p>
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof Dialog>;
export default meta;
type Story = StoryObj<typeof meta>;

/** A task that needs its own space. Title required, close control, Escape, focus in and back. */
export const Basic: Story = {
  args: {
    description: "Choose what goes in the file.",
    children: (
      <Field label="File name">
        <Input defaultValue="kiln-schedule" />
      </Field>
    ),
    actions: (close) => (
      <>
        <Button onPress={close}>Cancel</Button>
        <Button variant="default" onPress={close}>Export schedule</Button>
      </>
    ),
  },
};

/** Tall content scrolls inside the dialog, not the page behind it. */
export const LongContent: Story = {
  args: {
    children: (
      <ul className="grid gap-2">
        {Array.from({ length: 40 }, (_, i) => (
          <li key={i} className="type-body">Firing {i + 1}: bisque, cone 04, kiln {(i % 3) + 1}</li>
        ))}
      </ul>
    ),
    actions: (close) => <Button onPress={close}>Close</Button>,
  },
};

/** `closable={false}` while work cannot be interrupted: no close control, no Escape. */
export const NotClosable: Story = {
  args: { title: "Exporting", closable: false, children: <p className="type-body">Encoding 2:31 at 1080p…</p> },
};

/** `placement="end"` makes the same surface a sheet for a long form or a detail. */
export const Sheet: Story = {
  args: { title: "Firing details", placement: "end", children: <p className="type-body">Moonbeam, 6 pieces, kiln 2.</p> },
};

export const Live: Story = {
  tags: ["no-visual"],
  args: { open: undefined, trigger: <Button>Export schedule</Button>, children: <p className="type-body">Opens from its trigger.</p> },
};

/** An AlertDialog is the one confirm: it names the object and the consequence, and the button repeats the verb. */
export const Destructive: StoryObj<typeof AlertDialog> = {
  render: () => (
    <AlertDialog
      open
      title="Delete 3 firings?"
      description="Their bookings and readings go too. This cannot be undone."
      confirm="Delete 3 firings"
      onConfirm={() => undefined}
    />
  ),
};

/** Where the Popover sits against each viewport edge, it flips and shifts to stay inside. */
export const PopoverNearEdges: StoryObj<typeof Popover> = {
  render: () => (
    <div className="relative h-96">
      <div className="absolute right-0 top-0">
        <Popover label="Filters" open trigger={<Button>Filters</Button>} align="end" size="sm">
          <p className="type-body-sm">Kiln 1 and 2</p>
        </Popover>
      </div>
    </div>
  ),
};

export const PopoverForm: StoryObj<typeof Popover> = {
  render: () => (
    <div className="grid h-56 content-start p-4">
      <Popover label="Line colour" open trigger={<Button>Colour</Button>}>
        <Field label="Hex">
          <Input defaultValue="#c0562a" />
        </Field>
      </Popover>
    </div>
  ),
};
