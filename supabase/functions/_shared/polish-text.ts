/**
 * Extract only the corrected note text from an AI polish response.
 * Keep in sync with src/lib/polishText.ts
 */

const ANALYSIS_MARKERS =
  /\b(input|task|constraints?|word-by-word|verification|checklist|analysis|final result|corrected text only|no quotes|no explanation|no markdown)\b/i;

const FINAL_RESULT_RE =
  /(?:final\s*result|corrected(?:\s*(?:text|output|version|note))?|result)\s*[:\-–]\s*["'“]?([^\n"'“”]+)["'”]?/i;

export function stripCodeFences(text: string): string {
  return text
    .replace(/^```[\w]*\s*/m, "")
    .replace(/\s*```$/m, "")
    .trim();
}

export function stripWrappingQuotes(text: string): string {
  const t = text.trim();
  if (
    (t.startsWith('"') && t.endsWith('"')) ||
    (t.startsWith("'") && t.endsWith("'")) ||
    (t.startsWith("“") && t.endsWith("”"))
  ) {
    return t.slice(1, -1).trim();
  }
  return t;
}

export function parseCorrectedJson(raw: string): string | null {
  const cleaned = stripCodeFences(raw);
  try {
    const parsed = JSON.parse(cleaned) as Record<string, unknown>;
    for (const key of ["corrected", "polished", "text", "result", "output"]) {
      const v = parsed[key];
      if (typeof v === "string" && v.trim()) return stripWrappingQuotes(v.trim());
    }
  } catch {
    const match = cleaned.match(/\{[\s\S]*\}/);
    if (match) {
      try {
        const parsed = JSON.parse(match[0]) as Record<string, unknown>;
        for (const key of ["corrected", "polished", "text", "result", "output"]) {
          const v = parsed[key];
          if (typeof v === "string" && v.trim()) return stripWrappingQuotes(v.trim());
        }
      } catch {
        /* ignore */
      }
    }
  }
  return null;
}

function looksLikeAnalysis(text: string): boolean {
  const lines = text.split(/\n/).filter((l) => l.trim());
  if (lines.length <= 1) return false;
  const markerHits = lines.filter((l) => ANALYSIS_MARKERS.test(l)).length;
  const arrowHits = lines.filter((l) => /->|→/.test(l)).length;
  return markerHits >= 2 || arrowHits >= 2 || (markerHits >= 1 && lines.length >= 4);
}

export function extractPolishedText(raw: string, original?: string): string {
  if (!raw?.trim()) return "";

  const fromJson = parseCorrectedJson(raw);
  if (fromJson) return fromJson;

  const text = stripCodeFences(raw);

  const finalMatch = text.match(FINAL_RESULT_RE);
  if (finalMatch?.[1]) {
    return stripWrappingQuotes(finalMatch[1].trim());
  }

  if (looksLikeAnalysis(text)) {
    const quotes = [...text.matchAll(/["“]([^"”\n]{2,})["”]/g)]
      .map((m) => m[1].trim())
      .filter((q) => q && !ANALYSIS_MARKERS.test(q) && q !== original?.trim());
    if (quotes.length > 0) {
      return stripWrappingQuotes(quotes[quotes.length - 1]);
    }

    const lines = text
      .split(/\n/)
      .map((l) => l.trim())
      .filter(Boolean)
      .filter((l) => !ANALYSIS_MARKERS.test(l) && !/->|→/.test(l) && !/^[-*•]/.test(l));
    if (lines.length > 0) {
      return stripWrappingQuotes(lines[lines.length - 1].replace(/^[\d.)]+\s*/, ""));
    }
  }

  return stripWrappingQuotes(text);
}

export function buildPolishPrompt(note: string): string {
  return [
    "Fix grammar, spelling, and clarity in the NOTE.",
    "Keep the original meaning and tone.",
    "Respond with JSON only in this exact shape:",
    '{"corrected":"<the corrected note text only>"}',
    "Do not include explanations, analysis, checklists, markdown, or any other keys.",
    "",
    "NOTE:",
    note,
  ].join("\n");
}
