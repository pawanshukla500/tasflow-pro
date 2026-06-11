import type { SupabaseClient } from "npm:@supabase/supabase-js@2";

export type InAppNotificationType =
  | "task_assigned"
  | "task_updated"
  | "task_due"
  | "task_overdue"
  | "workflow_assigned"
  | "workflow_update"
  | "workflow_breach"
  | "workflow_approved"
  | "workflow_rejected"
  | "workflow_comment"
  | "mention"
  | "message"
  | "system";

export async function createInAppNotification(
  admin: SupabaseClient,
  opts: {
    userId: string;
    type: InAppNotificationType;
    title: string;
    body?: string;
    actionUrl?: string;
    metadata?: Record<string, unknown>;
  },
): Promise<void> {
  const { error } = await admin.from("in_app_notifications").insert({
    user_id: opts.userId,
    notification_type: opts.type,
    title: opts.title,
    body: opts.body || null,
    action_url: opts.actionUrl || null,
    metadata: opts.metadata || {},
  });
  if (error) {
    console.warn("in_app_notification insert failed:", error.message);
  }
}
