import type { StorybookConfig } from "@storybook/react-vite";

const config: StorybookConfig = {
  framework: "@storybook/react-vite",
  stories: ["../stories/**/*.mdx", "../stories/**/*.stories.@(ts|tsx)"],
  addons: ["@storybook/addon-docs", "@storybook/addon-a11y", "msw-storybook-addon"],
  staticDirs: ["./public"],
  core: {
    disableTelemetry: true,
    builder: { name: "@storybook/builder-vite", options: { viteConfigPath: ".storybook/vite.config.ts" } },
  },
};

export default config;
