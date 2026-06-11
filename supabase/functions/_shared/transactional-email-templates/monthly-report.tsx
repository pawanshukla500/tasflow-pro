/// <reference types="npm:@types/react@18.3.1" />
import * as React from 'npm:react@18.3.1'
import { Button, Heading, Text, Section } from 'npm:@react-email/components@0.0.22'
import type { TemplateEntry } from './registry.ts'
import { EmailShell, h1, text, mutedText, button, APP_URL, colors } from './_layout.tsx'

interface Props {
  recipientName?: string
  monthLabel?: string
  totalTasks?: number
  completedTasks?: number
  overdueTasks?: number
}

const MonthlyReportEmail = ({ recipientName, monthLabel, totalTasks = 0, completedTasks = 0, overdueTasks = 0 }: Props) => (
  <EmailShell preview={`Your ${monthLabel || 'monthly'} TaskFlow summary`}>
    <Heading style={h1}>{monthLabel || 'Monthly'} report 📊</Heading>
    <Text style={text}>Hi{recipientName ? ` ${recipientName}` : ''}, here's a quick summary of activity in TaskFlow.</Text>
    <Section style={{
      display: 'flex', gap: '8px', margin: '16px 0', justifyContent: 'space-between',
    }}>
      {[
        { label: 'Total tasks', value: totalTasks, color: colors.primary },
        { label: 'Completed', value: completedTasks, color: '#16a34a' },
        { label: 'Overdue', value: overdueTasks, color: '#dc2626' },
      ].map((s) => (
        <Section key={s.label} style={{
          flex: 1, background: '#ffffff', border: `1px solid ${colors.border}`,
          borderRadius: '8px', padding: '14px 8px', textAlign: 'center', margin: '0 4px',
        }}>
          <Text style={{ fontSize: '24px', fontWeight: 700, color: s.color, margin: 0 }}>{s.value}</Text>
          <Text style={{ ...mutedText, margin: '4px 0 0', fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>{s.label}</Text>
        </Section>
      ))}
    </Section>
    <Section style={{ textAlign: 'center', margin: '20px 0 8px' }}>
      <Button href={`${APP_URL}/dashboard`} style={button}>Open dashboard</Button>
    </Section>
  </EmailShell>
)

export const template = {
  component: MonthlyReportEmail,
  subject: (d) => `${d.monthLabel || 'Monthly'} TaskFlow report`,
  displayName: 'Monthly report',
  previewData: { recipientName: 'Priya', monthLabel: 'April', totalTasks: 42, completedTasks: 31, overdueTasks: 3 },
} satisfies TemplateEntry
