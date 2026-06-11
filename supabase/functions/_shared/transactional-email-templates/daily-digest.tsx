/// <reference types="npm:@types/react@18.3.1" />
import * as React from 'npm:react@18.3.1'
import { Button, Heading, Text, Section, Link } from 'npm:@react-email/components@0.0.22'
import type { TemplateEntry } from './registry.ts'
import { EmailShell, h1, text, mutedText, button, APP_URL, colors, EmailDetailCard } from './_layout.tsx'

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
    {t.priority && <span style={{ color: colors.muted }}> [{t.priority}]</span>}
    {t.dueDate && <span style={{ color: accent }}> — due {t.dueDate}</span>}
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
    <Section style={{ marginBottom: '12px' }}>
      <Text style={{ ...text, fontWeight: 700, color: accent, marginBottom: '4px' }}>{label} ({items.length})</Text>
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
      preview={`Good morning — ${total} task${total === 1 ? '' : 's'}, ${workflowItems.length} workflow${workflowItems.length === 1 ? '' : 's'}`}
      heroTitle="Your daily summary"
      heroSubtitle={`Personal digest for ${dateLabel || 'today'}`}
    >
      <Heading style={h1}>Good morning{recipientName ? `, ${recipientName}` : ''} ☀️</Heading>
      <Text style={text}>Your personal task and workflow summary — only items assigned to you.</Text>
      {(criticalCount + highCount + mediumCount + lowCount) > 0 && (
        <EmailDetailCard title="Priority breakdown">
          {criticalCount > 0 && <Text style={mutedText}>🔴 Critical: {criticalCount}</Text>}
          {highCount > 0 && <Text style={mutedText}>🟠 High: {highCount}</Text>}
          {mediumCount > 0 && <Text style={mutedText}>🔵 Medium: {mediumCount}</Text>}
          {lowCount > 0 && <Text style={mutedText}>⚪ Low: {lowCount}</Text>}
        </EmailDetailCard>
      )}
      <Section style={{
        background: colors.bg, border: `1px solid ${colors.border}`,
        borderRadius: '12px', padding: '12px 16px', margin: '14px 0',
      }}>
        {section('🔴 Overdue / Breached tasks', delayed, colors.danger)}
        {section('🟠 Due soon (next 3 days)', dueSoon, colors.warning)}
        {section('📋 Pending tasks', pending, colors.primary)}
        {overdueWorkflows.length > 0 && (
          <Section style={{ marginBottom: '12px' }}>
            <Text style={{ ...text, fontWeight: 700, color: colors.danger, marginBottom: '4px' }}>
              ⚠️ Overdue workflows ({overdueWorkflows.length})
            </Text>
            {overdueWorkflows.map((w) => wfRow(w, colors.danger))}
          </Section>
        )}
        {workflowItems.length > 0 && (
          <Section style={{ marginBottom: '12px' }}>
            <Text style={{ ...text, fontWeight: 700, color: colors.primary, marginBottom: '4px' }}>
              🔄 Your workflow stages ({workflowItems.length})
            </Text>
            {workflowItems.map((w) => wfRow(w, colors.primary))}
          </Section>
        )}
        {total === 0 && workflowItems.length === 0 && (
          <Text style={mutedText}>All caught up — no pending items today.</Text>
        )}
      </Section>
      <Section style={{ textAlign: 'center', margin: '20px 0 8px' }}>
        <Button href={`${APP_URL}/my-tasks`} style={button}>Open My Tasks</Button>
      </Section>
    </EmailShell>
  )
}

export const template = {
  component: DailyDigestEmail,
  subject: (d) => d.title || `Your daily summary — ${(d.delayed?.length || 0) + (d.dueSoon?.length || 0) + (d.pending?.length || 0)} tasks`,
  displayName: 'Daily digest',
  previewData: {
    title: 'Your daily summary — 5 tasks',
    recipientName: 'Pawan',
    dateLabel: '10 Jun 2026',
    delayed: [{ id: '1', title: 'Follow up export order', dueDate: '2026-06-08', priority: 'high' }],
    dueSoon: [{ id: '2', title: 'Review team KPIs', dueDate: '2026-06-11', priority: 'medium' }],
    pending: [{ id: '3', title: 'Update workflow template', priority: 'low' }],
    criticalCount: 1,
    highCount: 2,
    mediumCount: 1,
    lowCount: 1,
    workflowItems: [{ id: 'w1', title: 'Procurement', trackingNumber: 'WF-20260611-000001', stageName: 'QC Check' }],
  },
} satisfies TemplateEntry
