/**
 * Assignment email policy.
 *
 * Creating a task emails assignees (honors `notification_preferences.task_assigned`).
 * Bulk CSV import stays in-app only so a 50-row import cannot flood inboxes;
 * those tasks still appear on the next daily digest.
 */
export const SEND_EMAIL_ON_TASK_CREATE = true;
export const SEND_EMAIL_ON_TASK_IMPORT = false;
