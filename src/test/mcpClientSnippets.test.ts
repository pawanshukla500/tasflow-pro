import { describe, expect, it } from "vitest";
import { mcpClientSnippets } from "@/lib/mcpTokens";

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

  it("tells the agent TaskFlow owns tasks and git owns PRs", () => {
    expect(s.agentRule).toContain("whoami");
    expect(s.agentRule).toContain("create_task");
    expect(s.agentRule).toContain("cannot merge PRs");
  });

  it("substitutes a minted token", () => {
    const live = mcpClientSnippets(URL, "tf_live_token");
    expect(live.cursor).toContain("Bearer tf_live_token");
    expect(live.cursor).not.toContain("YOUR_TOKEN");
  });
});
