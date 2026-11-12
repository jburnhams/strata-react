/**
 * strata-react: an opinionated React + Tailwind v4 framework for building product frontends.
 * Components ship structure, behaviour, states and accessibility; the look comes from the
 * product's own theme. Every component has a Storybook story for each of its states.
 *
 * @module strata-react
 */

export { cn, typeSteps } from "./lib/utils";
export {
  createFormat,
  format,
  NBSP,
  MISSING,
  toDate,
  type ByteUnit,
  type CountOptions,
  type DateFormatter,
  type DateInput,
  type Format,
  type FormatOptions,
  type NumberFormatter,
} from "./lib/format";
export { useInView, type InViewOptions } from "./lib/in-view";
export type { IconComponent } from "./lib/icon";

export {
  Button,
  IconButton,
  RowAction,
  buttonVariants,
  type ButtonProps,
  type IconButtonProps,
  type RowActionProps,
} from "./components/button";
export { Toolbar, ToolbarSeparator, type ToolbarProps } from "./components/toolbar";
export { Toggle, ToggleGroup, type ToggleProps, type ToggleGroupProps, type ToggleOption } from "./components/toggle";
export { Switch, type SwitchProps } from "./components/switch";
export { Dialog, AlertDialog, type DialogProps, type AlertDialogProps } from "./components/dialog";
export { Popover, type PopoverProps } from "./components/popover";
export { Tooltip, type TooltipProps } from "./components/tooltip";
export { Checkbox, type CheckboxProps, type CheckboxGesture } from "./components/checkbox";
export {
  AsyncButton,
  useAsyncAction,
  type Phase,
  type AsyncLabels,
  type AsyncAction,
  type AsyncActionOptions,
  type FieldErrors,
} from "./components/async-button";
export { Field, Input, Textarea, NativeSelect, ChoiceGroup, type FieldProps, type Choice } from "./components/field";
export { Status, type Tone } from "./components/status";
export { Metric, MetricStrip, type MetricProps } from "./components/metric";
export { Meter, crossedThreshold, type MeterProps, type MeterThreshold } from "./components/meter";
export { CompositionBar, type CompositionBarProps, type CompositionPart } from "./components/composition";
export { LinkCard, LinkCardList, type LinkCardProps } from "./components/link-card";
export { DataView, EmptyState, LoadError, Skeleton, StaleNotice, type Load, type LoadFailure, type Stale } from "./components/data-view";
export { JobStatus, type JobStatusProps, type JobFailure, type JobWords } from "./components/job-status";
export { Thumbnail, ThumbnailSkeleton, type ThumbnailProps, type AspectRatio } from "./components/thumbnail";
export {
  DataTable,
  TableSkeleton,
  parseSort,
  serialiseSort,
  type CellValue,
  type Column,
  type Sort,
  type DataTableProps,
  type RowSelection,
  type RowExpansion,
} from "./components/data-table";
export { Disclosure, useExpanded, type DisclosureProps, type DisclosureOpenProps, type Expanded, type ExpandedOptions } from "./components/disclosure";
export { BulkBar, useSelection, type InitialSelection } from "./components/selection";
export {
  SelectableGrid,
  type SelectableGridProps,
  type TileAspect,
  type TileSize,
} from "./components/selectable-grid";
export { VirtualList } from "./components/virtual-list";
export { InfiniteList, LoadMore, type InfiniteListProps, type LoadMoreProps } from "./components/infinite-list";
export { LineChart, type LineChartProps, type Point } from "./components/line-chart";
export { PageHeader } from "./components/page-header";
export {
  UndoBar,
  useUndoable,
  type PendingRemoval,
  type FailedRemoval,
  type Undoable,
  type UndoableOptions,
} from "./components/undo";
export { Done } from "./components/done";
export { AppShell, SideNav, Breadcrumb, type NavItem } from "./components/app-shell";
export { Tabs, type TabItem } from "./components/tabs";
export { useHotkeys, KeysLegend, isTypingTarget, type Shortcut } from "./components/hotkeys";
export { useActiveItem, ActiveList, type ActiveItem } from "./components/active-list";
export {
  ThemeProvider,
  useColorScheme,
  useSystemColorScheme,
  ColorSchemeChoice,
  colorSchemeScript,
  COLOR_SCHEME_STORAGE_KEY,
  type ColorScheme,
  type ColorSchemePreference,
  type ColorSchemeLabels,
  type ColorSchemeState,
} from "./components/theme";
export {
  StrataQueryProvider,
  createQueryClient,
  toLoad,
  staleOf,
  useLoad,
  useInfiniteLoad,
  useJob,
  fetchJson,
  HttpError,
  describeHttpError,
  readErrorBody,
  type DescribeError,
  type ErrorBody,
  type FetchJsonOptions,
  type InfiniteLoad,
  type InfiniteLoadOptions,
  type Job,
  type JobOptions,
  type More,
} from "./query";
export { describeActionError, fieldErrorsOf } from "./lib/errors";
