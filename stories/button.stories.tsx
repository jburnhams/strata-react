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
