import type { Meta, StoryObj } from "@storybook/react-vite";
import { LinkCard, LinkCardList, Status } from "../src";

const meta = { title: "Navigation/LinkCard", component: LinkCard } satisfies Meta<typeof LinkCard>;
export default meta;
type Story = StoryObj<typeof meta>;

/** One link per card: the title is its name, the description and marks its description, the whole card its target. */
export const Route: Story = {
  args: {
    to: "/bookings",
    title: "Kiln bookings",
    description: "Members book shelves in the next bisque and glaze firings.",
    marks: <Status tone="success">Running</Status>,
  },
  decorators: [(Story) => <div className="max-w-xs"><Story /></div>],
};

/** `href` leaves the app, so the card says so with an arrow before it is pressed. */
export const Elsewhere: Story = {
  args: {
    href: "https://glazes.kilnroom.example",
    title: "Glaze library",
    description: "Recipes and test tiles for the co-op's 42 glazes, with photos.",
    marks: <Status tone="info">Updating</Status>,
  },
  decorators: [(Story) => <div className="max-w-xs"><Story /></div>],
};

/** Only a title: a description and marks are optional. */
export const TitleOnly: Story = {
  args: { to: "/members", title: "Members" },
  decorators: [(Story) => <div className="max-w-xs"><Story /></div>],
};

/** In a `LinkCardList`: one column on a phone, two, then three. */
export const List: Story = {
  args: { to: "/", title: "" },
  tags: ["visual-wide"],
  render: () => (
    <LinkCardList label="Apps on this server">
      <LinkCard to="/bookings" title="Kiln bookings" description="Members book shelves in the next bisque and glaze firings." marks={<Status tone="success">Running</Status>} />
      <LinkCard to="/log" title="Firing log" description="Every firing's schedule, readings and notes since 2019." marks={<Status tone="success">Running</Status>} />
      <LinkCard href="https://glazes.kilnroom.example" title="Glaze library" description="Recipes and test tiles for the co-op's 42 glazes." marks={<Status tone="info">Updating</Status>} />
      <LinkCard to="/members" title="Members" description="Who has a key, who has paid this term, and who teaches." marks={<Status tone="danger">Stopped</Status>} />
    </LinkCardList>
  ),
};
