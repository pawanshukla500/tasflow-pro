import { initializeApp, getApps, type FirebaseApp } from "firebase/app";
import { getAnalytics, isSupported, type Analytics } from "firebase/analytics";
import { getStorage, type FirebaseStorage } from "firebase/storage";
import { getAuth, type Auth } from "firebase/auth";
import { env } from "@/lib/env";

let app: FirebaseApp | null = null;
let storage: FirebaseStorage | null = null;
let analytics: Analytics | null = null;
let auth: Auth | null = null;

function firebaseConfigReady(): boolean {
  return Boolean(env.firebase.apiKey && env.firebase.projectId && env.firebase.storageBucket);
}

/** Lazily initialize Firebase (storage + optional analytics). Uploads still go via Supabase edge function. */
export function getFirebaseApp(): FirebaseApp | null {
  if (!firebaseConfigReady()) return null;
  if (!app) {
    app = getApps()[0] ?? initializeApp({
      apiKey: env.firebase.apiKey,
      authDomain: env.firebase.authDomain,
      projectId: env.firebase.projectId,
      storageBucket: env.firebase.storageBucket,
      messagingSenderId: env.firebase.messagingSenderId,
      appId: env.firebase.appId,
      measurementId: env.firebase.measurementId || undefined,
    });
  }
  return app;
}

export function getFirebaseAuth(): Auth | null {
  const fb = getFirebaseApp();
  if (!fb) return null;
  if (!auth) auth = getAuth(fb);
  return auth;
}

export function getFirebaseStorage(): FirebaseStorage | null {
  const fb = getFirebaseApp();
  if (!fb) return null;
  if (!storage) storage = getStorage(fb);
  return storage;
}

export async function initFirebaseAnalytics(): Promise<Analytics | null> {
  const fb = getFirebaseApp();
  if (!fb || analytics) return analytics;
  if (await isSupported()) {
    analytics = getAnalytics(fb);
  }
  return analytics;
}
