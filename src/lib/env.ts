/**
 * Frontend env: Cloud Run runtime (runtime-env.js) → Vite build (.env) fallback.
 */
declare global {
  interface Window {
    __RUNTIME_ENV__?: Record<string, string>;
  }
}

function read(key: string): string {
  if (typeof window !== "undefined") {
    const runtime = window.__RUNTIME_ENV__?.[key]?.trim();
    if (runtime) return runtime;
  }
  return (import.meta.env[key] as string | undefined)?.trim() ?? "";
}

const required = ["VITE_SUPABASE_URL", "VITE_SUPABASE_PUBLISHABLE_KEY"] as const;
const firebaseKeys = [
  "VITE_FIREBASE_API_KEY",
  "VITE_FIREBASE_PROJECT_ID",
  "VITE_FIREBASE_STORAGE_BUCKET",
] as const;

export function validateEnv(): void {
  const missing = required.filter((k) => !read(k));
  if (missing.length) {
    console.error(
      `[TaskFlow Pro] Missing required env: ${missing.join(", ")}. See .env.example or Cloud Run env vars.`,
    );
  }
  const missingFirebase = firebaseKeys.filter((k) => !read(k));
  if (missingFirebase.length) {
    console.warn(
      `[TaskFlow Pro] Firebase not fully configured (${missingFirebase.join(", ")}). Sign-in and uploads may fail.`,
    );
  }
}

export const env = {
  supabaseUrl: read("VITE_SUPABASE_URL"),
  supabaseAnonKey: read("VITE_SUPABASE_PUBLISHABLE_KEY"),
  supabaseProjectId: read("VITE_SUPABASE_PROJECT_ID"),
  appUrl: read("VITE_APP_URL") || (typeof window !== "undefined" ? window.location.origin : ""),
  firebase: {
    apiKey: read("VITE_FIREBASE_API_KEY"),
    authDomain: read("VITE_FIREBASE_AUTH_DOMAIN"),
    projectId: read("VITE_FIREBASE_PROJECT_ID"),
    storageBucket: read("VITE_FIREBASE_STORAGE_BUCKET"),
    messagingSenderId: read("VITE_FIREBASE_MESSAGING_SENDER_ID"),
    appId: read("VITE_FIREBASE_APP_ID"),
    measurementId: read("VITE_FIREBASE_MEASUREMENT_ID"),
  },
} as const;
