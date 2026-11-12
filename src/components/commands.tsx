import * as React from "react";
import {
  Autocomplete,
  Dialog as AriaDialog,
  Header,
  Heading,
  Keyboard,
  Menu as AriaMenu,
  MenuItem,
  MenuSection,
  MenuTrigger,
  Modal,
  ModalOverlay,
  Popover as AriaPopover,
  SearchField,
  Input as AriaInput,
  Separator,
  SubmenuTrigger,
  Text,
  useFilter,
} from "react-aria-components";
import { Check, ChevronRight, Search, Trash2 } from "lucide-react";
import type { IconComponent } from "../lib/icon";
import { cn } from "../lib/utils";
import { overlaySurface } from "../lib/overlay";
import { formatChord, detectPlatform, isReservedChord, matchesChord, type Platform } from "../lib/chords";
import { isTypingTarget } from "./hotkeys";

// One command, declared once, used everywhere a person can reach it: a dropdown or menu-bar menu,
// a context menu, the command menu, the key handler and the legend. Each of those reads the same
// object, so the label, the enabled state and the shortcut text cannot disagree (components.md
// §3.16 and §3.11; strata-react issue #71). This is the single-key `Shortcut` idea of `useHotkeys`
// carried to menus and chords: `useHotkeys` is unchanged for a queue worked with single keys.
//
// - A label is a string or a function, so Undo can say "Undo move clip" and follow the history.
// - `keys` are chords written once ("Mod+Z"), shown per platform (⌘Z or Ctrl+Z). They never fire
//   while the person is typing (a field's own Ctrl+Z is the field's) unless the command says
//   `inFields`, never during IME composition, and a chord the browser uses (Ctrl+S, Ctrl+P, ...)
//   is taken only with `claim: true`, an explicit choice.
// - `disabled` is `true` or a sentence saying why ("Nothing to undo"); a disabled command's chord
//   does nothing, and every menu shows the item as unavailable, with the reason.
// - Menus use React Aria's menu: roles, arrows, Home and End, typeahead, Escape back to the
//   trigger, submenus. A destructive item carries an icon as well as its colour, since colour
//   alone is not a signal (components.md §3.4). A group whose commands all have `checked` is a
//   group of checkable items.
// Motion: shortcuts and the command menu are used 100+ times a day, so they appear at once.

/** A command: what it is called, how it is run, and everything the menus need to draw it. */
export type Command = {
  /** Stable key for the command. */
  id: string;
  /** The verb phrase, sentence case, in the product's words ("Split clip"); a function when it follows state ("Undo move clip"). */
  label: string | (() => string);
  run: () => void;
  /** Chords that run it, written once ("Mod+Z", "Delete", "Shift+?"); the first is the one shown. */
  keys?: string[];
  /** Cannot run now. A sentence says why ("Nothing to undo") and is shown in menus. */
  disabled?: boolean | string;
  /** Cannot be undone or removes something: drawn with an icon and the danger colour. */
  destructive?: boolean;
  /** Makes a menu item checkable: whether it is on now. `run` toggles it. */
  checked?: boolean;
  icon?: IconComponent;
  /** Fire again while the key is held (for moving). Default false. */
  repeat?: boolean;
  /** Run from inside a text field too. Default false: a field keeps its own keys. */
  inFields?: boolean;
  /** Take over a chord the browser uses (Ctrl+S, Ctrl+P). Required for those; otherwise the command is not bound. */
  claim?: boolean;
};

/** What goes in a menu: a command, a separator, a titled group, or a submenu. */
export type MenuEntry = Command | "separator" | { group: string; items: Command[] } | { submenu: string; items: MenuEntry[] };

/** The text of a command's label, whether it is a string or a function. */
export const labelOf = (c: Command) => (typeof c.label === "function" ? c.label() : c.label);
const isDisabled = (c: Command) => Boolean(c.disabled);
const reasonOf = (c: Command) => (typeof c.disabled === "string" ? c.disabled : undefined);
const isCommand = (e: MenuEntry): e is Command => typeof e === "object" && "run" in e;

/** Options for `useCommands`. */
export type CommandsOptions = {
  enabled?: boolean;
  /** Which platform's `Mod` to use; read from the browser when left out. */
  platform?: Platform;
};

/**
 * Binds every command's chords on the window. Never while typing (unless the command says
 * `inFields`), never during IME composition, not on a held key (unless `repeat`), not for a disabled
 * command, and not for a chord the browser uses unless the command `claim`s it. A command's chord
 * that clashes with another's is a mistake: the first in the list wins, and a dev warning names both.
 */
export function useCommands(commands: readonly Command[], { enabled = true, platform }: CommandsOptions = {}) {
  const latest = React.useRef<readonly Command[]>([]);
  latest.current = commands;
  const where = platform ?? detectPlatform();

  React.useEffect(() => {
    if (!enabled) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.defaultPrevented || e.isComposing) return;
      for (const c of latest.current) {
        const chord = c.keys?.find((k) => matchesChord(e, k, where));
        if (!chord) continue;
        if (isReservedChord(chord, where) && !c.claim) continue;
        if (isTypingTarget(e.target) && !c.inFields) continue;
        if (isDisabled(c) || (e.repeat && !c.repeat)) return;
        e.preventDefault();
        c.run();
        return;
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [enabled, where]);

  if (import.meta.env?.DEV) warnOnClashes(commands, where);
}

function warnOnClashes(commands: readonly Command[], platform: Platform) {
  const seen = new Map<string, string>();
  for (const c of commands) {
    for (const k of c.keys ?? []) {
      const shown = formatChord(k, platform);
      const other = seen.get(shown);
      if (other && other !== c.id) console.warn(`strata-react: "${shown}" is bound to both "${other}" and "${c.id}"; the first wins.`);
      else seen.set(shown, c.id);
    }
    if (c.keys?.some((k) => isReservedChord(k, platform)) && !c.claim) {
      console.warn(`strata-react: "${c.id}" uses a chord the browser keeps for itself; add \`claim: true\` to take it over.`);
    }
  }
}

/** The shortcut a command shows in menus and legends ("⌘Z", "Ctrl+Z"), or undefined. */
export function commandShortcut(c: Command, platform: Platform = detectPlatform()): string | undefined {
  return c.keys?.[0] ? formatChord(c.keys[0], platform) : undefined;
}

/** A quiet legend built from the same commands the key handler runs: only commands with keys, disabled ones muted. */
export function CommandLegend({
  commands,
  platform,
  label = "Keyboard shortcuts",
  className,
}: {
  commands: readonly Command[];
  platform?: Platform;
  label?: string;
  className?: string;
}) {
  const where = platform ?? detectPlatform();
  const shown = commands.filter((c) => c.keys?.length);
  return (
    <dl aria-label={label} className={cn("flex flex-wrap gap-x-4 gap-y-1 type-caption text-muted-foreground pointer-coarse:hidden", className)}>
      {shown.map((c) => (
        <div key={c.id} className={cn("flex items-center gap-1.5", isDisabled(c) && "opacity-50")}>
          <dt>
            <kbd className="min-w-5 rounded-control border border-border bg-surface-sunken px-1 text-center font-mono text-foreground">
              {commandShortcut(c, where)}
            </kbd>
          </dt>
          <dd>{labelOf(c)}</dd>
        </div>
      ))}
    </dl>
  );
}

const itemClass = cn(
  "flex min-h-(--control-h-sm) cursor-pointer items-center gap-2 rounded-control px-2 type-body-sm outline-none",
  "data-[focused]:bg-muted data-[disabled]:cursor-not-allowed data-[disabled]:text-muted-foreground data-[disabled]:opacity-70",
  "data-[open]:bg-muted",
);

function Item({ command, platform }: { command: Command; platform: Platform }) {
  const Icon = command.icon ?? (command.destructive ? Trash2 : undefined);
  const shortcut = commandShortcut(command, platform);
  const reason = reasonOf(command);
  return (
    <MenuItem
      id={command.id}
      textValue={labelOf(command)}
      isDisabled={isDisabled(command)}
      onAction={command.run}
      className={cn(itemClass, command.destructive && !isDisabled(command) && "text-danger", "flex-wrap")}
    >
      {({ isSelected, selectionMode }) => (
        <>
          {selectionMode !== "none" ? (
            <span aria-hidden className="grid size-4 shrink-0 place-items-center">{isSelected && <Check className="size-4" />}</span>
          ) : (
            Icon && <Icon aria-hidden className="size-4 shrink-0" />
          )}
          <Text slot="label" className="min-w-0 flex-1 truncate">{labelOf(command)}</Text>
          {shortcut && <Keyboard className="ml-6 shrink-0 font-mono type-caption text-muted-foreground">{shortcut}</Keyboard>}
          {reason && <Text slot="description" className="w-full pl-6 type-caption text-muted-foreground">{reason}</Text>}
        </>
      )}
    </MenuItem>
  );
}

function Entries({ entries, platform }: { entries: readonly MenuEntry[]; platform: Platform }) {
  return (
    <>
      {entries.map((entry, i) => {
        if (entry === "separator") return <Separator key={`sep-${i}`} className="my-1 h-px border-0 bg-border" />;
        if (isCommand(entry)) return <Item key={entry.id} command={entry} platform={platform} />;
        if ("group" in entry) {
          const checkable = entry.items.length > 0 && entry.items.every((c) => c.checked !== undefined);
          return (
            <MenuSection
              key={`group-${entry.group}`}
              selectionMode={checkable ? "multiple" : undefined}
              selectedKeys={checkable ? entry.items.filter((c) => c.checked).map((c) => c.id) : undefined}
            >
              <Header className="px-2 pt-1 type-caption text-muted-foreground">{entry.group}</Header>
              {entry.items.map((c) => <Item key={c.id} command={c} platform={platform} />)}
            </MenuSection>
          );
        }
        return (
          <SubmenuTrigger key={`sub-${entry.submenu}`}>
            <MenuItem textValue={entry.submenu} className={itemClass}>
              <Text slot="label" className="min-w-0 flex-1 truncate">{entry.submenu}</Text>
              <ChevronRight aria-hidden className="size-4 shrink-0 text-muted-foreground" />
            </MenuItem>
            <AriaPopover offset={0} crossOffset={-4} className={cn("layer-overlay min-w-48 p-1", overlaySurface)}>
              <AriaMenu aria-label={entry.submenu} className="outline-none">
                <Entries entries={entry.items} platform={platform} />
              </AriaMenu>
            </AriaPopover>
          </SubmenuTrigger>
        );
      })}
    </>
  );
}

const surface = cn("layer-overlay min-w-48 p-1", overlaySurface);

/** Props for `Menu`. */
export type MenuProps = {
  /** Names the menu: "File", "Edit". Required. */
  label: string;
  /** The control that opens it. */
  trigger: React.ReactElement;
  items: readonly MenuEntry[];
  /** Controlled open state, for a story or a test that needs it shown. */
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  platform?: Platform;
  className?: string;
};

/** A dropdown menu of commands: the menu roles and keyboard model, shortcuts shown per platform, unavailable items with their reason, separators, groups, checkable groups and submenus. */
export function Menu({ label, trigger, items, open, onOpenChange, platform, className }: MenuProps) {
  const where = platform ?? detectPlatform();
  return (
    <MenuTrigger isOpen={open} onOpenChange={onOpenChange}>
      {trigger}
      <AriaPopover placement="bottom start" offset={4} className={cn(surface, className)}>
        <AriaMenu aria-label={label} className="outline-none">
          <Entries entries={items} platform={where} />
        </AriaMenu>
      </AriaPopover>
    </MenuTrigger>
  );
}

/** Props for `ContextMenu`. */
export type ContextMenuProps = {
  /** Names the menu: "Clip actions". Required. */
  label: string;
  items: readonly MenuEntry[];
  /** The object it belongs to. It becomes the thing the menu opens on: right-click, the context-menu key and Shift+F10. */
  children: React.ReactElement<React.HTMLAttributes<HTMLElement>>;
  platform?: Platform;
  disabled?: boolean;
};

/**
 * A context menu for an object: opens on right-click at the pointer, and from the keyboard (the
 * context-menu key or Shift+F10) beside the focused object, with the same items and shortcuts as
 * every other menu. The child gets the handlers, so it should be focusable (a row, a clip).
 */
export function ContextMenu({ label, items, children, platform, disabled }: ContextMenuProps) {
  const where = platform ?? detectPlatform();
  const [at, setAt] = React.useState<{ x: number; y: number } | null>(null);
  const anchor = React.useRef<HTMLSpanElement>(null);
  const open = (x: number, y: number) => setAt({ x, y });
  const child = React.Children.only(children);
  return (
    <>
      {React.cloneElement(child, {
        onContextMenu: (e: React.MouseEvent<HTMLElement>) => {
          child.props.onContextMenu?.(e);
          if (disabled || e.defaultPrevented) return;
          e.preventDefault();
          open(e.clientX, e.clientY);
        },
        onKeyDown: (e: React.KeyboardEvent<HTMLElement>) => {
          child.props.onKeyDown?.(e);
          if (disabled || e.defaultPrevented) return;
          if (e.key === "ContextMenu" || (e.key === "F10" && e.shiftKey)) {
            e.preventDefault();
            const r = e.currentTarget.getBoundingClientRect();
            open(r.left + 8, r.bottom);
          }
        },
      })}
      {at && (
        <span ref={anchor} aria-hidden style={{ position: "fixed", left: at.x, top: at.y, width: 0, height: 0 }} />
      )}
      <AriaPopover triggerRef={anchor} isOpen={at !== null} onOpenChange={(o) => !o && setAt(null)} placement="bottom start" offset={0} className={surface}>
        <AriaMenu aria-label={label} autoFocus="first" onAction={() => setAt(null)} className="outline-none">
          <Entries entries={items} platform={where} />
        </AriaMenu>
      </AriaPopover>
    </>
  );
}

/** Props for `CommandMenu`. */
export type CommandMenuProps = {
  /** The commands to search, usually the same list given to `useCommands`. Entries may be grouped. */
  commands: readonly MenuEntry[];
  /** Controlled open state; otherwise it opens on `shortcut`. */
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  /** The chord that opens it. Default `Mod+K`. `null` for none. */
  shortcut?: string | null;
  /** The search field's name and placeholder. Default "Search commands". */
  label?: string;
  platform?: Platform;
};

function flatten(entries: readonly MenuEntry[]): Command[] {
  return entries.flatMap((e) => (e === "separator" ? [] : isCommand(e) ? [e] : flatten(e.items)));
}

/** A searchable list of every command, opened by a chord (default Mod+K). Choosing one closes it and runs it; an unavailable command is shown with its reason and does nothing. */
export function CommandMenu({ commands, open, onOpenChange, shortcut = "Mod+K", label = "Search commands", platform }: CommandMenuProps) {
  const where = platform ?? detectPlatform();
  const [own, setOwn] = React.useState(false);
  const isOpen = open ?? own;
  const set = (next: boolean) => {
    setOwn(next);
    onOpenChange?.(next);
  };
  React.useEffect(() => {
    if (!shortcut) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.defaultPrevented || e.isComposing || !matchesChord(e, shortcut, where)) return;
      e.preventDefault();
      set(!isOpen);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  });
  const { contains } = useFilter({ sensitivity: "base" });
  const all = flatten(commands);
  return (
    <ModalOverlay isOpen={isOpen} onOpenChange={set} isDismissable className="layer-overlay fixed inset-0 grid justify-items-center overflow-hidden bg-foreground/40 p-4 pt-24">
      <Modal className={cn("flex max-h-full w-full max-w-lg flex-col self-start outline-none", overlaySurface)}>
        <AriaDialog aria-label={label} className="flex min-h-0 flex-col outline-none">
          <Autocomplete filter={contains}>
            <SearchField aria-label={label} autoFocus className="flex items-center gap-2 border-b border-border px-3">
              <Search aria-hidden className="size-4 shrink-0 text-muted-foreground" />
              <AriaInput placeholder={label} className="h-(--control-h) min-w-0 flex-1 bg-transparent type-body outline-none placeholder:text-muted-foreground" />
            </SearchField>
            <AriaMenu
              aria-label="Commands"
              className="min-h-0 overflow-y-auto overscroll-contain p-1 outline-none"
              renderEmptyState={() => <p className="px-3 py-4 type-body-sm text-muted-foreground">No command matches.</p>}
              onAction={() => set(false)}
            >
              {all.map((c) => <Item key={c.id} command={c} platform={where} />)}
            </AriaMenu>
          </Autocomplete>
        </AriaDialog>
        <Heading slot="title" className="sr-only">{label}</Heading>
      </Modal>
    </ModalOverlay>
  );
}
