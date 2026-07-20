import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./index.css";
import { validateEnv } from "@/lib/env";

validateEnv();

// Defer analytics until the browser is idle so it never blocks first paint.
const scheduleAnalytics = () => {
  const run = () => {
    void import("@/integrations/firebase/client")
      .then((m) => m.initFirebaseAnalytics())
      .catch(() => {});
  };
  if ("requestIdleCallback" in window) {
    window.requestIdleCallback(run, { timeout: 4000 });
  } else {
    setTimeout(run, 2000);
  }
};
scheduleAnalytics();

createRoot(document.getElementById("root")!).render(<App />);
