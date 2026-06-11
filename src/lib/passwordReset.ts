import { invokeEdgeFunction } from "@/lib/edgeFunctions";

export interface PasswordResetResult {
  ok?: boolean;
  emailSent?: boolean;
  messageId?: string;
  subject?: string;
  error?: string;
}

/** Branded password reset via server (Firebase link + Resend HTML email). */
export async function sendPasswordResetEmail(email: string): Promise<PasswordResetResult> {
  const normalized = email.trim().toLowerCase();
  if (!normalized) throw new Error("Email is required");

  const data = await invokeEdgeFunction<PasswordResetResult>("send-password-reset", {
    body: { email: normalized },
  });

  if (!data?.ok) {
    throw new Error(data?.error || "Password reset failed");
  }
  if (data.emailSent === false) {
    throw new Error(data.error || "Email could not be delivered. Set up Resend — see scripts/EMAIL-SETUP.txt");
  }

  return data;
}
