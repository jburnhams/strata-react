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
export {
  Menu,
  ContextMenu,
  CommandMenu,
  CommandLegend,
  useCommands,
  commandShortcut,
  labelOf,
  type Command,
  type MenuEntry,
  type MenuProps,
  type ContextMenuProps,
  type CommandMenuProps,
  type CommandsOptions,
} from "./components/commands";
export { geo, type LatLng } from "./lib/geo";
export { formatChord, matchesChord, parseChord, isReservedChord, detectPlatform, type Platform } from "./lib/chords";
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
export { NumberField, Slider, ColorField, type NumberFieldProps, type SliderProps, type ColorFieldProps, type RangeProps } from "./components/value-controls";
export { Alert, type AlertProps } from "./components/alert";
export { toast, toastTimeout, StrataToastRegion, type ToastContentProps, type StrataToastRegionProps } from "./components/toast";
export { useClientWork, type ClientWork, type WorkContext, type WorkPhase } from "./lib/client-work";
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
export { Transport, TimeReadout, SeekBar, VolumeControl, RateChoice, MediaStage, StageGuides, transportShortcuts, type TransportProps, type SeekBarProps, type VolumeControlProps, type Precision } from "./components/media";
export { Timeline, TimelineZoomControls, useTimelineZoom, noOverlap, type TimelineProps, type TimelineItem, type TimelineLane, type TimelineMarker, type TimelineChange } from "./components/timeline";
export { tickStep, ticksBetween, tickLabel } from "./lib/timeline";
export { SortableList, type SortableListProps, type DropTarget } from "./components/sortable-list";
export { FileButton, FileDropZone, FileOutcomes, MissingFile } from "./components/file-intake";
export { useFileIntake, matchesAccept, type FileIntake, type FileIntakeOptions, type FileOutcome } from "./lib/file-intake";
export { Inspector, InspectorSection, PropertyRow, PropertyList, type InspectorProps, type InspectorSectionProps, type PropertyRowProps, type Property, type PropertyListProps } from "./components/inspector";
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
export { Density, type DensityName, type DensityProps } from "./components/density";
export type { ControlSize } from "./lib/control";
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

export { Compare, type CompareProps, type CompareMode, type Candidate, type ImageMedia } from "./components/compare";
export { ViewportFrame, useViewport, type ViewportFrameProps, type ViewportState } from "./components/viewport";
export { FullscreenFrame, canFullscreen, type FullscreenFrameProps } from "./components/fullscreen-frame";
export { FIT, MIN_SCALE, MAX_SCALE, clampViewport, zoomAt, actualPixelsScale, type Viewport } from "./lib/viewport";
export { CompareGrid, type CompareGridProps } from "./components/compare-grid";
export { useDifference, type DifferenceState, type ReadPixels } from "./components/difference";
export { differences, readPixels, resample, MAX_SIDE, DEFAULT_TOLERANCE, type Difference, type Pixels } from "./lib/image-diff";
export { Workspace, Split, Pane, useWorkspaceState, type WorkspaceState, type PaneProps } from "./components/workspace";
export {
  useHistory,
  useHistoryState,
  type History,
  type HistoryOptions,
  type HistoryStep,
  type HistoryStateOptions,
  type SetOptions,
} from "./components/history";
export { useAutoSave, useLeaveGuard, SaveStatus, type AutoSave, type AutoSaveOptions, type SaveState } from "./components/save";
