import * as React from "react";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { RefreshCw, Trash2 } from "lucide-react";
import { Button, IconButton } from "../src";

const meta = {
  title: "Actions/Button",
  component: Button,
  args: { children: "Save changes" },
  argTypes: {
    variant: { control: "select", options: ["default", "outline", "secondary", "ghost", "destructive", "link"] },
    size: { control: "inline-radio", options: ["default", "sm", "icon"] },
  },
} satisfies Meta<typeof Button>;
export default meta;
type Story = StoryObj<typeof meta>;

/** A bare Button is the outline variant: the filled accent has to be asked for, once per view. */
export const Outline: Story = {};

export const Filled: Story = { args: { variant: "default", children: "Book firing" } };

export const Variants: Story = {
  render: () => (
    <div className="flex flex-wrap items-center gap-3">
      <Button variant="default">Book firing</Button>
      <Button>Save changes</Button>
      <Button variant="secondary">Save changes</Button>
      <Button variant="ghost">Save changes</Button>
      <Button variant="destructive">Cancel firing</Button>
      <Button variant="link">View schedule</Button>
    </div>
  ),
};

export const SizesAndDisabled: Story = {
  render: () => (
    <div className="flex flex-wrap items-center gap-3">
      <Button variant="default" disabled>
        Book firing
      </Button>
      <Button disabled>Save changes</Button>
      <Button size="sm">Small</Button>
      <Button size="sm" variant="ghost">
        <Trash2 aria-hidden />
        Withdraw
      </Button>
    </div>
  ),
};

/** `label` is required: an unlabelled icon button does not compile. */
export const IconButtons: Story = {
  render: () => (
    <div className="flex flex-wrap items-center gap-3">
      <IconButton icon={RefreshCw} label="Refresh readings" />
      <IconButton icon={RefreshCw} label="Refresh readings" variant="outline" />
    </div>
  ),
};

/** A second look from roles alone (issue #210): a region sets `--control-px`, `--control-px-sm`, `--control-icon`, `--control-h` and the type steps' variables on a class (here inline), and every Button, Heading and caption inside takes it with no class of its own. The left is the default, the right a tighter scale with a larger icon. */
export const SecondLook: Story = {
  render: () => {
    const row = (
      <div className="grid gap-3">
        <p className="type-heading">Firings this week</p>
        <p className="type-body">Four firings are booked and two are waiting for a kiln.</p>
        <p className="type-caption text-muted-foreground">Updated 4 minutes ago</p>
        <div className="flex flex-wrap items-center gap-3">
          <Button>
            <RefreshCw aria-hidden />
            Refresh
          </Button>
          <Button size="sm">Show more</Button>
        </div>
      </div>
    );
    const second = {
      "--control-h": "2.25rem", "--control-h-sm": "1.75rem", "--control-px": "1.5rem", "--control-px-sm": "1rem", "--control-icon": "1.5rem",
      "--type-heading-size": "1.5rem", "--type-heading-leading": "1.75rem", "--type-heading-weight": "700",
      "--type-body-size": "0.875rem", "--type-body-leading": "1.25rem", "--type-caption-size": "0.6875rem",
    } as React.CSSProperties;
    return (
      <div className="grid gap-8 sm:grid-cols-2">
        {row}
        <div style={second}>{row}</div>
      </div>
    );
  },
};

