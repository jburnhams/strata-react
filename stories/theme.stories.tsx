import type { Meta, StoryObj } from "@storybook/react-vite";
import { Button, ColorSchemeChoice, Status, useColorScheme } from "../src";

// Storybook's decorator wraps every story in ThemeProvider, driven by the Theme toolbar, so these
// stories use the same provider an app does.

const meta = {
  title: "Settings/ColorSchemeChoice",
  component: ColorSchemeChoice,
} satisfies Meta<typeof ColorSchemeChoice>;
export default meta;
type Story = StoryObj<typeof meta>;

/** The settings-page picker. "Match this device" comes first because it is the default most people should keep. The toolbar's theme is the selected choice. */
export const Default: Story = {};

/** The words are the product's: here a studio's members page. */
export const ProductWords: Story = {
  args: {
    legend: "Studio screens",
    labels: {
      system: { label: "Follow this device", detail: "Dark after sunset if your computer switches" },
      dark: { label: "Dark", detail: "Easier on the eyes in the glaze room" },
    },
  },
};

function Live() {
  const { preference, scheme } = useColorScheme();
  return (
    <div className="grid max-w-md gap-6 rounded-surface border border-border bg-background p-6">
      <ColorSchemeChoice />
      <p className="type-body-sm text-muted-foreground">
        Chosen: {preference}. Showing: {scheme}.
      </p>
      <div className="flex items-center gap-4">
        <Status tone="success">Ready to collect</Status>
        <Button size="sm">Book firing</Button>
      </div>
    </div>
  );
}

/** Choosing changes the whole page at once, through the same `.dark` class an app sets. */
export const Interactive: Story = { tags: ["no-visual"], render: () => <Live /> };
