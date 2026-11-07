/// <reference types="vite/client" />
// The kiln-room screen run as an app: a real router under a base path, a query client, fonts
// bundled, the theme compiled by Tailwind as a product's would be. It exists so strata-visual's
// route mode is exercised on an app with no stories, the way strata-listory is built. The app
// does not know it is being tested: the visual suite answers its requests with MSW handlers in
// Node (see ../strata-visual.config.ts at the repo root).
import "@fontsource-variable/public-sans";
import "@fontsource-variable/archivo/wdth.css";
import "./app.css";
import * as React from "react";
import { createRoot } from "react-dom/client";
import { createBrowserRouter, RouterProvider } from "react-router";
import { StrataQueryProvider } from "../../../src";
import { KilnRoomScreen } from "../../../stories/screens/kiln-room";

const router = createBrowserRouter([{ path: "*", element: <KilnRoomScreen /> }], {
  basename: import.meta.env.BASE_URL.replace(/\/$/, ""),
});

createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <StrataQueryProvider>
      <RouterProvider router={router} />
    </StrataQueryProvider>
  </React.StrictMode>,
);
