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
export { SecretField, type SecretFieldProps, type SecretTestResult } from "./components/secret-field";
export { Alert, type AlertProps } from "./components/alert";
export { toast, toastTimeout, StrataToastRegion, type ToastContentProps, type StrataToastRegionProps } from "./components/toast";
export { useClientWork, type ClientWork, type WorkContext, type WorkPhase } from "./lib/client-work";
export { JobStatus, jobProgressText, type JobStatusProps, type JobFailure, type JobProgress, type JobWords } from "./components/job-status";
export { useJobAction, type JobAction, type JobActionOptions } from "./components/job-action";
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
export { MediaPlayer, useMediaElement, useAttachedSource, SPEECH_RATES, type MediaPlayerProps, type MediaElementState, type MediaElementOptions, type MediaWindow, type StreamContext, type StreamAttachment, type SourceAttacher, type MediaProblem, type MediaSource, type MediaSession } from "./components/media-player";
export { useMediaSpans, SpanActions, type MediaSpanData, type SpanKind, type SpanBehaviour, type SpanOutcome, type SpanWords, type MediaSpansState } from "./components/media-spans";
export { TranscriptView, type TranscriptViewProps, type TranscriptSeek } from "./components/transcript-view";
export { phraseAt, wordAt, isDoubtful, phraseDoubtful, type TranscriptGroup, type TranscriptPhrase, type TranscriptPhraseState, type TranscriptWord } from "./lib/transcript";
export { Waveform, type WaveformProps, type WaveformMark, type WaveformMarkKind, type WaveformSpan, type WaveformTone } from "./components/waveform";
export { resamplePeaks, toPeakPair, peaksFromAudio, type WaveformPeaks, type PeakPair, type DecodedAudio } from "./lib/waveform";
export { MediaGroup, PlayWindowButton, joinMediaGroup, type PlayWindowButtonProps } from "./components/media-group";
export { Transport, TimeReadout, SeekBar, VolumeControl, RateChoice, MediaStage, StageGuides, transportShortcuts, type TransportProps, type SeekBarProps, type SeekBarSpan, type VolumeControlProps, type Precision } from "./components/media";
export { Timeline, TimelineZoomControls, useTimelineZoom, noOverlap, type TimelineProps, type TimelineItem, type TimelineLane, type TimelineMarker, type TimelineChange, type TimelineDrop } from "./components/timeline";
export { tickStep, ticksBetween, tickLabel } from "./lib/timeline";
export { SortableList, type SortableListProps, type DropTarget } from "./components/sortable-list";
export { FileButton, FileDropZone, FileOutcomes, MissingFile } from "./components/file-intake";
export { useFileIntake, matchesAccept, type FileIntake, type FileIntakeOptions, type FileOutcome } from "./lib/file-intake";
export { Inspector, InspectorSection, PropertyRow, PropertyList, type InspectorProps, type InspectorSectionProps, type PropertyRowProps, type Property, type PropertyListProps } from "./components/inspector";
export { Disclosure, useExpanded, type DisclosureProps, type DisclosureOpenProps, type Expanded, type ExpandedOptions } from "./components/disclosure";
export { BulkBar, useSelection, useChoices, type InitialSelection, type Choices, type ChoiceCounts } from "./components/selection";
export type { Implies } from "./lib/choice";
export {
  SelectableGrid,
  type SelectableGridProps,
  type TileAspect,
  type TileSize,
} from "./components/selectable-grid";
export { ViewOptions, useViewOptions, sortRows, type ViewOptionsProps, type ViewOptionsConfig, type ViewOptionsState, type ViewSort, type ViewGroup, type ViewGroupRows } from "./components/view-options";
export { TileGrid, TileGridSkeleton, SelectableGridSkeleton, type TileGridProps } from "./components/tile-grid";
export { VirtualList } from "./components/virtual-list";
export { InfiniteList, LoadMore, type InfiniteListProps, type LoadMoreProps } from "./components/infinite-list";
export { LineChart, LineChartGroup, logScale, valueAt, type ChartMark, type ChartSpan, type GroupedChart, type LineChartGroupProps, type LineChartProps, type Point, type SpanTone, type YScale } from "./components/line-chart";
export { CursorScope, useSharedCursor, type CursorMapping, type CursorOwner, type CursorScopeProps, type SharedCursor } from "./components/cursor";
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

export { Compare, type CompareProps, type CompareMode, type Candidate, type ImageMedia, type AudioMedia, type TextMedia, type VideoMedia } from "./components/compare";
export { ViewportFrame, useViewport, type ViewportFrameProps, type ViewportState } from "./components/viewport";
export { FullscreenFrame, canFullscreen, type FullscreenFrameProps } from "./components/fullscreen-frame";
export { FIT, MIN_SCALE, MAX_SCALE, clampViewport, zoomAt, actualPixelsScale, regionShares, boxViewport, type Viewport, type Region, type ShareBox } from "./lib/viewport";
export { PairVote, PairJudge, type PairVoteProps, type PairJudgeProps, type PairVoteSlot, type PairVoteWords, type PairAnswer, type Pair } from "./components/pair-vote";
export { CompareAudio, type CompareAudioProps } from "./components/compare-audio";
export { CompareVideoGrid, type CompareVideoGridProps } from "./components/compare-video-grid";
export { CompareVideo, type CompareVideoProps, type VideoMode, type VideoLoop } from "./components/compare-video";
export { CompareText, type CompareTextProps } from "./components/compare-text";
export { diffWords, type TextDifference, type TextSegment } from "./lib/text-diff";
export { loudnessOf, matchGains, gainToVolume, measureLoudness, type Loudness } from "./lib/loudness";
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
export { RichText, Conversation, Composer, type RichTextProps, type ConversationProps, type ConversationTurn, type ConversationImage, type ComposerProps } from "./components/conversation";
export { parseRichText, parseInline, matchEntities, safeHref, plainText, type EntityMatch, type EntityMatcher, type Block as RichBlock, type Inline as RichInline } from "./lib/rich-text";
export { Lightbox, useLightboxUrl, type LightboxProps, type LightboxItem, type LightboxUrl } from "./components/lightbox";
export { RegionEditor, describeRegion, type RegionEditorProps, type EditableRegion, type RegionTone } from "./components/region-editor";
export { BookViewer, useBookUrl, type BookPage, type BookUrl, type BookViewerProps } from "./components/book-viewer";
export { findPage, pageName, sayPosition, viewOf, viewsOf, type PageNames } from "./lib/book";
export { BoxOverlay, BoxList, useBoxes, type BoxOverlayProps, type BoxListProps, type BoxesState, type BoxSource } from "./components/box-overlay";
export { readingOrder, zoomToBox, type PictureBox, type BoxTone } from "./lib/boxes";
export { moveRect, resizeRect, fitRect, drawRect, lerpRect, ease, turnedSize, turnRect, normaliseAngle, splitRect, joinRects, gutterOf, moveGutter, type Rect, type Handle, type RectLimits, type Easing } from "./lib/region";
export { SequenceTimeline, type SequenceTimelineProps, type SequenceItem, type CutRoom, type CutChange } from "./components/sequence-timeline";
export { snapToGrid, stepOnGrid, gridPoints, clampToRoom, settleCut, type Grid, type CutLimit } from "./lib/sequence";
export { Tree, type TreeProps, type TreeNodeState } from "./components/tree";
export { FolderPicker, parentOf, ancestorsOf, type FolderPickerProps, type Folder, type FolderListing } from "./components/folder-picker";
export { MarkableText, Mark, MarkSummary, type MarkableTextProps, type MarkKind, type MarkTone, type MarkPattern } from "./components/markable-text";
export { rangeBetween, countMarks, stepId } from "./lib/marks";
