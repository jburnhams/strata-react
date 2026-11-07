import "@fontsource-variable/public-sans";
import "@fontsource-variable/archivo/wdth.css";
import "@fontsource-variable/jetbrains-mono";
import "./storybook.css";
import * as React from "react";
import type { Decorator, Preview } from "@storybook/react-vite";
import { MemoryRouter } from "react-router";
import { setupWorker } from "msw/browser";
import { mswLoader } from "msw-storybook-addon/csf3";
import { StrataQueryProvider, createQueryClient } from "../src/query";
import { handlers } from "../stories/mocks/handlers";

// Every story runs the way a Strata app runs: inside a router and a fresh query client, with the
// network served by MSW (the same handlers the unit tests use). The toolbar switches the theme
// and density by setting the same class and data attribute a product would.

const withFrame: Decorator = (Story, context) => {
  const { theme, density } = context.globals as { theme?: string; density?: string };
  React.useLayoutEffect(() => {
    const root = document.documentElement;
    root.classList.toggle("dark", theme === "dark");
    if (density === "compact") root.dataset.density = "compact";
    else delete root.dataset.density;
  }, [theme, density]);
  const [client] = React.useState(() => createQueryClient({ defaultOptions: { queries: { retry: false } } }));
  const route = (context.parameters.route as string | undefined) ?? "/";
  return (
    <StrataQueryProvider client={client}>
      <MemoryRouter initialEntries={[route]}>
        <Story />
      </MemoryRouter>
    </StrataQueryProvider>
  );
};

const preview: Preview = {
  decorators: [withFrame],
  loaders: [
    mswLoader(async () => {
      const worker = setupWorker(...handlers);
      // Relative, so the worker is found when Storybook is served from a subpath (GitHub Pages).
      await worker.start({ serviceWorker: { url: "./mockServiceWorker.js" }, onUnhandledFrame: "bypass", quiet: true });
      return worker;
    }),
  ],
  globalTypes: {
    theme: {
      description: "Light or dark theme",
      toolbar: { title: "Theme", icon: "mirror", items: ["light", "dark"], dynamicTitle: true },
    },
    density: {
      description: "Control density",
      toolbar: { title: "Density", icon: "component", items: ["comfortable", "compact"], dynamicTitle: true },
    },
  },
  initialGlobals: { theme: "light", density: "comfortable" },
  parameters: {
    layout: "padded",
    controls: { expanded: true },
    a11y: { test: "error" },
    backgrounds: { disable: true },
  },
  tags: ["autodocs"],
};

export default preview;
