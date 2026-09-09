/**
 * Assignment notification policy.
 *
 * Creating a task emails assignees (honors `notification_preferences.task_assigned`)
 * and sends a WhatsApp Utility template when a mobile number is on the profile
 * (honors `notification_preferences.whatsapp_alerts`).
 * Bulk CSV import stays in-app only so a 50-row import cannot flood inboxes or
 * WhatsApp; those tasks still appear on the next daily digest.
 */
export const SEND_EMAIL_ON_TASK_CREATE = true;
export const SEND_EMAIL_ON_TASK_IMPORT = false;
