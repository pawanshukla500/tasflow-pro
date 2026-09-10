import { describe, expect, it } from "vitest";
import { mcpClientSnippets } from "@/lib/mcpTokens";
import {
  applyTaskWriteup,
  assigneeIdsForCaller,
  escapeIlikeExact,
  normalizeCodingStatus,
  taskDeepLink,
} from "../../supabase/functions/mcp-server/tools/assign";

const URL = "https://nekdjoquirhecmejuoba.supabase.co/functions/v1/mcp-server";

describe("MCP client snippets", () => {
  const s = mcpClientSnippets(URL);

  it("authenticates Cursor with url + Authorization header", () => {
    expect(s.cursor).toContain(URL);
    expect(s.cursor).toContain('"url"');
    expect(s.cursor).toContain("Bearer YOUR_TOKEN");
    expect(s.cursor).not.toContain("serverUrl");
  });

  it("gives Claude Code an HTTP add command and JSON", () => {
    expect(s.claudeCodeCli).toContain("claude mcp add --transport http taskflow-pro");
    expect(s.claudeCodeCli).toContain(URL);
    expect(s.claudeCodeJson).toContain('"type": "http"');
    expect(s.claudeCodeJson).toContain(URL);
  });

  it("uses serverUrl for Google Antigravity", () => {
    expect(s.antigravity).toContain('"serverUrl"');
    expect(s.antigravity).toContain(URL);
    expect(s.antigravity).toContain("Bearer YOUR_TOKEN");
  });

  it("keeps Claude Desktop on mcp-remote with a Bearer env header", () => {
    expect(s.claudeDesktopUnix).toContain("mcp-remote");
    expect(s.claudeDesktopWindows).toContain("cmd");
    expect(s.claudeDesktopWindows).toContain("/c");
  });

  it("tells the agent to sync a project and a task assigned to the user", () => {
    expect(s.agentRule).toContain("sync_coding_work");
    expect(s.agentRule).toContain("assigned to the connected user");
    expect(s.agentRule).toContain("progress_note");
    expect(s.agentRule).toContain("cannot merge PRs");
  });

  it("assigns the connected user when assignee_ids is omitted", () => {
    expect(assigneeIdsForCaller("me", undefined)).toEqual(["me"]);
    expect(assigneeIdsForCaller("me", [])).toEqual(["me"]);
    expect(assigneeIdsForCaller("me", ["other"])).toEqual(["other"]);
    expect(escapeIlikeExact("foo_bar%")).toBe("foo\\_bar\\%");
  });

  it("defaults coding status to in_progress and appends progress notes", () => {
    expect(normalizeCodingStatus(undefined)).toBe("in_progress");
    expect(normalizeCodingStatus("in_review")).toBe("in_review");
    expect(normalizeCodingStatus("nope")).toBe("in_progress");
    const at = new Date("2026-09-10T06:40:00.000Z");
    expect(applyTaskWriteup("Goal: ship MCP", "Goal: ship MCP", "Opened PR 76", at)).toBe(
      "Goal: ship MCP\n\n[2026-09-10 06:40 UTC] Opened PR 76",
    );
    expect(applyTaskWriteup("Opened PR 76 already", null, "Opened PR 76 already")).toBe(
      "Opened PR 76 already",
    );
    expect(taskDeepLink("abc-1")).toBe("https://task.youthnic.shop/my-tasks?task=abc-1");
  });

  it("substitutes a minted token", () => {
    const live = mcpClientSnippets(URL, "tf_live_token");
    expect(live.cursor).toContain("Bearer tf_live_token");
    expect(live.cursor).not.toContain("YOUR_TOKEN");
  });
});
