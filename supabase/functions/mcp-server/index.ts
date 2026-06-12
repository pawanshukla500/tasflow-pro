// TaskFlow Pro MCP server — lets external AI clients (Claude, ChatGPT, …) connect
// in over Streamable HTTP and act on TaskFlow data as a specific user.
//
// Auth: a Personal Access Token (PAT) in the Authorization header. We resolve it
// to a user, mint a user-scoped Supabase session, and run every tool through RLS.
// MCP over HTTP is plain JSON-RPC 2.0, so we handle it directly (no SDK) to stay
// compatible with Deno's serverless runtime.

import { adminClient, getUserScopedClient, validatePat } from "../_shared/mcp-auth.ts";
import { allTools, toolsByName, type ToolContext } from "./tools/index.ts";

const PROTOCOL_VERSION = "2025-06-18";
const SERVER_INFO = { name: "taskflow-pro", version: "1.0.0", title: "TaskFlow Pro" };

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, mcp-session-id, mcp-protocol-version",
  "Access-Control-Expose-Headers": "mcp-session-id, mcp-protocol-version",
};

interface JsonRpcMessage {
  jsonrpc: string;
  id?: string | number | null;
  method?: string;
  params?: Record<string, unknown>;
}

function rpcResult(id: unknown, result: unknown) {
  return { jsonrpc: "2.0", id, result };
}
function rpcError(id: unknown, code: number, message: string) {
  return { jsonrpc: "2.0", id, error: { code, message } };
}

async function dispatch(msg: JsonRpcMessage, ctx: ToolContext): Promise<object | null> {
  const { id, method, params } = msg;
  const isNotification = id === undefined || id === null;

  switch (method) {
    case "initialize":
      return rpcResult(id, {
        protocolVersion: (params?.protocolVersion as string) || PROTOCOL_VERSION,
        capabilities: { tools: { listChanged: false } },
        serverInfo: SERVER_INFO,
        instructions:
          "Tools act on TaskFlow Pro tasks, subtasks, workflows, departments and people. " +
          "Everything is scoped to the connected user's role and permissions.",
      });

    case "notifications/initialized":
    case "notifications/cancelled":
      return null; // notifications get no response

    case "ping":
      return rpcResult(id, {});

    case "tools/list":
      return rpcResult(id, {
        tools: allTools.map((t) => ({
          name: t.name,
          description: t.description,
          inputSchema: t.inputSchema,
        })),
      });

    case "tools/call": {
      const name = String(params?.name || "");
      const tool = toolsByName[name];
      if (!tool) return rpcError(id, -32602, `Unknown tool: ${name}`);
      const args = (params?.arguments as Record<string, unknown>) || {};
      try {
        const output = await tool.handler(ctx, args);
        return rpcResult(id, {
          content: [{ type: "text", text: JSON.stringify(output, null, 2) }],
        });
      } catch (err) {
        // Tool execution errors are reported in-band per MCP spec.
        return rpcResult(id, {
          content: [{ type: "text", text: `Error: ${(err as Error).message}` }],
          isError: true,
        });
      }
    }

    default:
      if (isNotification) return null;
      return rpcError(id, -32601, `Method not found: ${method}`);
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  // Streamable HTTP also defines GET (server->client stream); we are stateless.
  if (req.method === "GET") {
    return new Response("Method Not Allowed", { status: 405, headers: corsHeaders });
  }
  if (req.method !== "POST") {
    return new Response("Method Not Allowed", { status: 405, headers: corsHeaders });
  }

  // Authenticate the PAT before any data access. Accept "Bearer <token>",
  // "bearer <token>", or a bare token — some clients omit the prefix.
  const authHeader = req.headers.get("Authorization") || "";
  const rawToken = authHeader.replace(/^Bearer\s+/i, "").trim();
  if (!rawToken) {
    return jsonResponse(rpcError(null, -32001, "Missing access token"), 401);
  }

  let ctx: ToolContext;
  try {
    const admin = adminClient();
    const pat = await validatePat(admin, rawToken);
    const client = await getUserScopedClient(pat);
    ctx = { client, userId: pat.userId, email: pat.email, organizationId: pat.organizationId };
  } catch (err) {
    return jsonResponse(rpcError(null, -32001, (err as Error).message), 401);
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return jsonResponse(rpcError(null, -32700, "Parse error"), 400);
  }

  // Support both a single message and a JSON-RPC batch.
  if (Array.isArray(body)) {
    const responses = (await Promise.all(body.map((m) => dispatch(m as JsonRpcMessage, ctx))))
      .filter((r): r is object => r !== null);
    return responses.length === 0
      ? new Response(null, { status: 202, headers: corsHeaders })
      : jsonResponse(responses);
  }

  const response = await dispatch(body as JsonRpcMessage, ctx);
  return response === null
    ? new Response(null, { status: 202, headers: corsHeaders })
    : jsonResponse(response);
});

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
