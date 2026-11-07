import type * as React from "react";

/** Any icon component that takes a className and aria-hidden: Lucide's, or a product's own. */
export type IconComponent = React.ComponentType<{ className?: string; "aria-hidden"?: boolean | "true" | "false" }>;
