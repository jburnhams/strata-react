import type { Meta, StoryObj } from "@storybook/react-vite";
import { Archive } from "lucide-react";
import { Disclosure, RowAction, format, useExpanded } from "../src";
import { firingTypes, firings, kilns, minuteToDate, type Firing } from "./fixtures/kiln";
import { firingWorkEmpty, firingWorkLoading, firingWorkServerError } from "./mocks/handlers";
import { FiringWork } from "./screens/firing-history";

// A firing in the log opens to show whose work was in it. The body is `FiringWork`, which makes
// its own request: closed, it is not mounted and nothing is fetched. The state stories put the
// detail request into each state with MSW, the same handlers the unit tests use.

function Summary({ f }: { f: Firing }) {
  return (
    <span className="flex items-center gap-4 type-body-sm">
      <span className="w-24 shrink-0 text-muted-foreground tabular-nums">{format.shortDay.format(minuteToDate(f.endedMin))}</span>
      <span className="min-w-0 flex-1 truncate">
        {firingTypes[f.type].label} in {kilns[f.kiln].name.split(",")[0]}
      </span>
      <span className="w-20 text-right tabular-nums">{format.count(f.pieces, "piece")}</span>
    </span>
  );
}

const f = firings[1];

function One({ defaultOpen, actions }: { defaultOpen?: boolean; actions?: boolean }) {
  return (
    <div className="max-w-2xl">
      <Disclosure
        summary={<Summary f={f} />}
        defaultOpen={defaultOpen}
        actions={actions ? <RowAction label="Archive" subject={`firing ${f.id.slice(2)}`} icon={Archive} /> : undefined}
      >
        <FiringWork firing={f} />
      </Disclosure>
    </div>
  );
}

const meta = { title: "Data/Disclosure", component: One } satisfies Meta<typeof One>;
export default meta;
type Story = StoryObj<typeof meta>;

/** Closed: the summary in a button with a chevron. The body is not mounted, so its request has not run. */
export const Closed: Story = {};
/** Open: the body's request ran on open and its rows sit under the summary, indented past the chevron. */
export const Open: Story = { args: { defaultOpen: true } };
/** A row action sits beside the summary, outside its button, named for the row. */
export const WithAction: Story = { args: { actions: true } };
/** The body's own loading state: its skeleton, inside the open disclosure. */
export const BodyLoading: Story = { args: { defaultOpen: true }, beforeEach: ({ msw }) => msw.use(firingWorkLoading) };
export const BodyEmpty: Story = { args: { defaultOpen: true }, beforeEach: ({ msw }) => msw.use(firingWorkEmpty) };
/** The body's request failed: the error and Try again are inside it; the summary still works. */
export const BodyError: Story = { args: { defaultOpen: true }, beforeEach: ({ msw }) => msw.use(firingWorkServerError) };

/** A list of disclosures sharing `useExpanded`, kept in ?open= so an opened firing can be linked. Two are open. */
export const List: Story = {
  parameters: { route: `/firings?open=${firings[0].id}&open=${firings[2].id}` },
  render: () => <FiringList />,
};

function FiringList() {
  const expanded = useExpanded({ param: "open" });
  return (
    <ul aria-label="Recent firings" className="grid max-w-2xl">
      {firings.slice(0, 5).map((x) => (
        <li key={x.id} className="border-t border-border py-1 first:border-t-0">
          <Disclosure summary={<Summary f={x} />} open={expanded.isOpen(x.id)} onOpenChange={(o) => expanded.setOpen(x.id, o)}>
            <FiringWork firing={x} />
          </Disclosure>
        </li>
      ))}
    </ul>
  );
}
