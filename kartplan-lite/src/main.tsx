import "@fontsource-variable/fraunces";
import "@fontsource/ibm-plex-sans/400.css";
import "@fontsource/ibm-plex-sans/500.css";
import "@fontsource/ibm-plex-sans/600.css";
import "@fontsource/ibm-plex-mono/400.css";
import "@fontsource/ibm-plex-mono/500.css";
import "./styles.css";

import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App";
import { SetupNotice } from "./pages/SetupNotice";
import { initFirebase } from "./firebase";
import { AppProvider } from "./lib/store";

const root = createRoot(document.getElementById("root") as HTMLElement);

initFirebase().then((handles) => {
  root.render(
    <StrictMode>
      {handles ? (
        <AppProvider>
          <App />
        </AppProvider>
      ) : (
        <SetupNotice />
      )}
    </StrictMode>,
  );
});
