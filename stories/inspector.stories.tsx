import type { Meta, StoryObj } from "@storybook/react-vite";
import * as React from "react";
import { Plus, Trash2 } from "lucide-react";
import { EmptyState, IconButton, Input, Inspector, InspectorSection, NativeSelect, NumberField, PropertyList, PropertyRow, Slider, Status } from "../src";

// An inspector for what is selected on a kiln-room screen: a piece, or a firing. Same pieces as a
// video editor's clip panel (issue #74): a panel, collapsible sections, editable rows, and a
// read-only list of facts. The sample data is invented, like the rest of the fixtures.

const emptyState = <EmptyState title="Nothing selected">Select a piece on the shelf to see its glaze, size and firing history.</EmptyState>;

function Piece({ name = "Moonbeam bowl", compact, storageKey }: { name?: string; compact?: boolean; storageKey?: string }) {
  const [glaze, setGlaze] = React.useState("Celadon");
  const [coats, setCoats] = React.useState<number | null>(2);
  const [shrink, setShrink] = React.useState(12);
  const [notes, setNotes] = React.useState("");
  return (
    <div data-density={compact ? "compact" : undefined} className="w-80">
      <Inspector
        title={name}
        kind="Piece"
        selectionKey={name}
        storageKey={storageKey}
        actions={<IconButton icon={Trash2} label={`Remove ${name}`} />}
        empty={emptyState}
      >
        <InspectorSection id="glaze" title="Glaze">
          <PropertyRow label="Glaze" modified={glaze !== "Celadon"} onReset={() => setGlaze("Celadon")}>
            <NativeSelect value={glaze} onChange={(e) => setGlaze(e.target.value)}>
              <option>Celadon</option>
              <option>Tenmoku</option>
              <option>Shino</option>
            </NativeSelect>
          </PropertyRow>
          <PropertyRow label="Coats" hint="Two is usual for a cone 6 glaze." modified={coats !== 2} onReset={() => setCoats(2)}>
            <NumberField value={coats} onChange={setCoats} min={1} max={5} />
          </PropertyRow>
        </InspectorSection>
        <InspectorSection id="size" title="Size" actions={<IconButton icon={Plus} label="Add measurement" />}>
          <PropertyRow label="Shrinkage" modified={shrink !== 12} onReset={() => setShrink(12)}>
            <Slider value={shrink} onChange={setShrink} min={0} max={20} unit="%" />
          </PropertyRow>
        </InspectorSection>
        <InspectorSection id="notes" title="Notes" defaultOpen={false}>
          <PropertyRow label="Maker's note">
            <Input value={notes} onChange={(e) => setNotes(e.target.value)} />
          </PropertyRow>
        </InspectorSection>
        <InspectorSection id="facts" title="Firing history" defaultOpen={false}>
          <PropertyList
            items={[
              { term: "Bisque", value: "Cone 04" },
              { term: "Glaze", value: "Cone 6" },
              { term: "Peak", value: "1,222", unit: "°C" },
              { term: "Shelf", value: "Top, left" },
            ]}
          />
        </InspectorSection>
      </Inspector>
    </div>
  );
}

const meta = { title: "Layout/Inspector", component: Piece } satisfies Meta<typeof Piece>;
export default meta;
type Story = StoryObj<typeof meta>;

/** Nothing selected: the empty state says what to select and what will appear. */
export const Empty: Story = {
  render: () => (
    <div className="w-80">
      <Inspector title={null} empty={emptyState} />
    </div>
  ),
};

/** A simple item: a heading with its kind, a read-only list, no editable sections. */
export const SimpleItem: Story = {
  render: () => (
    <div className="w-80">
      <Inspector title="Glaze firing, 4 November" kind="Firing" empty={emptyState}>
        <InspectorSection id="summary" title="Summary">
          <PropertyList
            label="Firing summary"
            items={[
              { term: "Kiln", value: "Kiln 2" },
              { term: "Pieces", value: "14" },
              { term: "Peak", value: "1,222", unit: "°C" },
              { term: "Duration", value: "37", unit: "h" },
              { term: "Result", value: <Status tone="success">Complete</Status> },
            ]}
          />
        </InspectorSection>
      </Inspector>
    </div>
  ),
};

/** Several sections: the first two answer the next question and start open; the rest start closed and are remembered once the person opens them. */
export const ManySections: Story = {};

/** A long name truncates in the heading and in the list, with the whole value available on hover. */
export const LongFileName: Story = {
  render: () => (
    <div className="w-80">
      <Inspector title="moonbeam-bowl-front-view-with-the-celadon-glaze-final-edit-v3.jpg" kind="Photo" empty={emptyState}>
        <InspectorSection id="file" title="File">
          <PropertyList
            items={[
              { term: "File name", value: "moonbeam-bowl-front-view-with-the-celadon-glaze-final-edit-v3.jpg" },
              { term: "Size", value: "2.4", unit: "MB" },
            ]}
          />
        </InspectorSection>
      </Inspector>
    </div>
  ),
};

/** Facts the app does not have print an en dash, which a screen reader hears as "Not known". */
export const MissingValues: Story = {
  render: () => (
    <div className="w-80">
      <Inspector title="Tea jar" kind="Piece" empty={emptyState}>
        <InspectorSection id="facts" title="Details">
          <PropertyList
            items={[
              { term: "Maker", value: "Ana Reyes" },
              { term: "Glaze", value: null },
              { term: "Peak", value: undefined, unit: "°C" },
              { term: "Fired", value: "" },
            ]}
          />
        </InspectorSection>
      </Inspector>
    </div>
  ),
};

/** Compact density: rows and toggles follow `--control-h`, the panel sets no sizes of its own. */
export const Compact: Story = { args: { compact: true } };

/** At phone width the panel is the whole screen and its rows stack. */
export const Phone: Story = { tags: ["visual-phone"], render: () => <div className="w-full"><Piece /></div> };
