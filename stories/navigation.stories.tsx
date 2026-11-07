import type { Meta, StoryObj } from "@storybook/react-vite";
import { CalendarClock, Flame, Layers, Users } from "lucide-react";
import { AppShell, Breadcrumb, PageHeader, Tabs, type NavItem } from "../src";

const nav: NavItem[] = [
  { to: "/", label: "Kiln room", icon: Flame, end: true },
  { to: "/bookings", label: "Bookings", icon: CalendarClock },
  { to: "/shelves", label: "Shelves", icon: Layers },
  { to: "/members", label: "Members", icon: Users },
];

const meta = { title: "Page/Navigation", component: AppShell, args: { product: "Back Lane Clay", nav, children: null } } satisfies Meta<typeof AppShell>;
export default meta;
type Story = StoryObj<typeof meta>;

/** Side nav on the page ground; the current route (from React Router) is a neutral pill. */
export const Shell: Story = {
  parameters: { layout: "fullscreen", route: "/bookings" },
  args: {
    children: (
      <div className="grid gap-4">
        <Breadcrumb items={[{ label: "Kiln room", to: "/" }, { label: "Bookings" }]} />
        <PageHeader title="Bookings" scope="This week" />
      </div>
    ),
  },
};

/** Below md the nav is a scrollable row above the page: every destination stays one tap away. */
export const ShellOnAPhone: Story = { ...Shell, tags: ["visual-phone"] };

export const BreadcrumbTrail: Story = {
  render: () => <Breadcrumb items={[{ label: "Kiln room", to: "/" }, { label: "Kiln 2", to: "/kilns/2" }, { label: "Tuesday's glaze firing" }]} />,
};

const tabs = [
  { value: "work", label: "Work inside" },
  { value: "readings", label: "Readings" },
  { value: "program", label: "Program" },
];

/** Tab state lives in ?view=, so it can be linked and survives reload. Arrow keys move between tabs. */
export const UrlTabs: Story = {
  render: () => (
    <Tabs param="view" items={tabs} label="Kiln 2">
      {(v) => <p className="type-body">Panel: {tabs.find((t) => t.value === v)?.label}</p>}
    </Tabs>
  ),
};

export const UrlTabsFromLink: Story = { ...UrlTabs, parameters: { route: "/kilns/2?view=readings" } };
