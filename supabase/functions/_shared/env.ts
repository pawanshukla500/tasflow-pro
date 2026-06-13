/**
 * Edge Function environment — reads from root `.env` or Supabase Dashboard secrets.
 * See project root `.env.example` for the full list.
 */

function read(key: string): string {
  return Deno.env.get(key)?.trim() ?? "";
}

export const edgeEnv = {
  databaseUrl: read("DATABASE_URL"),

  supabaseUrl: read("SUPABASE_URL"),
  supabaseAnonKey: read("SUPABASE_ANON_KEY"),
  supabaseServiceRoleKey: read("SUPABASE_SERVICE_ROLE_KEY"),

  appUrl: read("APP_URL") || read("VITE_APP_URL"),

  firebaseStorageBucket: read("FIREBASE_STORAGE_BUCKET"),
  firebaseServiceAccountJson: read("FIREBASE_SERVICE_ACCOUNT_JSON"),
  firebaseServiceAccountJsonPath: read("FIREBASE_SERVICE_ACCOUNT_JSON_PATH"),

  gmailSenderEmail: read("EMAIL_FROM") || read("GMAIL_SENDER_EMAIL") || "noreply@youthnic.shop",
  gmailFromName: read("EMAIL_FROM_NAME") || read("GMAIL_FROM_NAME") || "TaskFlow Pro by VB Exports",
  resendApiKey: read("RESEND_API_KEY"),
  emailLogoUrl: read("EMAIL_LOGO_URL"),

  supabaseAuthHookSecret: read("SUPABASE_AUTH_HOOK_SECRET") || read("AUTH_HOOK_SECRET"),
  emailWebhookSecret: read("EMAIL_WEBHOOK_SECRET"),

  googleAiApiKey: read("GOOGLE_AI_API_KEY"),
  googleOAuthClientId: read("GOOGLE_OAUTH_CLIENT_ID"),
  googleOAuthClientSecret: read("GOOGLE_OAUTH_CLIENT_SECRET"),
  googleOAuthRedirectUri: read("GOOGLE_OAUTH_REDIRECT_URI"),
  googleTokenEncryptionKey: read("GOOGLE_TOKEN_ENCRYPTION_KEY"),
} as const;
