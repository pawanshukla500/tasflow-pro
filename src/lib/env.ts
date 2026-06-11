/**
 * Single source of truth for frontend environment variables.
 * All VITE_* values live in the project root `.env` (see `.env.example`).
 */
function read(key: string): string {
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
      `[TaskFlow Pro] Missing required env: ${missing.join(", ")}. See .env.example`,
    );
  }
  const missingFirebase = firebaseKeys.filter((k) => !read(k));
  if (missingFirebase.length) {
    console.warn(
      `[TaskFlow Pro] Firebase not fully configured (${missingFirebase.join(", ")}). Uploads may fail.`,
    );
  }
}

export const env = {
  /** Supabase project URL — connects React app to PostgreSQL via Supabase API */
  supabaseUrl: read("VITE_SUPABASE_URL"),
  supabaseAnonKey: read("VITE_SUPABASE_PUBLISHABLE_KEY"),
  supabaseProjectId: read("VITE_SUPABASE_PROJECT_ID"),
  /** Public app URL used in links (emails, unsubscribe) */
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
