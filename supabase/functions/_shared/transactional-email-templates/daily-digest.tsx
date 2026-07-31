/// <reference types="npm:@types/react@18.3.1" />
import * as React from 'npm:react@18.3.1'
import { Button, Heading, Text, Section, Link } from 'npm:@react-email/components@0.0.22'
import type { TemplateEntry } from './registry.ts'
import {
  EmailShell, h1, text, mutedText, button, APP_URL, colors,
  StatRow, InsightCard,
} from './_layout.tsx'

interface TaskItem {
  id: string
  title: string
  dueDate?: string | null
  status?: string
  priority?: string
  url?: string
}

interface WorkflowItem {
  id: string
  title: string
  trackingNumber?: string
  stageName?: string
  status?: string
  dueDate?: string
  url?: string
}

interface Props {
  recipientName?: string
  dateLabel?: string
  delayed?: TaskItem[]
  dueSoon?: TaskItem[]
  pending?: TaskItem[]
  criticalCount?: number
  highCount?: number
  mediumCount?: number
  lowCount?: number
  workflowItems?: WorkflowItem[]
  overdueWorkflows?: WorkflowItem[]
}

const taskRow = (t: TaskItem, accent: string) => (
  <Text key={t.id} style={{ ...mutedText, margin: '6px 0', paddingBottom: '6px', borderBottom: `1px solid ${colors.border}` }}>
    <Link href={t.url || `${APP_URL}/my-tasks?task=${t.id}`} style={{ color: colors.primary, fontWeight: 600, textDecoration: 'none' }}>
      {t.title}
    </Link>
    {t.priority && <span style={{ color: colors.muted }}> · {t.priority}</span>}
    {t.dueDate && <span style={{ color: accent, fontWeight: 600 }}> · due {t.dueDate}</span>}
  </Text>
)

const wfRow = (w: WorkflowItem, accent: string) => (
  <Text key={w.id} style={{ ...mutedText, margin: '6px 0', paddingBottom: '6px', borderBottom: `1px solid ${colors.border}` }}>
    <Link href={w.url || `${APP_URL}/workflows?wf=${w.id}`} style={{ color: colors.primary, fontWeight: 600, textDecoration: 'none' }}>
      {w.trackingNumber ? `${w.trackingNumber} · ` : ''}{w.title}
    </Link>
    {w.stageName && <span style={{ color: colors.muted }}> — {w.stageName}</span>}
    {w.dueDate && <span style={{ color: accent }}> · due {w.dueDate}</span>}
  </Text>
)

const section = (label: string, items: TaskItem[], accent: string) => {
  if (!items?.length) return null
  return (
    <Section style={{ marginBottom: '14px' }}>
      <Text style={{ ...text, fontWeight: 700, color: accent, marginBottom: '6px', fontSize: '13px' }}>
        {label} ({items.length})
      </Text>
      {items.map((t) => taskRow(t, accent))}
    </Section>
  )
}

const DailyDigestEmail = ({
  recipientName,
  dateLabel,
  delayed = [],
  dueSoon = [],
  pending = [],
  criticalCount = 0,
  highCount = 0,
  mediumCount = 0,
  lowCount = 0,
  workflowItems = [],
  overdueWorkflows = [],
}: Props) => {
  const total = delayed.length + dueSoon.length + pending.length
  return (
    <EmailShell
      preview={`Morning briefing — ${total} pending task${total === 1 ? '' : 's'}`}
      heroTitle="Your morning task briefing"
      heroSubtitle={`Daily pending summary · ${dateLabel || 'today'} · 09:30 IST · Mon–Sat`}
    >
      <Heading style={h1}>Good morning{recipientName ? `, ${recipientName}` : ''}</Heading>
      <Text style={text}>
        Here is your personal pending-work summary. You only receive this when you have
        due or pending work — new task creates no longer send a separate email.
      </Text>

      <StatRow
        items={[
          { label: 'Overdue', value: delayed.length, accent: colors.danger },
          { label: 'Due soon', value: dueSoon.length, accent: colors.warning },
          { label: 'Pending', value: pending.length, accent: colors.primary },
          { label: 'Workflows', value: workflowItems.length + overdueWorkflows.length, accent: colors.primaryMid },
        ]}
      />

      {(criticalCount + highCount) > 0 && (
        <InsightCard
          title="Priority focus"
          tone="warning"
          body={`${criticalCount} critical · ${highCount} high · ${mediumCount} medium · ${lowCount} low`}
        />
      )}

      <Section style={{
        background: '#ffffff', border: `1px solid ${colors.border}`,
        borderRadius: '12px', padding: '14px 16px', margin: '14px 0',
      }}>
        {section('Overdue', delayed, colors.danger)}
        {section('Due in the next 3 days', dueSoon, colors.warning)}
        {section('Other pending', pending, colors.primary)}
        {overdueWorkflows.length > 0 && (
          <Section style={{ marginBottom: '12px' }}>
            <Text style={{ ...text, fontWeight: 700, color: colors.danger, marginBottom: '6px', fontSize: '13px' }}>
              Overdue workflows ({overdueWorkflows.length})
            </Text>
            {overdueWorkflows.map((w) => wfRow(w, colors.danger))}
          </Section>
        )}
        {workflowItems.length > 0 && (
          <Section style={{ marginBottom: '12px' }}>
            <Text style={{ ...text, fontWeight: 700, color: colors.primary, marginBottom: '6px', fontSize: '13px' }}>
              Active workflow stages ({workflowItems.length})
            </Text>
            {workflowItems.map((w) => wfRow(w, colors.primary))}
          </Section>
        )}
        {total === 0 && workflowItems.length === 0 && overdueWorkflows.length === 0 && (
          <Text style={mutedText}>All caught up — no pending items today. Nice work.</Text>
        )}
      </Section>

      <Section style={{ textAlign: 'center', margin: '20px 0 8px' }}>
        <Button href={`${APP_URL}/my-tasks`} style={button}>Open My Tasks</Button>
      </Section>
      <Text style={mutedText}>
        Prefer fewer emails? Turn off “Daily digest summary” in Settings → Notifications.
      </Text>
    </EmailShell>
  )
}

export const template = {
  component: DailyDigestEmail,
  subject: (d) => d.title || `Morning briefing — ${(d.delayed?.length || 0) + (d.dueSoon?.length || 0) + (d.pending?.length || 0)} pending tasks`,
  displayName: 'Daily digest',
  previewData: {
    title: 'Morning briefing — 5 pending tasks',
    recipientName: 'Pawan',
    dateLabel: '30 Jul 2026',
    delayed: [{ id: '1', title: 'Follow up export order', dueDate: '2026-07-28', priority: 'high' }],
    dueSoon: [{ id: '2', title: 'Review team KPIs', dueDate: '2026-07-31', priority: 'medium' }],
    pending: [{ id: '3', title: 'Update workflow template', priority: 'low' }],
    criticalCount: 1,
    highCount: 2,
    mediumCount: 1,
    lowCount: 1,
    workflowItems: [{ id: 'w1', title: 'Procurement', trackingNumber: 'WF-20260730-000001', stageName: 'QC Check' }],
  },
} satisfies TemplateEntry
