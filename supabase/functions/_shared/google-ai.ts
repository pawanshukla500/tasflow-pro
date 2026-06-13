/** Shared Google Generative Language API helper for edge functions. */

const MODELS = [
  "gemini-2.0-flash",
  "gemini-2.0-flash-lite",
  "gemini-1.5-flash",
  "gemini-1.5-flash-8b",
] as const;

export interface GenerateTextOptions {
  prompt: string;
  temperature?: number;
  maxOutputTokens?: number;
  responseMimeType?: string;
}

export interface GenerateTextResult {
  text: string;
  model: string;
}

export function getGoogleAiApiKey(): string | null {
  const key = Deno.env.get("GOOGLE_AI_API_KEY")?.trim();
  return key || null;
}

/** Try multiple Gemini models until one returns text. */
export async function generateWithGoogleAi(
  options: GenerateTextOptions,
): Promise<GenerateTextResult> {
  const apiKey = getGoogleAiApiKey();
  if (!apiKey) {
    throw new Error("GOOGLE_AI_API_KEY is not configured on the server");
  }

  const errors: string[] = [];

  for (const model of MODELS) {
    try {
      const url =
        `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;
      const generationConfig: Record<string, unknown> = {
        temperature: options.temperature ?? 0.3,
        maxOutputTokens: options.maxOutputTokens ?? 1024,
      };
      if (options.responseMimeType) {
        generationConfig.responseMimeType = options.responseMimeType;
      }

      const response = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{ role: "user", parts: [{ text: options.prompt }] }],
          generationConfig,
        }),
      });

      if (!response.ok) {
        const body = await response.text();
        errors.push(`${model}: HTTP ${response.status} — ${body.slice(0, 200)}`);
        continue;
      }

      const data = await response.json();
      const text = data?.candidates?.[0]?.content?.parts?.[0]?.text?.trim();
      if (text) {
        return { text, model };
      }
      errors.push(`${model}: empty response`);
    } catch (err) {
      errors.push(`${model}: ${(err as Error).message}`);
    }
  }

  throw new Error(`All Gemini models failed: ${errors.join("; ")}`);
}
