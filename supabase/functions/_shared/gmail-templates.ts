// Branded HTML email templates for TaskFlow Pro (legacy helpers).
// Soft-UI teal primary — matches app + React Email shell.
// Keep this file free of React imports so callers can use plain HTML strings.

const SITE_NAME = 'TaskFlow Pro'
const COMPANY_NAME = 'Youthnic'
const COMPANY_LEGAL = 'VB Exports'
const APP_URL =
  (typeof Deno !== 'undefined' ? Deno.env.get('APP_URL') : undefined)?.replace(/\/$/, '') ||
  'https://task.youthnic.shop'
const EMAIL_LOGO_URL =
  (typeof Deno !== 'undefined' ? Deno.env.get('EMAIL_LOGO_URL') : undefined)?.trim() ||
  `${APP_URL}/youthnic-logo.png`

const colors = {
  primary: '#0D9488',
  gradientStart: '#0D9488',
  gradientMid: '#0F766E',
  gradientEnd: '#134E4A',
  text: '#134E4A',
  muted: '#5B7A75',
  border: '#D5E5E2',
  bg: '#F3FAF8',
  danger: '#DC2626',
}

const BASE_STYLES = `
  font-family: 'Plus Jakarta Sans', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
  color: ${colors.text}; line-height: 1.6;
`

function shell(inner: string, heroTitle = 'Notification'): string {
  return `<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:${colors.bg};${BASE_STYLES}">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${colors.bg};padding:28px 12px;">
    <tr><td align="center">
      <table role="presentation" width="640" cellpadding="0" cellspacing="0" style="max-width:640px;background:#ffffff;border-radius:16px;overflow:hidden;border:1px solid ${colors.border};box-shadow:0 18px 40px rgba(13,148,136,0.12);">
        <tr><td style="background:linear-gradient(90deg,${colors.gradientStart},${colors.gradientMid} 55%,${colors.gradientEnd});padding:22px 28px 20px;">
          <table role="presentation" cellpadding="0" cellspacing="0"><tr>
            <td style="vertical-align:middle;">
              <table role="presentation" cellpadding="0" cellspacing="0" style="background:#fff;border-radius:12px;border:1px solid rgba(255,255,255,0.35);"><tr>
                <td style="padding:8px;">
                  <img src="${EMAIL_LOGO_URL}" alt="${SITE_NAME} logo" width="40" height="40" style="display:block;width:40px;height:40px;object-fit:contain;" />
                </td>
              </tr></table>
            </td>
            <td style="vertical-align:middle;padding-left:14px;">
              <div style="font-size:20px;font-weight:800;color:#fff;letter-spacing:-0.4px;line-height:1.2;">${SITE_NAME}</div>
              <div style="font-size:11px;color:rgba(255,255,255,0.88);letter-spacing:0.06em;text-transform:uppercase;">${COMPANY_NAME} · ${COMPANY_LEGAL}</div>
            </td>
          </tr></table>
          <div style="font-size:18px;font-weight:700;color:#fff;margin-top:14px;letter-spacing:-0.2px;">${heroTitle}</div>
        </td></tr>
        <tr><td style="padding:28px;">${inner}</td></tr>
        <tr><td style="background:${colors.bg};padding:16px 28px 24px;border-top:1px solid ${colors.border};">
          <p style="margin:0;font-size:11px;color:${colors.muted};text-align:center;line-height:1.7;">
            © ${new Date().getFullYear()} ${SITE_NAME} · ${COMPANY_NAME} (${COMPANY_LEGAL})<br/>
            Team task &amp; workflow management<br/>
            <a href="${APP_URL}" style="color:${colors.primary};text-decoration:none;font-weight:600;">Open TaskFlow Pro →</a>
          </p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body></html>`
}

function button(label: string, url: string): string {
  return `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:24px 0;"><tr><td style="background:linear-gradient(135deg,${colors.gradientStart},${colors.gradientMid});border-radius:10px;">
    <a href="${url}" style="display:inline-block;padding:12px 28px;color:#fff;font-weight:700;font-size:14px;text-decoration:none;">${label}</a>
  </td></tr></table>`
}

export function taskAssignedEmail(opts: {
  recipientName: string
  taskTitle: string
  taskDescription?: string | null
  priority: string
  dueDate?: string | null
  assignedBy?: string
  taskUrl: string
}) {
  const subject = `New task assigned: ${opts.taskTitle}`
  const html = shell(`
    <h2 style="margin:0 0 16px;font-size:22px;color:${colors.text};">Hi ${opts.recipientName},</h2>
    <p style="margin:0 0 16px;font-size:15px;color:${colors.muted};">
      ${opts.assignedBy ? `<strong>${opts.assignedBy}</strong> assigned a new task to you.` : 'A new task has been assigned to you.'}
    </p>
    <div style="background:${colors.bg};border-left:4px solid ${colors.primary};padding:16px 20px;border-radius:6px;margin:20px 0;">
      <h3 style="margin:0 0 8px;font-size:17px;color:${colors.text};">${opts.taskTitle}</h3>
      ${opts.taskDescription ? `<p style="margin:0 0 12px;font-size:14px;color:${colors.muted};">${opts.taskDescription}</p>` : ''}
      <table cellpadding="0" cellspacing="0" style="font-size:13px;color:${colors.muted};">
        <tr><td style="padding:4px 0;"><strong>Priority:</strong></td><td style="padding:4px 0 4px 12px;color:${colors.text};text-transform:capitalize;">${opts.priority}</td></tr>
        ${opts.dueDate ? `<tr><td style="padding:4px 0;"><strong>Due:</strong></td><td style="padding:4px 0 4px 12px;color:${colors.text};">${new Date(opts.dueDate).toLocaleDateString('en-US',{weekday:'short',month:'short',day:'numeric',year:'numeric'})}</td></tr>` : ''}
      </table>
    </div>
    ${button('View Task', opts.taskUrl)}
  `, 'New task assigned')
  return { subject, html }
}

export function taskDueReminderEmail(opts: {
  recipientName: string
  tasks: { title: string; due_date: string | null; priority: string }[]
  appUrl: string
}) {
  const overdue = opts.tasks.filter((t) => t.due_date && new Date(t.due_date) < new Date(new Date().toDateString()))
  const dueToday = opts.tasks.filter((t) => !overdue.includes(t))
  const subject = overdue.length > 0
    ? `${overdue.length} overdue, ${dueToday.length} due today`
    : `${dueToday.length} task${dueToday.length === 1 ? '' : 's'} due today`

  const renderRow = (t: { title: string; due_date: string | null; priority: string }, isOverdue: boolean) => `
    <tr><td style="padding:10px 0;border-bottom:1px solid ${colors.border};">
      <div style="font-weight:500;color:${colors.text};font-size:14px;">${t.title}</div>
      <div style="font-size:12px;color:${isOverdue ? colors.danger : colors.muted};margin-top:2px;">
        ${isOverdue ? '⚠ Overdue' : 'Due today'} · ${t.priority} priority
      </div>
    </td></tr>`

  const html = shell(`
    <h2 style="margin:0 0 16px;font-size:22px;color:${colors.text};">Hi ${opts.recipientName},</h2>
    <p style="margin:0 0 16px;font-size:15px;color:${colors.muted};">Here’s your pending-task reminder for today.</p>
    <table width="100%" cellpadding="0" cellspacing="0">
      ${overdue.map((t) => renderRow(t, true)).join('')}
      ${dueToday.map((t) => renderRow(t, false)).join('')}
    </table>
    ${button('Open My Tasks', `${opts.appUrl}/my-tasks`)}
  `, 'Pending tasks reminder')
  return { subject, html }
}

export function dailyDigestEmail(opts: {
  recipientName: string
  dateLabel: string
  sectionsHtml: string
  appUrl?: string
}) {
  const subject = `Your daily summary — ${opts.dateLabel}`
  const html = shell(`
    <h2 style="margin:0 0 16px;font-size:22px;color:${colors.text};">Good morning${opts.recipientName ? `, ${opts.recipientName}` : ''}</h2>
    <p style="margin:0 0 16px;font-size:15px;color:${colors.muted};">Your personal pending tasks for ${opts.dateLabel}.</p>
    ${opts.sectionsHtml}
    ${button('Open My Tasks', `${opts.appUrl || APP_URL}/my-tasks`)}
  `, 'Your daily summary')
  return { subject, html }
}
