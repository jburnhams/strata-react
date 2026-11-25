import type { Meta, StoryObj } from "@storybook/react-vite";
import { Alert, Button, ColorSchemeChoice, Meter, PageHeader, PaletteChoice, Status, palettes, useColorScheme, usePalette } from "../src";

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

/** `compact`: the same three choices as icon segments named "Appearance", for an app with no settings page. Each segment's name is its tooltip. */
export const Compact: Story = { args: { compact: true } };

/** Where the compact choice usually goes: the header's actions, beside nothing that competes with it. */
export const CompactInHeader: Story = {
  render: () => <PageHeader title="Studio server" scope="kilnroom-office" actions={<ColorSchemeChoice compact />} />,
};

function Live() {
  const { preference, scheme } = useColorScheme();
  return (
    <div className="grid max-w-md gap-6 rounded-surface border border-border bg-background p-6">
      <ColorSchemeChoice />
      <ColorSchemeChoice compact />
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

// Palettes are themes beside light and dark: the same screen in another set of colours, chosen
// independently of the scheme. `PaletteChoice` is the picker; the Palette toolbar sets the one Storybook
// itself shows.

/** The settings-page picker for palettes: a swatch drawn in each palette's own colours beside its name, so colours are seen before they are chosen. The toolbar's palette is the selected one. */
export const PalettesList: StoryObj<typeof PaletteChoice> = { name: "PaletteChoice", render: () => <PaletteChoice /> };

/** `compact`: swatches only, named "Palette", for a header; each swatch's name is its tooltip. */
export const PalettesCompactInHeader: StoryObj<typeof PaletteChoice> = {
  name: "PaletteChoice, compact in a header",
  render: () => <PageHeader title="Studio server" scope="kilnroom-office" actions={<><PaletteChoice compact /><ColorSchemeChoice compact /></>} />,
};

/** Every shipped palette on the same small screen (each card scopes `data-palette`), in light and in dark through the theme toolbar. Status colours are the same in every palette, so a status never changes meaning with the brand. */
export const EveryPalette: StoryObj<typeof PaletteChoice> = {
  tags: ["visual-wide"],
  render: () => (
    <div className="grid gap-4 md:grid-cols-2">
      {palettes.map((p) => (
        <section key={p.name} data-palette={p.name} aria-label={p.label} className="grid gap-3 rounded-surface border border-border bg-background p-5 text-foreground">
          <h3 className="type-heading">{p.label}</h3>
          <div className="flex flex-wrap items-center gap-2">
            <Button variant="default">Book a firing</Button>
            <Button>Message owners</Button>
            <Status tone="success">Ready</Status>
            <Status tone="warning">Cooling</Status>
            <Status tone="danger">Fault</Status>
          </div>
          <Meter label="Kiln 2" value={62} max={100} detail="62 of 100 shelves" />
          <p className="rounded-control bg-accent px-3 py-2 type-body-sm text-accent-foreground">The active item takes the warm accent.</p>
          <Alert tone="info">Readings are logged every five minutes.</Alert>
        </section>
      ))}
    </div>
  ),
};

function LivePalette() {
  const { palette } = usePalette();
  return (
    <div className="grid max-w-md gap-4 rounded-surface border border-border bg-background p-6">
      <PaletteChoice />
      <p className="type-body-sm text-muted-foreground">Palette in effect: {palette}</p>
    </div>
  );
}

/** The provider's palette follows the picker. Not a baseline: the choice is the interaction. */
export const PaletteLive: StoryObj<typeof PaletteChoice> = { name: "PaletteChoice, live", tags: ["no-visual"], render: () => <LivePalette /> };
