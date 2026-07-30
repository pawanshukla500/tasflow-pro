/// <reference types="npm:@types/react@18.3.1" />
import * as React from 'npm:react@18.3.1'
import { Button, Heading, Text, Section } from 'npm:@react-email/components@0.0.22'
import type { TemplateEntry } from './registry.ts'
import { EmailShell, h1, text, mutedText, button, APP_URL, colors } from './_layout.tsx'

interface DeptRow {
  name: string
  total: number
  overdue: number
  dueSoon: number
  completionPct: number
  doneThisWeek: number
}

interface Props {
  recipientName?: string
  weekLabel?: string
  totalPending?: number
  totalOverdue?: number
  departments?: DeptRow[]
  topPerformers?: string[]
  needsAttention?: string[]
  ctaLabel?: string
  ctaUrl?: string
}

const WeeklyLeadershipInsightEmail = ({
  recipientName,
  weekLabel,
  totalPending = 0,
  totalOverdue = 0,
  departments = [],
  topPerformers = [],
  needsAttention = [],
  ctaLabel = 'Open Reports',
  ctaUrl,
}: Props) => (
  <EmailShell
    preview={`Friday leadership overlook — ${totalPending} open tasks`}
    heroTitle="Friday leadership overlook"
    heroSubtitle={`Department performance · ${weekLabel || 'this week'}`}
  >
    <Heading style={h1}>Which departments are doing well?</Heading>
    <Text style={text}>Hi{recipientName ? ` ${recipientName}` : ''},</Text>
    <Text style={text}>
      Your weekly Admin / MD overview for {weekLabel || 'this week'}. Use this to spot strong teams and where support is needed.
    </Text>

    <Section style={{
      background: colors.bg, border: `1px solid ${colors.border}`,
      borderRadius: '12px', padding: '14px 18px', margin: '14px 0',
    }}>
      <Text style={{ ...text, fontWeight: 700, margin: '0 0 8px' }}>
        Org snapshot: {totalPending} open · {totalOverdue} overdue
      </Text>
      {topPerformers.length > 0 && (
        <Text style={{ ...mutedText, color: colors.success, margin: '6px 0' }}>
          ✅ Doing well: {topPerformers.join(', ')}
        </Text>
      )}
      {needsAttention.length > 0 && (
        <Text style={{ ...mutedText, color: colors.danger, margin: '6px 0' }}>
          ⚠️ Needs attention: {needsAttention.join(', ')}
        </Text>
      )}
    </Section>

    <Section style={{
      background: '#ffffff', border: `1px solid ${colors.border}`,
      borderRadius: '12px', padding: '12px 16px', margin: '14px 0',
    }}>
      <Text style={{ ...text, fontWeight: 700, margin: '0 0 10px' }}>By department</Text>
      {departments.map((d, i) => (
        <Text
          key={i}
          style={{
            ...mutedText,
            margin: '8px 0',
            borderBottom: i < departments.length - 1 ? `1px solid ${colors.border}` : 'none',
            paddingBottom: '8px',
          }}
        >
          <strong style={{ color: colors.text }}>{d.name}</strong>
          {' — '}{d.total} open, {d.overdue} overdue, {d.completionPct}% completion
          {d.doneThisWeek > 0 && `, ${d.doneThisWeek} completed this week`}
        </Text>
      ))}
      {departments.length === 0 && (
        <Text style={mutedText}>No department activity this week.</Text>
      )}
    </Section>

    <Text style={mutedText}>
      Personal pending-task digests go to everyone each morning. This Friday mail is for leadership overlook only.
    </Text>
    <Section style={{ textAlign: 'center', margin: '20px 0 8px' }}>
      <Button href={ctaUrl || `${APP_URL}/reports`} style={button}>{ctaLabel}</Button>
    </Section>
  </EmailShell>
)

export const template = {
  component: WeeklyLeadershipInsightEmail,
  subject: (d) => d.title || `Friday leadership overlook — ${d.totalPending || 0} open tasks`,
  displayName: 'Weekly leadership insight',
  previewData: {
    title: 'Friday leadership overlook — 24 open tasks',
    recipientName: 'Pawan',
    weekLabel: 'Week ending Fri 31 Jul 2026',
    totalPending: 24,
    totalOverdue: 5,
    departments: [
      { name: 'Exports', total: 12, overdue: 3, dueSoon: 2, completionPct: 68, doneThisWeek: 4 },
      { name: 'Operations', total: 8, overdue: 1, dueSoon: 1, completionPct: 82, doneThisWeek: 6 },
    ],
    topPerformers: ['Operations'],
    needsAttention: ['Exports'],
  },
} satisfies TemplateEntry
