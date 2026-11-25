/// <reference types="vite/client" />
// Strata's default theme, run as an app that adds no styling of its own: it exists so the visual
// suite holds the look (strata-visual.default-theme.config.ts) and so a person can judge it on a
// whole screen and on every control. Geist, the face, comes with strata.css.
import "./app.css";
import * as React from "react";
import { createRoot } from "react-dom/client";
import { createBrowserRouter, RouterProvider } from "react-router";
import { StrataQueryProvider, ThemeProvider } from "../../../src";
import { routes } from "./routes";

const router = createBrowserRouter(routes, { basename: import.meta.env.BASE_URL.replace(/\/$/, "") });

createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <ThemeProvider>
      <StrataQueryProvider>
        <RouterProvider router={router} />
      </StrataQueryProvider>
    </ThemeProvider>
  </React.StrictMode>,
);
