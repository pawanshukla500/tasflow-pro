import { type McpTool, objectSchema, permissionError } from "./types.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;

function decodeBase64(b64: string): Uint8Array {
  const clean = b64.replace(/^data:[^;]+;base64,/, "");
  const bin = atob(clean);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes;
}

export const attachmentTools: McpTool[] = [
  {
    name: "list_task_attachments",
    description: "List files attached to a task (name + download URL).",
    inputSchema: objectSchema({ task_id: { type: "string" } }, ["task_id"]),
    handler: async ({ client }, args) => {
      const { data, error } = await client
        .from("task_attachments")
        .select("id, file_name, file_url, mime_type, size_bytes, uploaded_by, created_at")
        .eq("task_id", String(args.task_id))
        .order("created_at", { ascending: false });
      if (error) throw new Error(error.message);
      return data || [];
    },
  },
  {
    name: "add_task_attachment",
    description:
      "Attach a file to a task. Provide either source_url (the server fetches it) or content_base64 " +
      "(for AI-generated or small text files). Local-disk files can't be read by the AI — use a URL. " +
      "Stored in Firebase Storage; metadata saved on the task.",
    inputSchema: objectSchema(
      {
        task_id: { type: "string" },
        file_name: { type: "string", description: "Name to store, e.g. 'invoice.pdf'." },
        source_url: { type: "string", description: "Public URL to fetch the file from." },
        content_base64: { type: "string", description: "Base64-encoded file bytes (alternative to source_url)." },
        mime_type: { type: "string", description: "Optional MIME type (e.g. text/csv, application/pdf)." },
      },
      ["task_id", "file_name"],
    ),
    handler: async ({ client, accessToken, userId }, args) => {
      const fileName = String(args.file_name);
      const mime = args.mime_type ? String(args.mime_type) : "application/octet-stream";

      // Obtain the file bytes.
      let blob: Blob;
      if (args.source_url) {
        const res = await fetch(String(args.source_url));
        if (!res.ok) throw new Error(`Could not fetch source_url (HTTP ${res.status})`);
        blob = new Blob([new Uint8Array(await res.arrayBuffer())], {
          type: args.mime_type ? mime : (res.headers.get("content-type") || mime),
        });
      } else if (args.content_base64) {
        blob = new Blob([decodeBase64(String(args.content_base64))], { type: mime });
      } else {
        throw new Error("Provide either source_url or content_base64");
      }

      // Upload via the existing firebase-upload edge function (runs as this user).
      const form = new FormData();
      form.append("file", blob, fileName);
      form.append("filename", fileName);
      form.append("folder", "attachments");
      const upRes = await fetch(`${SUPABASE_URL}/functions/v1/firebase-upload`, {
        method: "POST",
        headers: { Authorization: `Bearer ${accessToken}` },
        body: form,
      });
      const up = await upRes.json().catch(() => ({}));
      if (!upRes.ok || !up?.url) throw new Error(up?.error || `Upload failed (HTTP ${upRes.status})`);

      // Save metadata on the task (RLS enforces task access).
      const { data, error } = await client
        .from("task_attachments")
        .insert({
          task_id: String(args.task_id),
          file_name: fileName,
          file_url: up.url,
          file_path: up.path ?? null,
          mime_type: blob.type || mime,
          size_bytes: blob.size,
          uploaded_by: userId,
        })
        .select("id, file_name, file_url, mime_type, size_bytes, created_at")
        .single();
      if (error) throw permissionError(error, "attach files to this task");
      return data;
    },
  },
  {
    name: "delete_task_attachment",
    description: "Remove an attachment from a task (deletes the metadata record).",
    inputSchema: objectSchema({ attachment_id: { type: "string" } }, ["attachment_id"]),
    handler: async ({ client }, args) => {
      const { error } = await client.from("task_attachments").delete().eq("id", String(args.attachment_id));
      if (error) throw permissionError(error, "delete this attachment");
      return { deleted: true, attachment_id: args.attachment_id };
    },
  },
];
