/// <reference types="vite/client" />
// The kiln-room screen run as an app: a real router under a base path, a query client, fonts
// bundled, the theme compiled by Tailwind as a product's would be. It exists so strata-visual's
// route mode is exercised on an app with no stories, the way strata-listory is built. The app
// does not know it is being tested: the visual suite answers its requests with MSW handlers in
// Node (see ../strata-visual.config.ts at the repo root).
import "./app.css";
import * as React from "react";
import { createRoot } from "react-dom/client";
import { createBrowserRouter, RouterProvider } from "react-router";
import { StrataQueryProvider, ThemeProvider } from "../../../src";
import { routes } from "./routes";

const router = createBrowserRouter(routes, {
  basename: import.meta.env.BASE_URL.replace(/\/$/, ""),
});

createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <ThemeProvider>
      <StrataQueryProvider>
        <RouterProvider router={router} />
      </StrataQueryProvider>
    </ThemeProvider>
  </React.StrictMode>,
);
