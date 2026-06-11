// Polish scratch-note text with Gemini/Gemma — correct English, preserve meaning.
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const MODELS = ["gemma-2-2b-it", "gemini-2.0-flash-lite", "gemini-1.5-flash"];

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

    const apiKey = Deno.env.get("GOOGLE_AI_API_KEY");
    if (!apiKey) {
      return json({ polished: content.trim(), source: "unchanged", reason: "GOOGLE_AI_API_KEY not set" });
    }

    const prompt = `You are a helpful writing assistant. Fix grammar, spelling, and clarity in the following note while keeping the original meaning and tone. Return ONLY the corrected text — no quotes, no explanation.\n\nNote:\n${content.trim()}`;

    for (const model of MODELS) {
      try {
        const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;
        const r = await fetch(url, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            contents: [{ role: "user", parts: [{ text: prompt }] }],
            generationConfig: { temperature: 0.3, maxOutputTokens: 1024 },
          }),
        });
        if (!r.ok) continue;
        const data = await r.json();
        const text = data?.candidates?.[0]?.content?.parts?.[0]?.text?.trim();
        if (text) {
          return json({ polished: text, source: model });
        }
      } catch {
        continue;
      }
    }

    return json({ polished: content.trim(), source: "fallback" });
  } catch (e) {
    return json({ error: (e as Error).message }, 500);
  }
});

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
