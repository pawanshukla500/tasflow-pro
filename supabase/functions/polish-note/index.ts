// Polish scratch-note text with Gemini — correct English, preserve meaning.
import { generateWithGoogleAi, getGoogleAiApiKey } from "../_shared/google-ai.ts";
import { corsHeaders, json, requireUser } from "../_shared/google-oauth.ts";

const MAX_CONTENT_CHARS = 8000;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    await requireUser(req);

    const body = await req.json().catch(() => ({}));
    const content = body?.content;
    if (!content || typeof content !== "string" || !content.trim()) {
      return json({ error: "content is required" }, 400);
    }

    const trimmed = content.trim();
    if (trimmed.length > MAX_CONTENT_CHARS) {
      return json({
        error: `content must be ${MAX_CONTENT_CHARS} characters or less`,
      }, 400);
    }

    if (!getGoogleAiApiKey()) {
      return json({
        error: "AI polish is not configured. Ask your admin to set GOOGLE_AI_API_KEY in Supabase Edge Function secrets.",
        code: "missing_api_key",
      }, 503);
    }

    const prompt =
      `You are a helpful writing assistant. Fix grammar, spelling, and clarity in the following note while keeping the original meaning and tone. Return ONLY the corrected text — no quotes, no explanation, no markdown fences.\n\nNote:\n${trimmed}`;

    const { text, model } = await generateWithGoogleAi({
      prompt,
      temperature: 0.2,
      maxOutputTokens: 1024,
    });

    // Strip accidental markdown code fences from model output
    const polished = text.replace(/^```[\w]*\n?/, "").replace(/\n?```$/, "").trim();

    if (!polished) {
      return json({ error: "AI returned an empty response. Try again." }, 502);
    }

    return json({
      polished,
      source: model,
      changed: polished !== trimmed,
    });
  } catch (e) {
    const message = (e as Error).message || "Polish failed";
    console.error("polish-note error:", message);
    const status = message === "Unauthorized" ? 401 : 500;
    return json({ error: message }, status);
  }
});
