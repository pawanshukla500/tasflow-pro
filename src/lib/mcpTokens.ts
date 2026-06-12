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
  expiresInDays?: number,
): Promise<{ token: string; record: McpToken }> {
  return invokeEdgeFunction("issue-mcp-token", {
    body: { name, ...(expiresInDays ? { expiresInDays } : {}) },
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
