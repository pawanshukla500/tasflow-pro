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
}

const WeeklyLeadershipInsightEmail = ({
  recipientName,
  weekLabel,
  totalPending = 0,
  totalOverdue = 0,
  departments = [],
  topPerformers = [],
  needsAttention = [],
}: Props) => (
  <EmailShell preview={`Weekly leadership insight — ${totalPending} open tasks`}>
    <Heading style={h1}>Weekly Leadership Insight 📊</Heading>
    <Text style={text}>Hi{recipientName ? ` ${recipientName}` : ''},</Text>
    <Text style={text}>
      Department performance summary for {weekLabel || 'this week'}.
    </Text>
    <Section style={{
      background: '#ffffff', border: `1px solid ${colors.border}`,
      borderRadius: '8px', padding: '12px 16px', margin: '14px 0',
    }}>
      <Text style={{ ...text, fontWeight: 700 }}>
        Org overview: {totalPending} pending · {totalOverdue} overdue
      </Text>
      {topPerformers.length > 0 && (
        <Text style={{ ...mutedText, color: '#16a34a' }}>
          ✅ Doing well: {topPerformers.join(', ')}
        </Text>
      )}
      {needsAttention.length > 0 && (
        <Text style={{ ...mutedText, color: '#dc2626' }}>
          ⚠️ Needs attention: {needsAttention.join(', ')}
        </Text>
      )}
      {departments.map((d, i) => (
        <Text key={i} style={{ ...mutedText, margin: '8px 0', borderBottom: i < departments.length - 1 ? `1px solid ${colors.border}` : 'none', paddingBottom: '8px' }}>
          <strong style={{ color: colors.text }}>{d.name}</strong>
          {' — '}{d.total} open, {d.overdue} overdue, {d.completionPct}% completion
          {d.doneThisWeek > 0 && `, ${d.doneThisWeek} done this week`}
        </Text>
      ))}
    </Section>
    <Text style={mutedText}>
      Your personal pending tasks are sent separately each morning in the daily digest.
    </Text>
    <Section style={{ textAlign: 'center', margin: '20px 0 8px' }}>
      <Button href={`${APP_URL}/reports`} style={button}>Open Reports</Button>
    </Section>
  </EmailShell>
)

export const template = {
  component: WeeklyLeadershipInsightEmail,
  subject: (d) => d.title || 'Weekly leadership insight',
  displayName: 'Weekly leadership insight',
  previewData: {
    title: 'Weekly leadership insight — 24 open tasks',
    recipientName: 'Pawan',
    weekLabel: 'Week 24, 2026',
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
