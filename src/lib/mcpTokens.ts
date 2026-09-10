import { supabase } from "@/integrations/supabase/client";
import { invokeEdgeFunction } from "@/lib/edgeFunctions";
import { env } from "@/lib/env";

export interface McpToken {
  id: string;
  name: string;
  token_prefix: string;
  last_used_at: string | null;
  expires_at: string | null;
  created_at: string;
}

// `mcp_access_tokens` is created by migration 20260613120000 but isn't in the
// generated Supabase types yet, so untype the client for this table only.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = supabase as any;

/** Public URL AI clients point at. */
export function mcpServerUrl(): string {
  return `${env.supabaseUrl}/functions/v1/mcp-server`;
}

/** Copy-paste MCP configs. Pass a live token only in the browser after minting. */
export function mcpClientSnippets(url: string, token = "YOUR_TOKEN") {
  const bearer = `Bearer ${token}`;
  const cursor = {
    mcpServers: {
      "taskflow-pro": {
        url,
        headers: { Authorization: bearer },
      },
    },
  };
  const claudeCodeJson = {
    mcpServers: {
      "taskflow-pro": {
        type: "http",
        url,
        headers: { Authorization: bearer },
      },
    },
  };
  const antigravity = {
    mcpServers: {
      "taskflow-pro": {
        serverUrl: url,
        headers: { Authorization: bearer },
      },
    },
  };
  const claudeDesktopUnix = {
    mcpServers: {
      "taskflow-pro": {
        command: "npx",
        args: ["-y", "mcp-remote", url, "--header", "Authorization:${AUTH_HEADER}"],
        env: { AUTH_HEADER: bearer },
      },
    },
  };
  const claudeDesktopWindows = {
    mcpServers: {
      "taskflow-pro": {
        command: "cmd",
        args: ["/c", "npx", "-y", "mcp-remote", url, "--header", "Authorization:${AUTH_HEADER}"],
        env: { AUTH_HEADER: bearer },
      },
    },
  };
  return {
    cursor: JSON.stringify(cursor, null, 2),
    claudeCodeCli: `claude mcp add --transport http taskflow-pro ${url} --header "Authorization: ${bearer}"`,
    claudeCodeJson: JSON.stringify(claudeCodeJson, null, 2),
    antigravity: JSON.stringify(antigravity, null, 2),
    claudeDesktopUnix: JSON.stringify(claudeDesktopUnix, null, 2),
    claudeDesktopWindows: JSON.stringify(claudeDesktopWindows, null, 2),
    agentRule: [
      "You are connected to TaskFlow Pro as this user (the MCP token is their account; RLS applies).",
      "When starting work: whoami, then list_projects and list_my_tasks.",
      "Create or update TaskFlow tasks for the work (create_task with assignee_ids + project_id). Keep status in sync (in_progress, in_review, complete_task).",
      "Advance TaskFlow workflows with advance_workflow_stage when a stage is done.",
      "Git commits, documentation files, pull requests, and GitHub Actions stay in this coding tool (git / gh). TaskFlow cannot merge PRs or run CI.",
    ].join("\n"),
  };
}

/** List the current user's active (non-revoked) MCP tokens. Never returns the hash. */
export async function listMcpTokens(): Promise<McpToken[]> {
  const { data, error } = await db
    .from("mcp_access_tokens")
    .select("id, name, token_prefix, last_used_at, expires_at, created_at")
    .is("revoked_at", null)
    .order("created_at", { ascending: false });
  if (error) throw new Error(error.message);
  return (data as McpToken[]) || [];
}

/** Issue a new token. The raw value is returned ONCE — show it, then it's gone. */
export async function issueMcpToken(
  name: string,
  expiresInDays: number,
): Promise<{ token: string; record: McpToken }> {
  return invokeEdgeFunction("issue-mcp-token", {
    body: { name, expiresInDays },
  });
}

/** Revoke a token (soft-delete via revoked_at). */
export async function revokeMcpToken(id: string): Promise<void> {
  const { error } = await db
    .from("mcp_access_tokens")
    .update({ revoked_at: new Date().toISOString() })
    .eq("id", id);
  if (error) throw new Error(error.message);
}
