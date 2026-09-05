import type { McpTool } from "./types.ts";
import { taskTools } from "./tasks.ts";
import { workflowTools } from "./workflows.ts";
import { orgTools } from "./org.ts";
import { projectTools } from "./projects.ts";

export const allTools: McpTool[] = [...taskTools, ...workflowTools, ...orgTools, ...projectTools];

export const toolsByName: Record<string, McpTool> = Object.fromEntries(
  allTools.map((t) => [t.name, t]),
);

export type { McpTool, ToolContext } from "./types.ts";
