import { invokeEdgeFunction } from "@/lib/edgeFunctions";

export type TaskAssistAction = "improve_description" | "suggest_subtasks" | "draft_update";

export interface TaskAssistInput {
  action: TaskAssistAction;
  title: string;
  description?: string;
  comments?: string[];
}

export interface TaskAssistResult {
  description?: string;
  subtasks?: string[];
  message?: string;
  model?: string;
}

const MAX_SUBTASKS = 8;
const MAX_SUBTASK_LENGTH = 120;
const MAX_MESSAGE = 500;

export function clampSubtasks(values: unknown): string[] {
  if (!Array.isArray(values)) return [];
  const seen = new Set<string>();
  const next: string[] = [];
  for (const value of values) {
    if (typeof value !== "string") continue;
    const title = value.replace(/\s+/g, " ").trim().slice(0, MAX_SUBTASK_LENGTH);
    const key = title.toLowerCase();
    if (!title || seen.has(key)) continue;
    seen.add(key);
    next.push(title);
    if (next.length >= MAX_SUBTASKS) break;
  }
  return next;
}

export function clampDraft(value: unknown): string {
  if (typeof value !== "string") return "";
  return value.trim().slice(0, MAX_MESSAGE);
}

export async function assistTask(input: TaskAssistInput): Promise<TaskAssistResult> {
  const result = await invokeEdgeFunction<TaskAssistResult>("task-assist", {
    body: {
      action: input.action,
      title: input.title,
      description: input.description ?? "",
      comments: (input.comments ?? []).slice(0, 12),
    },
  });
  return {
    description: typeof result.description === "string" ? result.description.trim() : undefined,
    subtasks: clampSubtasks(result.subtasks),
    message: clampDraft(result.message),
    model: result.model,
  };
}
