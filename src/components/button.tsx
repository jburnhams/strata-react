import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";
import type { IconComponent } from "../lib/icon";
import { cn } from "../lib/utils";

// Variant names are shadcn's, so copied code and agents' prior knowledge still work. Two things
// differ on purpose:
// 1. The default variant is `outline`, not the filled accent. A bare <Button> is the restrained
//    one; the accent (`variant="default"`) has to be asked for, once per view. Generated app screens
//    put the accent on every button; 12 of 23 real product screens had no filled primary at all.
// 2. Heights come from --control-h, shared with Input and NativeSelect, so density changes move
//    every control together.
// 3. `press`: the button gives 2% under a click or a finger, over 100ms. Buttons are used tens of
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

export type ButtonProps = React.ComponentProps<"button"> &
  VariantProps<typeof buttonVariants> & { asChild?: boolean };

/** A button with shadcn's variant names. The default variant is `outline`; ask for the filled accent (`variant="default"`) once per view. `type` defaults to `button`. */
export function Button({ className, variant, size, asChild = false, type = "button", ...props }: ButtonProps) {
  const Comp = asChild ? Slot : "button";
  return <Comp type={asChild ? undefined : type} className={cn(buttonVariants({ variant, size }), className)} {...props} />;
}

// An icon-only button cannot be written without a name: `label` is required by the type, becomes
// the accessible name, and doubles as the native tooltip. This makes the most common generated
// accessibility defect (an unlabelled icon button) a compile error instead of an audit finding.
export type IconButtonProps = Omit<ButtonProps, "size" | "children" | "aria-label"> & {
  icon: IconComponent;
  label: string;
};

/** An icon-only button. `label` is required and becomes the accessible name and tooltip. */
export function IconButton({ icon: Icon, label, variant = "ghost", ...props }: IconButtonProps) {
  return (
    <Button size="icon" variant={variant} aria-label={label} title={label} {...props}>
      <Icon aria-hidden />
    </Button>
  );
}
