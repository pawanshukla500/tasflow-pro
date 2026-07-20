// Upload a file to Firebase Storage (Google Cloud Storage) using a service account.
// Expects multipart/form-data with field "file" and optional "filename" and "folder".
// Returns { url, name, path } on success.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { loadServiceAccount } from "../_shared/load-service-account.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const enc = new TextEncoder();
function b64url(buf: ArrayBuffer | Uint8Array): string {
  const bytes = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
  let s = "";
  for (let i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function pemToArrayBuffer(pem: string): ArrayBuffer {
  const b64 = pem
    .replace(/-----BEGIN [^-]+-----/g, "")
    .replace(/-----END [^-]+-----/g, "")
    .replace(/\s+/g, "");
  const bin = atob(b64);
  const buf = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) buf[i] = bin.charCodeAt(i);
  return buf.buffer;
}

async function getAccessToken(sa: {
  client_email: string;
  private_key: string;
  token_uri?: string;
}): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  const header = { alg: "RS256", typ: "JWT" };
  const claim = {
    iss: sa.client_email,
    scope: "https://www.googleapis.com/auth/devstorage.full_control",
    aud: sa.token_uri || "https://oauth2.googleapis.com/token",
    exp: now + 3600,
    iat: now,
  };
  const headerB64 = b64url(enc.encode(JSON.stringify(header)));
  const claimB64 = b64url(enc.encode(JSON.stringify(claim)));
  const signingInput = `${headerB64}.${claimB64}`;

  const key = await crypto.subtle.importKey(
    "pkcs8",
    pemToArrayBuffer(sa.private_key),
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign(
    "RSASSA-PKCS1-v1_5",
    key,
    enc.encode(signingInput),
  );
  const jwt = `${signingInput}.${b64url(sig)}`;

  const resp = await fetch(sa.token_uri || "https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion: jwt,
    }),
  });
  if (!resp.ok) {
    throw new Error(`Token exchange failed [${resp.status}]: ${await resp.text()}`);
  }
  const data = await resp.json();
  return data.access_token as string;
}

function safeName(name: string): string {
  return name.replace(/[^\w.\-]+/g, "_").slice(0, 180);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } },
    );
    const { data: userData, error: userErr } = await supabase.auth.getUser();
    if (userErr || !userData.user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const userId = userData.user.id;

    const sa = await loadServiceAccount();
    const bucket = Deno.env.get("FIREBASE_STORAGE_BUCKET");
    if (!bucket) throw new Error("FIREBASE_STORAGE_BUCKET not configured");

    const form = await req.formData();
    const file = form.get("file");
    if (!(file instanceof File)) {
      return new Response(JSON.stringify({ error: "Missing file" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const MAX_BYTES = 10 * 1024 * 1024; // 10 MB
    const ALLOWED_TYPES = new Set([
      "image/png",
      "image/jpeg",
      "image/webp",
      "image/gif",
      "application/pdf",
      "text/plain",
      "text/csv",
      "application/msword",
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      "application/vnd.ms-excel",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    ]);

    if (file.size > MAX_BYTES) {
      return new Response(JSON.stringify({ error: "File too large (max 10 MB)" }), {
        status: 413,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const mimeType = file.type || "application/octet-stream";
    if (!ALLOWED_TYPES.has(mimeType)) {
      return new Response(JSON.stringify({ error: "Unsupported file type" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const rawFolder = (form.get("folder") as string) || "uploads";
    const folder = safeName(rawFolder).replace(/_/g, "-") || "uploads";
    const filename = safeName((form.get("filename") as string) || file.name || "upload");
    const objectPath = `${folder}/${userId}/${Date.now()}-${crypto.randomUUID().slice(0, 8)}-${filename}`;

    const accessToken = await getAccessToken(sa);
    const fileBytes = new Uint8Array(await file.arrayBuffer());

    // Multipart upload with a Firebase download token in metadata. The bucket stays private;
    // the token-bearing firebasestorage.googleapis.com URL grants read access to link holders
    // (same mechanism as the Firebase client SDK's getDownloadURL).
    const downloadToken = crypto.randomUUID();
    const boundary = `fb-${crypto.randomUUID()}`;
    const metadata = {
      name: objectPath,
      contentType: mimeType,
      metadata: { firebaseStorageDownloadTokens: downloadToken },
    };
    const preamble = enc.encode(
      `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n` +
      `${JSON.stringify(metadata)}\r\n` +
      `--${boundary}\r\nContent-Type: ${mimeType}\r\n\r\n`,
    );
    const epilogue = enc.encode(`\r\n--${boundary}--\r\n`);
    const multipartBody = new Uint8Array(preamble.length + fileBytes.length + epilogue.length);
    multipartBody.set(preamble, 0);
    multipartBody.set(fileBytes, preamble.length);
    multipartBody.set(epilogue, preamble.length + fileBytes.length);

    const uploadUrl = `https://storage.googleapis.com/upload/storage/v1/b/${encodeURIComponent(bucket)}/o?uploadType=multipart`;
    const upResp = await fetch(uploadUrl, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": `multipart/related; boundary=${boundary}`,
      },
      body: multipartBody,
    });
    if (!upResp.ok) {
      throw new Error(`Firebase upload failed [${upResp.status}]: ${await upResp.text()}`);
    }
    const uploaded = await upResp.json();

    const publicUrl = `https://firebasestorage.googleapis.com/v0/b/${bucket}/o/${encodeURIComponent(objectPath)}?alt=media&token=${downloadToken}`;

    return new Response(
      JSON.stringify({
        name: uploaded.name || objectPath,
        path: objectPath,
        url: publicUrl,
        bucket,
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (err) {
    console.error("firebase-upload error:", err);
    const msg = err instanceof Error ? err.message : "Unknown error";
    return new Response(JSON.stringify({ error: msg }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
