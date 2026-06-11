import {
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signOut as firebaseSignOut,
  updateProfile,
  updatePassword,
  reauthenticateWithCredential,
  EmailAuthProvider,
  onAuthStateChanged,
  type User as FirebaseUser,
} from "firebase/auth";
import { getFirebaseAuth } from "./client";

function normalizeEmail(email: string) {
  return email.trim().toLowerCase();
}

export async function firebaseSignIn(email: string, password: string): Promise<FirebaseUser> {
  const a = getFirebaseAuth();
  if (!a) throw new Error("Firebase Auth is not configured. Check VITE_FIREBASE_* in .env");
  const cred = await signInWithEmailAndPassword(a, normalizeEmail(email), password);
  return cred.user;
}

export async function firebaseSignUp(email: string, password: string, displayName: string): Promise<FirebaseUser> {
  const a = getFirebaseAuth();
  if (!a) throw new Error("Firebase Auth is not configured. Check VITE_FIREBASE_* in .env");
  const cred = await createUserWithEmailAndPassword(a, normalizeEmail(email), password);
  if (displayName) await updateProfile(cred.user, { displayName });
  return cred.user;
}

/** Create account or sign in if email already exists (fresh org registration). */
export async function firebaseSignUpOrSignIn(
  email: string,
  password: string,
  displayName: string,
): Promise<{ user: FirebaseUser; created: boolean }> {
  try {
    const user = await firebaseSignUp(email, password, displayName);
    return { user, created: true };
  } catch (err: unknown) {
    const code = (err as { code?: string })?.code;
    if (code === "auth/email-already-in-use") {
      const user = await firebaseSignIn(email, password);
      if (displayName && user.displayName !== displayName) {
        await updateProfile(user, { displayName });
      }
      return { user, created: false };
    }
    throw err;
  }
}

/** @deprecated Do not use — sends Firebase plain-text email. Use `@/lib/passwordReset` (Resend) instead. */
export async function firebaseResetPassword(_email: string, _continueUrl?: string): Promise<void> {
  throw new Error(
    "Firebase email is disabled. Use Forgot password on Login or Team → Send reset (delivers via Resend).",
  );
}

/** Change the signed-in user's password. Reauthenticates with the current password first. */
export async function firebaseChangePassword(currentPassword: string, newPassword: string): Promise<void> {
  const a = getFirebaseAuth();
  const user = a?.currentUser;
  if (!user?.email) throw new Error("You must be signed in to change your password");
  const credential = EmailAuthProvider.credential(user.email, currentPassword);
  await reauthenticateWithCredential(user, credential);
  await updatePassword(user, newPassword);
}

export async function firebaseSignOutUser(): Promise<void> {
  const a = getFirebaseAuth();
  if (a) await firebaseSignOut(a);
}

export function subscribeFirebaseAuth(cb: (user: FirebaseUser | null) => void): () => void {
  const a = getFirebaseAuth();
  if (!a) {
    cb(null);
    return () => {};
  }
  return onAuthStateChanged(a, cb);
}

export async function getFirebaseIdToken(forceRefresh = false): Promise<string | null> {
  const a = getFirebaseAuth();
  const user = a?.currentUser;
  if (!user) return null;
  return user.getIdToken(forceRefresh);
}

export function isFirebaseAuthError(err: unknown, code: string): boolean {
  return (err as { code?: string })?.code === code;
}
