// Branded HTML email templates for VB Exports TaskFlow
// Indigo (#6366f1) primary, dark navy headers, DM Sans-style font stack.

const BASE_STYLES = `
  font-family: 'DM Sans', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
  color: #1a1a2e; line-height: 1.6;
`

function shell(inner: string): string {
  return `<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f5f5f7;${BASE_STYLES}">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f5f5f7;padding:32px 16px;">
    <tr><td align="center">
      <table role="presentation" width="600" cellpadding="0" cellspacing="0" style="max-width:600px;background:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,0.04);">
        <tr><td style="background:#1a1a2e;padding:24px 32px;">
          <h1 style="margin:0;color:#fff;font-size:20px;font-weight:600;letter-spacing:-0.01em;">VB Exports TaskFlow</h1>
        </td></tr>
        <tr><td style="padding:32px;">${inner}</td></tr>
        <tr><td style="background:#fafafa;padding:20px 32px;border-top:1px solid #eaeaea;">
          <p style="margin:0;font-size:12px;color:#6b7280;text-align:center;">
            VB Exports TaskFlow · Manage notifications in Settings
          </p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body></html>`
}

function button(label: string, url: string): string {
  return `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:24px 0;"><tr><td style="background:#6366f1;border-radius:8px;">
    <a href="${url}" style="display:inline-block;padding:12px 28px;color:#fff;font-weight:600;font-size:14px;text-decoration:none;">${label}</a>
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
    <h2 style="margin:0 0 16px;font-size:22px;color:#1a1a2e;">Hi ${opts.recipientName},</h2>
    <p style="margin:0 0 16px;font-size:15px;color:#4b5563;">
      ${opts.assignedBy ? `<strong>${opts.assignedBy}</strong> assigned a new task to you.` : 'A new task has been assigned to you.'}
    </p>
    <div style="background:#f5f5ff;border-left:4px solid #6366f1;padding:16px 20px;border-radius:6px;margin:20px 0;">
      <h3 style="margin:0 0 8px;font-size:17px;color:#1a1a2e;">${opts.taskTitle}</h3>
      ${opts.taskDescription ? `<p style="margin:0 0 12px;font-size:14px;color:#4b5563;">${opts.taskDescription}</p>` : ''}
      <table cellpadding="0" cellspacing="0" style="font-size:13px;color:#6b7280;">
        <tr><td style="padding:4px 0;"><strong>Priority:</strong></td><td style="padding:4px 0 4px 12px;color:#1a1a2e;text-transform:capitalize;">${opts.priority}</td></tr>
        ${opts.dueDate ? `<tr><td style="padding:4px 0;"><strong>Due:</strong></td><td style="padding:4px 0 4px 12px;color:#1a1a2e;">${new Date(opts.dueDate).toLocaleDateString('en-US',{weekday:'short',month:'short',day:'numeric',year:'numeric'})}</td></tr>` : ''}
      </table>
    </div>
    ${button('View Task', opts.taskUrl)}
  `)
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

  const renderRow = (t: any, isOverdue: boolean) => `
    <tr><td style="padding:10px 0;border-bottom:1px solid #eaeaea;">
      <div style="font-weight:500;color:#1a1a2e;font-size:14px;">${t.title}</div>
      <div style="font-size:12px;color:${isOverdue ? '#dc2626' : '#6b7280'};margin-top:2px;">
        ${isOverdue ? '⚠ Overdue' : 'Due today'} · ${t.priority} priority
      </div>
    </td></tr>`

  const html = shell(`
    <h2 style="margin:0 0 16px;font-size:22px;color:#1a1a2e;">Hi ${opts.recipientName},</h2>
    <p style="margin:0 0 20px;font-size:15px;color:#4b5563;">Here's your task summary:</p>
    ${overdue.length > 0 ? `
      <h3 style="margin:20px 0 8px;font-size:15px;color:#dc2626;">Overdue (${overdue.length})</h3>
      <table width="100%" cellpadding="0" cellspacing="0">${overdue.map((t) => renderRow(t, true)).join('')}</table>
    ` : ''}
    ${dueToday.length > 0 ? `
      <h3 style="margin:20px 0 8px;font-size:15px;color:#1a1a2e;">Due today (${dueToday.length})</h3>
      <table width="100%" cellpadding="0" cellspacing="0">${dueToday.map((t) => renderRow(t, false)).join('')}</table>
    ` : ''}
    ${button('Open TaskFlow', opts.appUrl)}
  `)
  return { subject, html }
}

export function monthlyReportEmail(opts: {
  recipientName: string
  monthLabel: string
  totalTasks: number
  completedTasks: number
  completionRate: number
  departments: { name: string; total: number; completed: number; rate: number }[]
  topPerformers: { name: string; completed: number; assigned: number }[]
  appUrl: string
}) {
  const subject = `Monthly Performance Report — ${opts.monthLabel}`
  const html = shell(`
    <h2 style="margin:0 0 16px;font-size:22px;color:#1a1a2e;">Hi ${opts.recipientName},</h2>
    <p style="margin:0 0 24px;font-size:15px;color:#4b5563;">Performance summary for <strong>${opts.monthLabel}</strong>:</p>

    <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:24px;">
      <tr>
        <td style="background:#f5f5ff;padding:16px;border-radius:8px;text-align:center;width:33%;">
          <div style="font-size:24px;font-weight:700;color:#6366f1;">${opts.totalTasks}</div>
          <div style="font-size:12px;color:#6b7280;margin-top:4px;">Total Tasks</div>
        </td>
        <td style="width:8px;"></td>
        <td style="background:#f0fdf4;padding:16px;border-radius:8px;text-align:center;width:33%;">
          <div style="font-size:24px;font-weight:700;color:#16a34a;">${opts.completedTasks}</div>
          <div style="font-size:12px;color:#6b7280;margin-top:4px;">Completed</div>
        </td>
        <td style="width:8px;"></td>
        <td style="background:#fef3c7;padding:16px;border-radius:8px;text-align:center;width:33%;">
          <div style="font-size:24px;font-weight:700;color:#d97706;">${opts.completionRate}%</div>
          <div style="font-size:12px;color:#6b7280;margin-top:4px;">Completion Rate</div>
        </td>
      </tr>
    </table>

    <h3 style="margin:24px 0 12px;font-size:16px;color:#1a1a2e;">Department Performance</h3>
    <table width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;">
      <tr style="background:#fafafa;">
        <th style="text-align:left;padding:10px;font-size:12px;color:#6b7280;border-bottom:1px solid #eaeaea;">Department</th>
        <th style="text-align:center;padding:10px;font-size:12px;color:#6b7280;border-bottom:1px solid #eaeaea;">Total</th>
        <th style="text-align:center;padding:10px;font-size:12px;color:#6b7280;border-bottom:1px solid #eaeaea;">Done</th>
        <th style="text-align:right;padding:10px;font-size:12px;color:#6b7280;border-bottom:1px solid #eaeaea;">Rate</th>
      </tr>
      ${opts.departments.map((d) => `
        <tr>
          <td style="padding:10px;font-size:14px;border-bottom:1px solid #f0f0f0;">${d.name}</td>
          <td style="padding:10px;font-size:14px;text-align:center;border-bottom:1px solid #f0f0f0;">${d.total}</td>
          <td style="padding:10px;font-size:14px;text-align:center;border-bottom:1px solid #f0f0f0;">${d.completed}</td>
          <td style="padding:10px;font-size:14px;text-align:right;font-weight:600;color:${d.rate >= 70 ? '#16a34a' : d.rate >= 40 ? '#d97706' : '#dc2626'};border-bottom:1px solid #f0f0f0;">${d.rate}%</td>
        </tr>
      `).join('')}
    </table>

    ${opts.topPerformers.length > 0 ? `
      <h3 style="margin:24px 0 12px;font-size:16px;color:#1a1a2e;">Top Performers</h3>
      <table width="100%" cellpadding="0" cellspacing="0">
        ${opts.topPerformers.slice(0, 5).map((p, i) => `
          <tr><td style="padding:10px 0;border-bottom:1px solid #eaeaea;">
            <table width="100%"><tr>
              <td style="font-size:14px;color:#1a1a2e;">
                <span style="display:inline-block;width:24px;height:24px;line-height:24px;text-align:center;background:#6366f1;color:#fff;border-radius:50%;font-size:12px;font-weight:600;margin-right:10px;">${i + 1}</span>
                ${p.name}
              </td>
              <td style="text-align:right;font-size:13px;color:#6b7280;">${p.completed}/${p.assigned} tasks</td>
            </tr></table>
          </td></tr>
        `).join('')}
      </table>
    ` : ''}

    ${button('View Full Dashboard', opts.appUrl)}
  `)
  return { subject, html }
}
