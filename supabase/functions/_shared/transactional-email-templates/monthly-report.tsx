/// <reference types="npm:@types/react@18.3.1" />
import * as React from 'npm:react@18.3.1'
import { Button, Heading, Text, Section } from 'npm:@react-email/components@0.0.22'
import type { TemplateEntry } from './registry.ts'
import { EmailShell, h1, text, mutedText, button, APP_URL, colors, StatRow, ProgressBar } from './_layout.tsx'

interface Props {
  recipientName?: string
  monthLabel?: string
  totalTasks?: number
  completedTasks?: number
  overdueTasks?: number
  completionPct?: number
}

const MonthlyReportEmail = ({
  recipientName, monthLabel, totalTasks = 0, completedTasks = 0, overdueTasks = 0, completionPct = 0,
}: Props) => (
  <EmailShell
    preview={`Your ${monthLabel || 'monthly'} TaskFlow summary — ${completionPct}% completion`}
    heroTitle={`${monthLabel || 'Monthly'} report`}
    heroSubtitle={`Org-wide completion · ${completionPct}%`}
  >
    <Heading style={h1}>{monthLabel || 'Monthly'} report 📊</Heading>
    <Text style={text}>Hi{recipientName ? ` ${recipientName}` : ''}, here's a quick summary of activity in TaskFlow.</Text>

    <Section style={{
      background: '#ffffff', border: `1px solid ${colors.border}`,
      borderRadius: '12px', padding: '14px 16px', margin: '16px 0',
    }}>
      <Text style={{ ...text, fontWeight: 700, margin: '0 0 6px', fontSize: '14px' }}>
        Completion rate
        <span style={{ color: colors.primary, fontWeight: 800 }}> · {completionPct}%</span>
      </Text>
      <ProgressBar percent={completionPct} />
    </Section>

    <StatRow
      items={[
        { label: 'Total tasks', value: totalTasks, accent: colors.primary },
        { label: 'Completed', value: completedTasks, accent: colors.success },
        { label: 'Overdue', value: overdueTasks, accent: colors.danger },
      ]}
    />
    <Section style={{ textAlign: 'center', margin: '20px 0 8px' }}>
      <Button href={`${APP_URL}/dashboard`} style={button}>Open dashboard</Button>
    </Section>
  </EmailShell>
)

export const template = {
  component: MonthlyReportEmail,
  subject: (d) => `${d.monthLabel || 'Monthly'} TaskFlow report — ${d.completionPct ?? 0}% completion`,
  displayName: 'Monthly report',
  previewData: {
    recipientName: 'Priya', monthLabel: 'April', totalTasks: 42, completedTasks: 31, overdueTasks: 3, completionPct: 74,
  },
} satisfies TemplateEntry
