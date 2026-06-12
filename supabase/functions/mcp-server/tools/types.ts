import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.74.0";

/** Identity + RLS-scoped client passed to every tool handler. */
export interface ToolContext {
  client: SupabaseClient;
  userId: string;
  email: string;
  organizationId: string | null;
}

export interface McpTool {
  name: string;
  description: string;
  /** JSON Schema for the tool arguments. */
  inputSchema: Record<string, unknown>;
  /** Returns any JSON-serializable value; the server wraps it as text content. */
  handler: (ctx: ToolContext, args: Record<string, unknown>) => Promise<unknown>;
}

/** Small helper for an object JSON Schema. */
export function objectSchema(
  properties: Record<string, unknown>,
  required: string[] = [],
): Record<string, unknown> {
  return { type: "object", properties, required, additionalProperties: false };
}
