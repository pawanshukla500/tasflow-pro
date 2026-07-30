import { describe, expect, it } from "vitest";
import { extractPolishedText, parseCorrectedJson, buildPolishPrompt } from "@/lib/polishText";

describe("extractPolishedText", () => {
  it("returns corrected field from JSON", () => {
    expect(extractPolishedText('{"corrected":"Hey, how are you?"}'))
      .toBe("Hey, how are you?");
  });

  it("strips Gemma-style reasoning and keeps Final Result", () => {
    const dump = `
Input: "hy haw are yu"
Task: Fix grammar, spelling, and clarity.
Constraints: Keep original meaning and tone. Return ONLY corrected text.
Word-by-word analysis:
"hy" -> "Hi"
"haw" -> "how"
"are" -> "are" (correct)
"yu" -> "you"
Final Result: "Hi, how are you?"
Verification Checklist:
- Corrected text only? Yes
- No quotes? Yes
`;
    expect(extractPolishedText(dump, "hy haw are yu")).toBe("Hi, how are you?");
  });

  it("passes through a clean short correction", () => {
    expect(extractPolishedText("Hey How Are You")).toBe("Hey How Are You");
  });

  it("strips markdown fences", () => {
    expect(extractPolishedText("```\nHello there\n```")).toBe("Hello there");
  });
});

describe("parseCorrectedJson", () => {
  it("reads polished key", () => {
    expect(parseCorrectedJson('{"polished":"Done"}')).toBe("Done");
  });
});

describe("buildPolishPrompt", () => {
  it("asks for JSON corrected field", () => {
    expect(buildPolishPrompt("hy haw are yu")).toContain('"corrected"');
    expect(buildPolishPrompt("hy haw are yu")).toContain("hy haw are yu");
  });
});
