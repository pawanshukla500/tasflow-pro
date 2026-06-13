// Polish scratch-note text with Gemini — correct English, preserve meaning.
import { generateWithGoogleAi, getGoogleAiApiKey } from "../_shared/google-ai.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization") || "";
    if (!authHeader.startsWith("Bearer ")) {
      return json({ error: "Not authenticated" }, 401);
    }

    const { content } = await req.json();
    if (!content || typeof content !== "string" || !content.trim()) {
      return json({ error: "content is required" }, 400);
    }

    if (!getGoogleAiApiKey()) {
      return json({
        error: "AI polish is not configured. Ask your admin to set GOOGLE_AI_API_KEY in Supabase Edge Function secrets.",
        code: "missing_api_key",
      }, 503);
    }

    const prompt =
      `You are a helpful writing assistant. Fix grammar, spelling, and clarity in the following note while keeping the original meaning and tone. Return ONLY the corrected text — no quotes, no explanation, no markdown fences.\n\nNote:\n${content.trim()}`;

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
      changed: polished !== content.trim(),
    });
  } catch (e) {
    const message = (e as Error).message || "Polish failed";
    console.error("polish-note error:", message);
    return json({ error: message }, 500);
  }
});

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
