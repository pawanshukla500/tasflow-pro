/// <reference types="npm:@types/react@18.3.1" />
import * as React from 'npm:react@18.3.1'
import { Button, Heading, Text, Section } from 'npm:@react-email/components@0.0.22'
import type { TemplateEntry } from './registry.ts'
import { EmailShell, h1, text, mutedText, button, APP_URL, colors } from './_layout.tsx'

interface TaskItem {
  id: string
  title: string
  dueDate?: string | null
  status?: string
  url?: string
}

interface DeptSummary {
  name: string
  total: number
  overdue: number
  dueSoon: number
}

interface Props {
  recipientName?: string
  dateLabel?: string
  departments?: DeptSummary[]
  delayed?: TaskItem[]
  dueSoon?: TaskItem[]
  pending?: TaskItem[]
  ctaUrl?: string
}

const taskRow = (t: TaskItem, accent: string) => (
  <Text key={t.id} style={{ ...mutedText, margin: '6px 0', paddingBottom: '6px', borderBottom: `1px solid ${colors.border}` }}>
    {t.title}
    {t.dueDate && <span style={{ color: accent }}> — due {t.dueDate}</span>}
  </Text>
)

const DepartmentDailySummaryEmail = ({
  recipientName,
  dateLabel,
  departments = [],
  delayed = [],
  dueSoon = [],
  pending = [],
  ctaUrl,
}: Props) => {
  const total = delayed.length + dueSoon.length + pending.length
  return (
    <EmailShell preview={`Department summary — ${total} open tasks`}>
      <Heading style={h1}>Department Daily Summary 📋</Heading>
      <Text style={text}>Hi{recipientName ? ` ${recipientName}` : ''},</Text>
      <Text style={text}>Team workload overview for {dateLabel || 'today'}.</Text>
      <Section style={{
        background: '#ffffff', border: `1px solid ${colors.border}`,
        borderRadius: '8px', padding: '12px 16px', margin: '14px 0',
      }}>
        {departments.map((d, i) => (
          <Text key={i} style={{ ...mutedText, margin: '6px 0' }}>
            <strong style={{ color: colors.text }}>{d.name}</strong>
            {' — '}{d.total} open · {d.overdue} overdue · {d.dueSoon} due soon
          </Text>
        ))}
        {delayed.length > 0 && (
          <>
            <Text style={{ ...text, fontWeight: 700, color: '#dc2626', marginTop: '12px' }}>
              Overdue ({delayed.length})
            </Text>
            {delayed.slice(0, 8).map((t) => taskRow(t, '#dc2626'))}
          </>
        )}
        {dueSoon.length > 0 && (
          <>
            <Text style={{ ...text, fontWeight: 700, color: '#f59e0b', marginTop: '12px' }}>
              Due soon ({dueSoon.length})
            </Text>
            {dueSoon.slice(0, 8).map((t) => taskRow(t, '#f59e0b'))}
          </>
        )}
        {pending.length > 0 && (
          <>
            <Text style={{ ...text, fontWeight: 700, color: colors.primary, marginTop: '12px' }}>
              Pending ({pending.length})
            </Text>
            {pending.slice(0, 5).map((t) => taskRow(t, colors.primary))}
          </>
        )}
      </Section>
      <Section style={{ textAlign: 'center', margin: '20px 0 8px' }}>
        <Button href={ctaUrl || `${APP_URL}/reports`} style={button}>Open Reports</Button>
      </Section>
    </EmailShell>
  )
}

export const template = {
  component: DepartmentDailySummaryEmail,
  subject: (data: Record<string, unknown>) =>
    String(data.title || 'Your department daily summary'),
  displayName: 'Department Daily Summary',
  previewData: {
    recipientName: 'Team Leader',
    dateLabel: '10 Jun 2026',
    departments: [{ name: 'Operations', total: 12, overdue: 3, dueSoon: 4 }],
    delayed: [{ id: '1', title: 'Review shipment docs', dueDate: '2026-06-08' }],
    dueSoon: [{ id: '2', title: 'Update inventory', dueDate: '2026-06-12' }],
    pending: [{ id: '3', title: 'Plan weekly standup', dueDate: null }],
  },
} satisfies TemplateEntry
