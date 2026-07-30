// Polish scratch-note text with gemma-4-31b-it — return corrected text only.
import { generateWithGoogleAi, getGoogleAiApiKey } from "../_shared/google-ai.ts";
import { corsHeaders, json, requireUser } from "../_shared/google-oauth.ts";
import { buildPolishPrompt, extractPolishedText } from "../_shared/polish-text.ts";

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

    const { text, model } = await generateWithGoogleAi({
      prompt: buildPolishPrompt(trimmed),
      temperature: 0.1,
      maxOutputTokens: 512,
      responseMimeType: "application/json",
    });

    const polished = extractPolishedText(text, trimmed);

    if (!polished) {
      return json({ error: "AI returned an empty response. Try again." }, 502);
    }

    // Guard: never save a long reasoning dump as the note
    if (polished.length > Math.max(trimmed.length * 6, 400) && /input:|task:|checklist|word-by-word/i.test(polished)) {
      return json({ error: "AI returned analysis instead of corrected text. Try again." }, 502);
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
