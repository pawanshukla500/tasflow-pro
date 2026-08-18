/// <reference types="npm:@types/react@18.3.1" />
import * as React from 'npm:react@18.3.1'
import { Button, Heading, Text, Section } from 'npm:@react-email/components@0.0.22'
import type { TemplateEntry } from './registry.ts'
import {
  EmailShell, h1, text, mutedText, button, APP_URL, colors,
  StatRow, ProgressBar, InsightCard,
} from './_layout.tsx'

interface DeptRow {
  name: string
  total: number
  overdue: number
  dueSoon: number
  completionPct: number
}

interface Props {
  recipientName?: string
  dateLabel?: string
  totalPending?: number
  totalOverdue?: number
  totalDueSoon?: number
  companyCompletionPct?: number
  departments?: DeptRow[]
  needsAttention?: string[]
  ctaUrl?: string
}

const AdminDailyOverviewEmail = ({
  recipientName,
  dateLabel,
  totalPending = 0,
  totalOverdue = 0,
  totalDueSoon = 0,
  companyCompletionPct = 0,
  departments = [],
  needsAttention = [],
  ctaUrl,
}: Props) => (
  <EmailShell
    preview={`Team pending-tasks overview — ${totalPending} open, ${totalOverdue} overdue`}
    heroTitle="Daily team overview"
    heroSubtitle={`Company-wide pending tasks · ${dateLabel || 'today'} · 09:30 IST · Mon–Sat`}
  >
    <Heading style={h1}>Good morning{recipientName ? `, ${recipientName}` : ''}</Heading>
    <Text style={text}>
      Here's where your team's work stands today — separate from your own personal task digest
      and the fuller Friday leadership overview.
    </Text>

    <StatRow
      items={[
        { label: 'Open', value: totalPending, accent: colors.primary },
        { label: 'Overdue', value: totalOverdue, accent: colors.danger },
        { label: 'Due soon', value: totalDueSoon, accent: colors.warning },
        { label: 'Completion', value: `${companyCompletionPct}%`, accent: colors.success },
      ]}
    />

    {needsAttention.length > 0 && (
      <InsightCard
        title="Needs attention"
        tone="danger"
        body={`${needsAttention.join(' · ')} — elevated overdue count today.`}
      />
    )}

    <Section style={{
      background: '#ffffff', border: `1px solid ${colors.border}`,
      borderRadius: '12px', padding: '14px 16px', margin: '16px 0',
    }}>
      <Text style={{ ...text, fontWeight: 700, margin: '0 0 12px' }}>Department-wise pending</Text>
      {departments.map((d, i) => (
        <Section
          key={i}
          style={{
            margin: '0 0 12px',
            paddingBottom: '10px',
            borderBottom: i < departments.length - 1 ? `1px solid ${colors.border}` : 'none',
          }}
        >
          <Text style={{ ...text, fontWeight: 700, margin: '0 0 4px', fontSize: '14px' }}>
            {d.name}
            <span style={{ color: colors.primary, fontWeight: 800 }}> · {d.completionPct}%</span>
          </Text>
          <Section style={{ margin: '2px 0 6px' }}>
            <ProgressBar percent={d.completionPct} />
          </Section>
          <Text style={{ ...mutedText, margin: 0 }}>
            {d.total} open · {d.overdue} overdue · {d.dueSoon} due soon
          </Text>
        </Section>
      ))}
      {departments.length === 0 && (
        <Text style={mutedText}>No open tasks across any department today.</Text>
      )}
    </Section>

    <Section style={{ textAlign: 'center', margin: '20px 0 8px' }}>
      <Button href={ctaUrl || `${APP_URL}/reports`} style={button}>Open Reports</Button>
    </Section>
    <Text style={mutedText}>
      Sent Mon–Sat 09:30 IST to Admins and Managing Directors, skipped when the team has nothing
      open. Full week-in-review (top performers, productivity) every Friday.
    </Text>
  </EmailShell>
)

export const template = {
  component: AdminDailyOverviewEmail,
  subject: (d) => d.title || `Team overview — ${d.totalPending || 0} open · ${d.totalOverdue || 0} overdue`,
  displayName: 'Admin daily team overview',
  previewData: {
    recipientName: 'Pawan',
    dateLabel: '18 Aug 2026',
    totalPending: 24,
    totalOverdue: 5,
    totalDueSoon: 8,
    companyCompletionPct: 74,
    departments: [
      { name: 'Exports', total: 12, overdue: 3, dueSoon: 4, completionPct: 62 },
      { name: 'Operations', total: 8, overdue: 1, dueSoon: 2, completionPct: 79 },
    ],
    needsAttention: ['Exports'],
  },
} satisfies TemplateEntry
