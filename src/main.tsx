import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./index.css";
import { validateEnv } from "@/lib/env";
import { initFirebaseAnalytics } from "@/integrations/firebase/client";

validateEnv();
initFirebaseAnalytics().catch(() => {});

createRoot(document.getElementById("root")!).render(<App />);
