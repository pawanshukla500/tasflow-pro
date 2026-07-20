import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";
import { componentTagger } from "lovable-tagger";

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => ({
  server: {
    host: "::",
    port: 8080,
    hmr: {
      overlay: false,
    },
  },
  plugins: [react(), mode === "development" && componentTagger()].filter(Boolean),
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
    dedupe: ["react", "react-dom", "react/jsx-runtime", "react/jsx-dev-runtime", "@tanstack/react-query", "@tanstack/query-core"],
  },
  build: {
    target: "es2020",
    cssCodeSplit: true,
    sourcemap: false,
    chunkSizeWarningLimit: 700,
    rollupOptions: {
      output: {
        // Keep heavy libs out of the initial entry chunk so route/code-splitting works.
        manualChunks(id) {
          if (!id.includes("node_modules")) return;
          // Do NOT put recharts/d3 into a shared vendor-charts chunk.
          // That split creates a circular TDZ init
          // ("Cannot access 'X' before initialization") and whitescreens
          // the entire app because the entry incorrectly binds shared utils
          // (e.g. clsx/cva) through the charts chunk. Let Vite keep recharts
          // inside the lazy Dashboard/Reports route chunks instead.
          if (id.includes("firebase")) return "vendor-firebase";
          if (id.includes("@supabase")) return "vendor-supabase";
          if (id.includes("@dnd-kit")) return "vendor-dnd";
          if (id.includes("exceljs") || id.includes("/xlsx/") || id.includes("\\xlsx\\")) return "vendor-excel";
          if (
            id.includes("/react/") ||
            id.includes("/react-dom/") ||
            id.includes("react-router") ||
            id.includes("@tanstack/react-query")
          ) {
            return "vendor-react";
          }
          if (id.includes("@radix-ui")) return "vendor-radix";
          if (id.includes("lucide-react")) return "vendor-icons";
        },
      },
    },
  },
  optimizeDeps: {
    include: [
      "react",
      "react-dom",
      "react-router-dom",
      "@tanstack/react-query",
      "@supabase/supabase-js",
    ],
  },
}));
