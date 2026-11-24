import * as React from "react";
import { Link as AriaLink, RouterProvider } from "react-aria-components";
import { useHref, useNavigate } from "react-router";
import type { IconComponent } from "../lib/icon";
import { cn } from "../lib/utils";
import { buttonVariants, type ButtonProps } from "./button";

// An action that navigates is a link, but it is often the view's one filled button ("Play as Fox",
// "Open the report"). Apps hand-wrote `<Link data-variant="default" className={buttonVariants(...)}>`
// and copied `data-variant` so `expectOneFilledButton()` could see it; forgetting it broke the check
// silently. In-app text links were hand-styled four times on one app's screens (#294).
//
// - Built on React Aria's `Link` (press, hover and focus-visible state, keyboard activation, and the
//   rule that a modified click still opens a new tab). Client-side navigation is React Router's: a
//   `RouterProvider` around each link hands React Aria the router's `navigate` and `useHref`, so the
//   basename is honoured and no app-level provider is needed. A plain `href` (a download, another
//   site) is an ordinary link.
// - `ButtonLink` uses `buttonVariants`, so it is the same height, press and variants as `Button` and
//   sets `data-variant`, which `filledButtons()` and `expectOneFilledButton()` read.
// - `TextLink` is the house in-app link: the accent ink, underlined, never a button's layout. It
//   reads as a link inside a sentence, in a table cell and in an `EmptyState` action.
// Neither takes `className` for anything but layout, like the rest.

export type Target =
  | {
      /** An app route (React Router): `"/learners/7"`, `"?tab=log"`. Client-side navigation, the basename applied. */
      to: string;
      href?: undefined;
    }
  | {
      /** A plain link: a download, a file or another site. */
      href: string;
      to?: undefined;
      /** Offers the file for saving; `true` uses the server's name. */
      download?: boolean | string;
    };

type BaseProps = {
  children: React.ReactNode;
  className?: string;
  /** Opens in a new tab; the link gets `rel="noreferrer"`. */
  newTab?: boolean;
  /** Names the link when its text alone does not. */
  "aria-label"?: string;
  id?: string;
  onPress?: ButtonProps["onPress"];
};

/** Props of `ButtonLink`. */
export type ButtonLinkProps = BaseProps & Target & { variant?: ButtonProps["variant"]; size?: ButtonProps["size"]; icon?: IconComponent };

/** Props of `TextLink`. */
export type TextLinkProps = BaseProps & Target & { icon?: IconComponent };

// Shared with MediaPlayer's heading, whose links take the picture's ink rather than TextLink's accent; not in the public API.
export function useTarget(target: Target, newTab: boolean | undefined) {
  const navigate = useNavigate();
  return {
    provide: (node: React.ReactNode) => (
      <RouterProvider navigate={(to) => void navigate(to)} useHref={useHref}>
        {node}
      </RouterProvider>
    ),
    props: {
      href: target.to ?? target.href,
      download: target.href === undefined ? undefined : target.download,
      target: newTab ? "_blank" : undefined,
      rel: newTab || target.href !== undefined ? "noreferrer" : undefined,
    },
  };
}

/**
 * A link drawn as a `Button` (React Router `to`, or `href` for a download or another site): the same variants and heights, `variant="default"` is the filled one and counts for the one-filled-button rule (`data-variant` is set).
 */
export function ButtonLink(all: ButtonLinkProps) {
  const { to, href, download, newTab, variant, size, icon: Icon, className, children, ...rest } = all as ButtonLinkProps & { download?: boolean | string };
  const { provide, props } = useTarget({ to, href, download } as Target, newTab);
  return provide(
    <AriaLink {...rest} {...props} data-variant={variant ?? "outline"} className={cn(buttonVariants({ variant, size }), "no-underline", className)}>
      {Icon && <Icon aria-hidden />}
      {typeof children === "string" ? <span className="min-w-0 truncate">{children}</span> : children}
    </AriaLink>,
  );
}

/**
 * The house in-app link: accent ink, underlined, for a sentence, a table cell or an empty state's next step. `to` for a route, `href` for a file or another site.
 */
export function TextLink(all: TextLinkProps) {
  const { to, href, download, newTab, icon: Icon, className, children, ...rest } = all as TextLinkProps & { download?: boolean | string };
  const { provide, props } = useTarget({ to, href, download } as Target, newTab);
  return provide(
    <AriaLink
      {...rest}
      {...props}
      className={cn("inline-flex items-center gap-1 rounded-control text-primary-11 underline underline-offset-4 transition-state hover:text-primary-12 [&_svg]:size-4 [&_svg]:shrink-0", className)}
    >
      {Icon && <Icon aria-hidden />}
      {children}
    </AriaLink>,
  );
}
