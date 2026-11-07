import * as React from "react";
import { useSearchParams } from "react-router";
import { cn } from "../lib/utils";

// Tabs whose state lives in the URL (?view=readings), so a tab can be linked, survives reload and
// works with Back. ARIA tabs pattern: arrow keys move between tabs and select them, Home and End
// jump, only the selected tab is in the tab order. The selected tab is marked by weight and a
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
  const baseId = React.useId();
  const refs = React.useRef<(HTMLButtonElement | null)[]>([]);

  const select = (next: string, focus = false) => {
    setParams(
      (p) => {
        const out = new URLSearchParams(p);
        if (next === fallback) out.delete(param);
        else out.set(param, next);
        return out;
      },
      { replace: true },
    );
    if (focus) refs.current[items.findIndex((i) => i.value === next)]?.focus();
  };

  const onKeyDown = (e: React.KeyboardEvent, index: number) => {
    const last = items.length - 1;
    const to =
      e.key === "ArrowRight" ? (index === last ? 0 : index + 1)
      : e.key === "ArrowLeft" ? (index === 0 ? last : index - 1)
      : e.key === "Home" ? 0
      : e.key === "End" ? last
      : undefined;
    if (to === undefined) return;
    e.preventDefault();
    select(items[to].value, true);
  };

  return (
    <div className={cn("grid gap-4", className)}>
      <div role="tablist" aria-label={label} className="flex gap-4 overflow-x-auto border-b border-border">
        {items.map((item, i) => {
          const selected = item.value === value;
          return (
            <button
              key={item.value}
              ref={(el) => {
                refs.current[i] = el;
              }}
              type="button"
              role="tab"
              id={`${baseId}-tab-${item.value}`}
              aria-selected={selected}
              aria-controls={`${baseId}-panel`}
              tabIndex={selected ? 0 : -1}
              onClick={() => select(item.value)}
              onKeyDown={(e) => onKeyDown(e, i)}
              className={cn(
                "-mb-px cursor-pointer border-b-2 py-2 type-label whitespace-nowrap transition-state",
                selected
                  ? "border-foreground font-semibold text-foreground"
                  : "border-transparent text-muted-foreground hover:text-foreground",
              )}
            >
              {item.label}
            </button>
          );
        })}
      </div>
      <div role="tabpanel" id={`${baseId}-panel`} aria-labelledby={`${baseId}-tab-${value}`} tabIndex={0}>
        {children(value)}
      </div>
    </div>
  );
}
