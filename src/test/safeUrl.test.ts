import { describe, expect, it } from "vitest";
import { safeExternalUrl } from "@/lib/safeUrl";

describe("safeExternalUrl", () => {
  it("allows http and https URLs", () => {
    expect(safeExternalUrl("https://drive.google.com/file/d/abc")).toBe(
      "https://drive.google.com/file/d/abc",
    );
    expect(safeExternalUrl("http://example.com/path")).toBe("http://example.com/path");
  });

  it("rejects javascript and data schemes", () => {
    expect(safeExternalUrl("javascript:alert(1)")).toBeNull();
    expect(safeExternalUrl("data:text/html,<script>alert(1)</script>")).toBeNull();
    expect(safeExternalUrl("vbscript:msgbox(1)")).toBeNull();
  });

  it("rejects invalid or empty input", () => {
    expect(safeExternalUrl("")).toBeNull();
    expect(safeExternalUrl("   ")).toBeNull();
    expect(safeExternalUrl("not a url")).toBeNull();
  });
});
