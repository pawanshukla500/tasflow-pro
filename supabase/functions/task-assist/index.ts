// Task writing help: clearer descriptions, subtasks, and a short discussion draft.
// Uses Meta Muse Spark in contributor mode (META_MODEL_API_KEY).
import { museJson, getMetaModelApiKey, MUSE_MODEL } from "../_shared/muse.ts";
import { corsHeaders, json, requireUser } from "../_shared/google-oauth.ts";

const ACTIONS = ["improve_description", "suggest_subtasks", "draft_update"] as const;
type Action = (typeof ACTIONS)[number];

const SYSTEM = [
  "You help a team write clearer task text.",
  "Use only facts present in the input. Do not invent deadlines, owners, numbers, or decisions.",
  "Keep the writer's language. Be concise.",
].join(" ");

function clip(value: unknown, max: number): string {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    await requireUser(req);
    const body = await req.json().catch(() => ({}));
    const action = body?.action as Action;
    if (!ACTIONS.includes(action)) {
      return json({ error: "action must be improve_description, suggest_subtasks, or draft_update" }, 400);
    }

    const title = clip(body?.title, 300);
    const description = clip(body?.description, 8000);
    const comments = Array.isArray(body?.comments)
      ? body.comments.map((item: unknown) => clip(item, 500)).filter(Boolean).slice(0, 12)
      : [];

    if (!title && !description) {
      return json({ error: "Add a title or description first" }, 400);
    }
    if (!getMetaModelApiKey()) {
      return json({
        error: "Task AI is not configured. Add META_MODEL_API_KEY in Supabase Edge Function secrets.",
        code: "missing_api_key",
      }, 503);
    }

    const context = [
      title ? `Title: ${title}` : "",
      description ? `Description:\n${description}` : "",
      comments.length ? `Recent discussion:\n${comments.map((line) => `- ${line}`).join("\n")}` : "",
    ].filter(Boolean).join("\n\n");

    if (action === "improve_description") {
      const { text, model } = await museJson({
        system: SYSTEM,
        user: `Rewrite the description so a teammate can act on it. Keep existing facts and links. If the description is empty, draft a short one from the title only.\n\n${context}`,
        schemaName: "improved_description",
        schema: {
          type: "object",
          properties: { description: { type: "string" } },
          required: ["description"],
          additionalProperties: false,
        },
      });
      const parsed = JSON.parse(text) as { description?: string };
      const next = clip(parsed.description, 8000);
      if (!next) return json({ error: "AI returned an empty description" }, 502);
      return json({ description: next, model });
    }

    if (action === "suggest_subtasks") {
      const { text, model } = await museJson({
        system: SYSTEM,
        user: `Suggest up to 6 concrete subtasks for this task. Each title is one short line.\n\n${context}`,
        schemaName: "suggested_subtasks",
        schema: {
          type: "object",
          properties: {
            subtasks: { type: "array", items: { type: "string" } },
          },
          required: ["subtasks"],
          additionalProperties: false,
        },
      });
      const parsed = JSON.parse(text) as { subtasks?: string[] };
      const subtasks = (parsed.subtasks || [])
        .map((item) => clip(item, 120))
        .filter(Boolean)
        .slice(0, 8);
      if (subtasks.length === 0) return json({ error: "AI did not suggest any subtasks" }, 502);
      return json({ subtasks, model });
    }

    const { text, model } = await museJson({
      system: SYSTEM,
      user: `Write one short discussion update the assignee could post. No greeting, no sign-off.\n\n${context}`,
      schemaName: "draft_update",
      schema: {
        type: "object",
        properties: { message: { type: "string" } },
        required: ["message"],
        additionalProperties: false,
      },
      maxCompletionTokens: 300,
    });
    const parsed = JSON.parse(text) as { message?: string };
    const message = clip(parsed.message, 500);
    if (!message) return json({ error: "AI returned an empty draft" }, 502);
    return json({ message, model: model || MUSE_MODEL });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Task assist failed";
    const status = message === "Not authenticated" || message === "Missing auth" ? 401 : 500;
    return json({ error: message }, status);
  }
});
