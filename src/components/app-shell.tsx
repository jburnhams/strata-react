import * as React from "react";
import { Link, NavLink } from "react-router";
import { cn } from "../lib/utils";
import type { IconComponent } from "../lib/icon";

// The frame of an app: a side nav on the page ground (not a navy or tinted sidebar), the current
// item as a neutral pill (no left bar, no accent), and the page beside it. A top bar exists only
// when it holds something used on every screen, so it is a slot, not a default. Built on React
// Router's NavLink, so "current" is the router's answer and aria-current is set for free. On
// phones the nav becomes a horizontal, scrollable row above the page rather than a hamburger, so
// every destination stays one tap away.

export type NavItem = {
  to: string;
  label: string;
  icon?: IconComponent;
  /** Match only this exact path, for an index route such as "/". */
  end?: boolean;
};

export function AppShell({
  product,
  nav,
  navLabel = "Main",
  topBar,
  children,
  className,
}: {
  /** The product's name or mark, linking home. */
  product: React.ReactNode;
  nav: NavItem[];
  navLabel?: string;
  topBar?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("min-h-dvh md:grid md:grid-cols-[14rem_minmax(0,1fr)]", className)}>
      <aside className="border-b border-border md:border-r md:border-b-0">
        <div className="flex items-center gap-4 px-4 py-3 md:block md:px-3 md:py-4">
          <Link to="/" className="shrink-0 rounded-control px-2 type-heading text-foreground no-underline">
            {product}
          </Link>
          <SideNav items={nav} label={navLabel} className="min-w-0 flex-1 md:mt-4" />
        </div>
      </aside>
      <div className="min-w-0">
        {topBar && <div className="flex items-center gap-3 border-b border-border px-4 py-2 md:px-8">{topBar}</div>}
        <main className="px-4 py-6 md:px-8 md:py-8">{children}</main>
      </div>
    </div>
  );
}

export function SideNav({ items, label, className }: { items: NavItem[]; label: string; className?: string }) {
  return (
    <nav aria-label={label} className={cn("min-w-0", className)}>
      <ul className="flex gap-1 overflow-x-auto md:grid md:overflow-visible">
        {items.map(({ to, label, icon: Icon, end }) => (
          <li key={to} className="shrink-0">
            <NavLink
              to={to}
              end={end}
              className={({ isActive }) =>
                cn(
                  "flex h-(--control-h-sm) items-center gap-2 rounded-control px-2 type-label whitespace-nowrap no-underline transition-state",
                  isActive ? "bg-muted text-foreground" : "text-muted-foreground hover:bg-muted hover:text-foreground",
                )
              }
            >
              {Icon && <Icon aria-hidden className="size-4 shrink-0" />}
              {label}
            </NavLink>
          </li>
        ))}
      </ul>
    </nav>
  );
}

// Plain links with a "/" separator in muted ink. The last crumb is the current page: text, not a
// link, with aria-current.
export function Breadcrumb({ items }: { items: { label: string; to?: string }[] }) {
  return (
    <nav aria-label="Breadcrumb">
      <ol className="flex flex-wrap items-center gap-x-2 type-body-sm text-muted-foreground">
        {items.map((item, i) => {
          const last = i === items.length - 1;
          return (
            <li key={`${item.label}-${i}`} className="flex items-center gap-2">
              {item.to && !last ? (
                <Link to={item.to} className="text-muted-foreground underline hover:text-foreground">
                  {item.label}
                </Link>
              ) : (
                <span aria-current={last ? "page" : undefined} className={cn(last && "text-foreground")}>
                  {item.label}
                </span>
              )}
              {!last && <span aria-hidden>/</span>}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
