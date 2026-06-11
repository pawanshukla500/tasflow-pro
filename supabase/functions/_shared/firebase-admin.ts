/** Verify Firebase ID tokens using Google's public keys (no service account required for verify). */
export async function verifyFirebaseIdToken(idToken: string): Promise<{
  uid: string;
  email?: string;
  name?: string;
}> {
  const apiKey = Deno.env.get("FIREBASE_WEB_API_KEY") || Deno.env.get("VITE_FIREBASE_API_KEY");
  if (!apiKey) throw new Error("FIREBASE_WEB_API_KEY not configured");

  const res = await fetch(
    `https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=${apiKey}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ idToken }),
    },
  );

  const body = await res.json();
  if (!res.ok) {
    throw new Error(body?.error?.message || "Invalid Firebase token");
  }

  const user = body?.users?.[0];
  if (!user?.localId) throw new Error("Invalid Firebase token payload");

  return {
    uid: user.localId,
    email: user.email,
    name: user.displayName,
  };
}
