import type { McpTool } from "./types.ts";
import { taskTools } from "./tasks.ts";
import { workflowTools } from "./workflows.ts";
import { orgTools } from "./org.ts";

export const allTools: McpTool[] = [...taskTools, ...workflowTools, ...orgTools];

export const toolsByName: Record<string, McpTool> = Object.fromEntries(
  allTools.map((t) => [t.name, t]),
);

export type { McpTool, ToolContext } from "./types.ts";
