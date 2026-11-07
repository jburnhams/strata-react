/**
 * strata-react: an opinionated React + Tailwind v4 framework for building product frontends.
 * Components ship structure, behaviour, states and accessibility; the look comes from the
 * product's own theme. Every component has a Storybook story for each of its states.
 *
 * @module strata-react
 */

export { cn, typeSteps } from "./lib/utils";
export { createFormat, format, NBSP, type Format, type NumberFormatter } from "./lib/format";
export type { IconComponent } from "./lib/icon";

export { Button, IconButton, buttonVariants, type ButtonProps, type IconButtonProps } from "./components/button";
export { AsyncButton, useAsyncAction, type Phase, type AsyncLabels } from "./components/async-button";
export { Field, Input, Textarea, NativeSelect, ChoiceGroup, type FieldProps, type Choice } from "./components/field";
export { Status, type Tone } from "./components/status";
export { Metric, MetricStrip, type MetricProps } from "./components/metric";
export { DataView, EmptyState, Skeleton, type Load } from "./components/data-view";
export { DataTable, TableSkeleton, parseSort, serialiseSort, type Column, type Sort, type DataTableProps } from "./components/data-table";
export { VirtualList } from "./components/virtual-list";
export { LineChart, type LineChartProps, type Point } from "./components/line-chart";
export { PageHeader } from "./components/page-header";
export { UndoBar, useUndoable, type PendingRemoval } from "./components/undo";
export { Done } from "./components/done";
export { AppShell, SideNav, Breadcrumb, type NavItem } from "./components/app-shell";
export { Tabs, type TabItem } from "./components/tabs";
export {
  StrataQueryProvider,
  createQueryClient,
  toLoad,
  useLoad,
  fetchJson,
  HttpError,
  describeHttpError,
  type DescribeError,
} from "./query";
