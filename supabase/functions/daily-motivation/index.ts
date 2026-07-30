// Returns a daily motivational quote. Tries Google AI (gemma-4-31b-it) first, falls back to a curated bank.
import { istToday } from "../_shared/ist.ts";
import { generateWithGoogleAi, getGoogleAiApiKey } from "../_shared/google-ai.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const FALLBACK_QUOTES: { quote: string; author: string }[] = [
  { quote: "Discipline is choosing between what you want now and what you want most.", author: "Abraham Lincoln" },
  { quote: "Small daily improvements over time lead to stunning results.", author: "Robin Sharma" },
  { quote: "The way to get started is to quit talking and begin doing.", author: "Walt Disney" },
  { quote: "Focus on being productive instead of busy.", author: "Tim Ferriss" },
  { quote: "Don't watch the clock; do what it does. Keep going.", author: "Sam Levenson" },
  { quote: "Quality is not an act, it is a habit.", author: "Aristotle" },
  { quote: "Either you run the day, or the day runs you.", author: "Jim Rohn" },
  { quote: "Success is the sum of small efforts repeated day in and day out.", author: "Robert Collier" },
  { quote: "Done is better than perfect.", author: "Sheryl Sandberg" },
  { quote: "What gets measured gets managed.", author: "Peter Drucker" },
  { quote: "Action is the foundational key to all success.", author: "Pablo Picasso" },
  { quote: "Be so good they can't ignore you.", author: "Steve Martin" },
  { quote: "Slow is smooth, smooth is fast.", author: "Navy SEAL Adage" },
  { quote: "Energy and persistence conquer all things.", author: "Benjamin Franklin" },
  { quote: "The secret of getting ahead is getting started.", author: "Mark Twain" },
];

function pickFallback(seed: string) {
  let hash = 0;
  for (let i = 0; i < seed.length; i++) hash = (hash * 31 + seed.charCodeAt(i)) | 0;
  const idx = Math.abs(hash) % FALLBACK_QUOTES.length;
  return FALLBACK_QUOTES[idx];
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const today = istToday();

  if (getGoogleAiApiKey()) {
    try {
      const prompt = `Give me ONE short, punchy motivational quote (max 18 words) suitable for a workplace task management dashboard for today (${today}). Themes: focus, ownership, momentum, teamwork, exports/operations. Return strict JSON only: {"quote":"...","author":"..."}. If you author it yourself, use "TaskFlow Pro".`;
      const { text } = await generateWithGoogleAi({
        prompt,
        temperature: 0.9,
        responseMimeType: "application/json",
      });
      const parsed = JSON.parse(text);
      if (parsed?.quote) {
        return json({ quote: parsed.quote, author: parsed.author || "TaskFlow Pro", source: "ai", date: today });
      }
    } catch (e) {
      console.warn("Google AI failed:", (e as Error).message);
    }
  }

  // Fallback: deterministic by date (everyone gets the same quote for the day)
  const fb = pickFallback(today);
  return json({ ...fb, source: "fallback", date: today });
});

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
