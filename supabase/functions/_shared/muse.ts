/** Meta Model API — Muse Spark contributor tier. Prompts may train future Meta models. */

export const MUSE_MODEL = "muse-spark-1.3-contributor";
const MUSE_URL = "https://api.meta.ai/v1/chat/completions";

export function getMetaModelApiKey(): string | null {
  const key = Deno.env.get("META_MODEL_API_KEY")?.trim();
  return key || null;
}

export async function museJson(options: {
  system: string;
  user: string;
  schemaName: string;
  schema: Record<string, unknown>;
  maxCompletionTokens?: number;
}): Promise<{ text: string; model: string }> {
  const apiKey = getMetaModelApiKey();
  if (!apiKey) {
    throw new Error("META_MODEL_API_KEY is not configured on the server");
  }

  const response = await fetch(MUSE_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: MUSE_MODEL,
      temperature: 0.3,
      max_completion_tokens: options.maxCompletionTokens ?? 700,
      messages: [
        { role: "system", content: options.system },
        { role: "user", content: options.user },
      ],
      response_format: {
        type: "json_schema",
        json_schema: {
          name: options.schemaName,
          strict: true,
          schema: options.schema,
        },
      },
    }),
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Muse Spark failed (${response.status}): ${body.slice(0, 180)}`);
  }

  const data = await response.json();
  const text = data?.choices?.[0]?.message?.content;
  if (typeof text !== "string" || !text.trim()) {
    throw new Error("Muse Spark returned an empty response");
  }
  return { text, model: MUSE_MODEL };
}
