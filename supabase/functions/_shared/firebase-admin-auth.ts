import { getGoogleAccessToken } from "./google-access-token.ts";
import { loadServiceAccount } from "./load-service-account.ts";

async function getFirebaseProjectId(): Promise<string> {
  let projectId =
    Deno.env.get("FIREBASE_PROJECT_ID") ||
    Deno.env.get("VITE_FIREBASE_PROJECT_ID");

  if (!projectId) {
    try {
      const sa = await loadServiceAccount();
      const raw = Deno.env.get("FIREBASE_SERVICE_ACCOUNT_JSON") || "";
      projectId = JSON.parse(raw || "{}").project_id || sa.client_email.split("@")[1]?.split(".iam")[0];
    } catch {
      projectId = "taskflow-pro-by-vb-exports";
    }
  }
  return projectId;
}

async function adminIdentityFetch(path: string, body: Record<string, unknown>) {
  const projectId = await getFirebaseProjectId();
  const token = await getGoogleAccessToken([
    "https://www.googleapis.com/auth/identitytoolkit",
    "https://www.googleapis.com/auth/cloud-platform",
  ]);
  const res = await fetch(`https://identitytoolkit.googleapis.com/v1/projects/${projectId}/${path}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
  const data = await res.json();
  return { ok: res.ok, data, status: res.status };
}

/** Check whether a Firebase Auth account exists for this email (no sendOobCode). */
export async function lookupFirebaseUserByEmail(
  email: string,
): Promise<{ uid: string; email: string } | null> {
  const lookup = await adminIdentityFetch("accounts:lookup", { email: [email] });
  const user = lookup.data?.users?.[0];
  if (!lookup.ok || !user?.localId) return null;
  return { uid: user.localId as string, email: (user.email as string) || email };
}

/**
 * Create a Firebase Auth user. Fails if the email already exists — does NOT
 * overwrite passwords (prevents cross-tenant account takeover via invites).
 */
export async function createFirebaseAuthUser(
  email: string,
  password: string,
  displayName?: string,
): Promise<{ created: true; uid?: string }> {
  const lookup = await adminIdentityFetch("accounts:lookup", { email: [email] });
  if (lookup.ok && lookup.data?.users?.[0]?.localId) {
    throw new Error("EMAIL_EXISTS");
  }

  const create = await adminIdentityFetch("accounts", {
    email,
    password,
    displayName: displayName || email.split("@")[0],
    emailVerified: true,
    disabled: false,
  });
  if (!create.ok) {
    const msg = create.data?.error?.message || JSON.stringify(create.data);
    if (msg.includes("EMAIL_EXISTS")) throw new Error("EMAIL_EXISTS");
    throw new Error(msg);
  }
  return { created: true, uid: create.data?.localId as string | undefined };
}

/** Create or update a Firebase Auth user with the admin password (password-reset / admin flows). */
export async function ensureFirebaseAuthUser(
  email: string,
  password: string,
  displayName?: string,
): Promise<{ created: boolean; uid?: string }> {
  const lookup = await adminIdentityFetch("accounts:lookup", { email: [email] });
  if (lookup.ok && lookup.data?.users?.[0]?.localId) {
    const localId = lookup.data.users[0].localId as string;
    const update = await adminIdentityFetch("accounts:update", {
      localId,
      password,
      displayName: displayName || lookup.data.users[0].displayName,
      emailVerified: true,
      disableUser: false,
    });
    if (!update.ok) {
      throw new Error(update.data?.error?.message || "Failed to update Firebase user password");
    }
    return { created: false, uid: localId };
  }

  const create = await adminIdentityFetch("accounts", {
    email,
    password,
    displayName: displayName || email.split("@")[0],
    emailVerified: true,
    disabled: false,
  });
  if (!create.ok) {
    const msg = create.data?.error?.message || JSON.stringify(create.data);
    if (msg.includes("EMAIL_EXISTS")) {
      return ensureFirebaseAuthUser(email, password, displayName);
    }
    throw new Error(msg);
  }
  return { created: true, uid: create.data?.localId as string | undefined };
}

/**
 * Generate password reset link via Google Identity Toolkit (no Firebase plain-text email).
 * Uses service account — same result as firebase-admin generatePasswordResetLink.
 */
export async function buildAppPasswordResetLink(email: string): Promise<string> {
  const appUrl = (Deno.env.get("APP_URL") || "https://task.youthnic.shop").replace(/\/$/, "");
  const continueUrl = `${appUrl}/reset-password`;

  const { ok, data: body } = await adminIdentityFetch("accounts:sendOobCode", {
    email,
    requestType: "PASSWORD_RESET",
    continueUrl,
    canHandleCodeInApp: true,
    returnOobLink: true,
  });

  if (!ok) {
    const msg = body?.error?.message || JSON.stringify(body);
    if (msg.includes("EMAIL_NOT_FOUND") || msg.includes("user-not-found")) {
      throw new Error("EMAIL_NOT_FOUND");
    }
    throw new Error(msg);
  }

  const oobLink = body.oobLink as string | undefined;
  if (!oobLink) throw new Error("Could not generate reset link (returnOobLink missing)");

  const parsed = new URL(oobLink);
  const oobCode = parsed.searchParams.get("oobCode");
  if (!oobCode) throw new Error("Could not parse reset code from link");

  return `${continueUrl}?oobCode=${encodeURIComponent(oobCode)}&mode=resetPassword`;
}
