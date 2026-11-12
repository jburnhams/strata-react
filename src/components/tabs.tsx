import * as React from "react";
import { useSearchParams } from "react-router";
import { Tab, TabList, TabPanel, Tabs as AriaTabs } from "react-aria-components";
import { cn } from "../lib/utils";

// Tabs whose state lives in the URL (?view=readings), so a tab can be linked, survives reload and
// works with Back. Built on React Aria Tabs (ARIA tabs pattern: arrow keys move between tabs and
// select them, Home and End jump, only the selected tab is in the tab order). The selected tab is marked by weight and a
// 2px rule in ink, not by colour alone. The first tab is the default and is not written to the URL.

export type TabItem = { value: string; label: string };

/** Tabs whose selection lives in a URL search parameter (React Router), with the ARIA tabs keyboard model. */
export function Tabs({
  param,
  items,
  label,
  children,
  className,
}: {
  /** The search parameter that holds the selected tab. */
  param: string;
  items: TabItem[];
  /** Names the tab list for screen readers. */
  label: string;
  /** Renders the selected panel. */
  children: (value: string) => React.ReactNode;
  className?: string;
}) {
  const [params, setParams] = useSearchParams();
  const fallback = items[0]?.value ?? "";
  const raw = params.get(param);
  const value = items.some((i) => i.value === raw) ? raw! : fallback;
  const select = (next: string) =>
    setParams(
      (p) => {
        const out = new URLSearchParams(p);
        if (next === fallback) out.delete(param);
        else out.set(param, next);
        return out;
      },
      { replace: true },
    );

  // React Aria's Tabs owns the keyboard model (arrows, Home and End, roving tab stop, automatic
  // activation) and the ids that tie each tab to the panel; the selected key is the URL's.
  return (
    <AriaTabs selectedKey={value} onSelectionChange={(key) => select(String(key))} className={cn("grid gap-4", className)}>
      <TabList aria-label={label} className="flex gap-4 overflow-x-auto border-b border-border">
        {items.map((item) => (
          <Tab
            key={item.value}
            id={item.value}
            className={cn(
              "-mb-px cursor-pointer border-b-2 py-2 type-label whitespace-nowrap transition-state",
              "border-transparent text-muted-foreground hover:text-foreground",
              "selected:border-foreground selected:font-semibold selected:text-foreground",
            )}
          >
            {item.label}
          </Tab>
        ))}
      </TabList>
      <TabPanel id={value} shouldForceMount={false}>
        {children(value)}
      </TabPanel>
    </AriaTabs>
  );
}
