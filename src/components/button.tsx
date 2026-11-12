import * as React from "react";
import { Button as AriaButton } from "react-aria-components";
import { cva, type VariantProps } from "class-variance-authority";
import type { IconComponent } from "../lib/icon";
import { cn } from "../lib/utils";
import { Tooltip } from "./tooltip";

// Variant names are shadcn's, so copied code and agents' prior knowledge still work. Two things
// differ on purpose:
// 1. The default variant is `outline`, not the filled accent. A bare <Button> is the restrained
//    one; the accent (`variant="default"`) has to be asked for, once per view. Generated app screens
//    put the accent on every button; 12 of 23 real product screens had no filled primary at all.
// 2. Heights come from --control-h, shared with Input and NativeSelect, so density changes move
//    every control together.
// 3. React Aria is the primitives layer (CLAUDE.md, "The stack"): behaviour and accessibility come
//    from it, the look from our tokens. `asChild`/`Slot` is gone; a button that navigates is a link.
// 4. `press`: the button gives 2% under a click or a finger, over 100ms. Buttons are used tens of
//    times a day, so that is all the motion they get (character.md, the frequency budget).
export const buttonVariants = cva(
  "inline-flex shrink-0 cursor-pointer items-center justify-center gap-2 whitespace-nowrap rounded-control type-label transition-state press disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        default: "bg-primary text-primary-foreground hover:bg-primary-10",
        outline: "border border-input bg-background text-foreground hover:bg-muted",
        secondary: "bg-muted text-foreground hover:bg-neutral-4",
        ghost: "text-foreground hover:bg-muted",
        destructive: "bg-destructive text-destructive-foreground hover:bg-danger",
        link: "h-auto px-0 text-primary-11 underline underline-offset-4 hover:text-primary-12",
      },
      size: {
        default: "h-(--control-h) px-4",
        sm: "h-(--control-h-sm) px-3",
        icon: "size-(--control-h)",
      },
    },
    defaultVariants: { variant: "outline", size: "default" },
  },
);

export type ButtonProps = Omit<React.ComponentProps<"button">, "className" | "style"> &
  VariantProps<typeof buttonVariants> & { className?: string };

/**
 * A button with shadcn's variant names, built on React Aria's `Button` (press handling that behaves
 * the same for mouse, touch, pen and keyboard, focus-visible and hover state). The default variant is
 * `outline`; ask for the filled accent (`variant="default"`) once per view. `type` defaults to `button`.
 * `onClick` and `disabled` are the DOM names and keep working; `onPress` is also accepted.
 */
export function Button({ className, variant, size, type = "button", disabled, ...props }: ButtonProps & { onPress?: (e: import("react-aria-components").PressEvent) => void }) {
  // data-variant says which variant was drawn, so a test can check "one filled button per view"
  // without reading class names (strata-react issue #48, `filledButtons` in strata-react/testing).
  return (
    <AriaButton
      type={type}
      isDisabled={disabled}
      data-variant={variant ?? "outline"}
      className={cn(buttonVariants({ variant, size }), className)}
      {...(props as object)}
    />
  );
}

// An icon-only button cannot be written without a name: `label` is required by the type, becomes
// the accessible name and is shown as a `Tooltip` on hover and keyboard focus, so the name and the
// visible hint come from one string and cannot drift. This makes the most common generated
// accessibility defect (an unlabelled icon button) a compile error instead of an audit finding.
export type IconButtonProps = Omit<ButtonProps, "size" | "children" | "aria-label"> & {
  icon: IconComponent;
  label: string;
  /** Shown after the label in its tooltip, muted: "Ctrl+Z". */
  hint?: React.ReactNode;
};

/** An icon-only button. `label` is required and becomes the accessible name and the tooltip (hover and keyboard focus); `hint` adds a muted aside to it, such as a shortcut. */
export function IconButton({ icon: Icon, label, hint, variant = "ghost", ...props }: IconButtonProps) {
  return (
    <Tooltip label={label} hint={hint}>
      <Button size="icon" variant={variant} aria-label={label} {...props}>
        <Icon aria-hidden />
      </Button>
    </Tooltip>
  );
}

// A row action says what it does in the row ("Withdraw") and whom it does it to in its name
// ("Withdraw Tom Ellery"): a table of eight "Withdraw" buttons is eight identical names in a
// screen reader's list of controls. The name is an aria-label that starts with the visible verb,
// so it meets WCAG 2.5.3 (label in name) and voice control still finds it by "Withdraw". Visually
// hidden suffix text is not used: a hidden span joined to the verb did not form a name with its
// space in dom-testing-library (strata-react issue #11). Ghost and small, one per row, shown only
// on the rows where it applies; an icon-only row action is an `IconButton` whose `label` names the
// row the same way. It keeps the row's pitch: rows with and without the action are the same height.
export type RowActionProps = Omit<ButtonProps, "children" | "aria-label"> & {
  /** The visible verb, sentence case: "Withdraw", "Remove". */
  label: string;
  /** What the row is, as a person would say it: "Tom Ellery", "Moonbeam". Completes the accessible name. */
  subject: string;
  icon?: IconComponent;
};

/** A small ghost action for one table row: shows `label`, and is named "`label` `subject`" so every row's action has its own name. */
export function RowAction({ label, subject, icon: Icon, variant = "ghost", size = "sm", className, ...props }: RowActionProps) {
  // -my-1.5 lets the 32px button sit in the 20px line of a table row, inside the row's padding, so
  // rows with an action keep the same pitch as rows without one.
  return (
    <Button variant={variant} size={size} aria-label={`${label} ${subject}`} className={cn("-my-1.5", className)} {...props}>
      {Icon && <Icon aria-hidden />}
      {label}
    </Button>
  );
}
