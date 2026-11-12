import * as React from "react";
import { cn } from "../lib/utils";

// Density is how much a screen packs in: `default` for forms and pages, `compact` for a tool screen
// worked for hours (an editor, an inspector, a timeline). strata.css moves --control-h and
// --control-h-sm together on `[data-density]`; this is how an app says which (issue #117, from
// strata-vid, whose export dialog came out at default density over a compact editor).
//
// There are two places it can live, and they are different on purpose:
// - the page (`ThemeProvider density` or `<Density page>`): the attribute goes on the document's
//   root element, so everything Strata renders sees it, including `Dialog`, `Menu`, `ContextMenu`,
//   `Popover` and `CommandMenu`, which portal to <body> and so are never inside the app's own root.
//   An app chooses it once, here.
// - a region (`<Density value="compact">`): a wrapper element, for a dense inspector inside an
//   ordinary app. Its overlays portal out of it and stay at the page's density, which is right: a
//   confirm opened from a dense panel is still the app's confirm.
//
// `default` exists as a value so a region can step back inside a compact page. A coarse pointer
// still gets 44px targets in every density (strata.css).

/** How much a screen packs in: `default`, or `compact` for a tool screen. */
export type DensityName = "default" | "compact";

/** The density attribute's page-level setter, shared by `ThemeProvider`. @internal */
export function useDensityOn(value: DensityName | undefined, target?: HTMLElement | null) {
  React.useLayoutEffect(() => {
    if (value === undefined) return;
    const element = target === undefined ? document.documentElement : target;
    if (!element) return;
    const before = element.getAttribute("data-density");
    element.setAttribute("data-density", value);
    return () => {
      if (before === null) element.removeAttribute("data-density");
      else element.setAttribute("data-density", before);
    };
  }, [value, target]);
}

/** Props for `Density`. */
export type DensityProps = {
  value: DensityName;
  /** Set it on the document's root element for the whole page, overlays included, instead of wrapping a region. Renders only its children. */
  page?: boolean;
  /** For the wrapper of a region: layout classes (the wrapper is a plain `div`; `contents` takes it out of layout). */
  className?: string;
  children?: React.ReactNode;
};

/** Sets the density of a region (a wrapper `div`), or of the whole page with `page`, where overlays are reached too. */
export function Density({ value, page = false, className, children }: DensityProps) {
  useDensityOn(page ? value : undefined);
  if (page) return <>{children}</>;
  return (
    <div data-density={value} className={cn(className)}>
      {children}
    </div>
  );
}
