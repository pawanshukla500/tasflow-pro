/// <reference types="npm:@types/react@18.3.1" />
import * as React from 'npm:react@18.3.1'
import { Button, Heading, Text, Section } from 'npm:@react-email/components@0.0.22'
import type { TemplateEntry } from './registry.ts'
import {
  EmailShell, h1, text, mutedText, button, APP_URL, colors,
  StatRow, InsightCard,
} from './_layout.tsx'

interface DeptRow {
  name: string
  total: number
  overdue: number
  dueSoon: number
  completed: number
  completionPct: number
  doneThisWeek: number
}

interface EmployeeRow {
  name: string
  completedThisWeek: number
  overdue: number
  open: number
}

interface Props {
  recipientName?: string
  weekLabel?: string
  totalPending?: number
  totalOverdue?: number
  totalCompleted?: number
  totalDoneThisWeek?: number
  companyCompletionPct?: number
  departments?: DeptRow[]
  topPerformers?: string[]
  needsAttention?: string[]
  topEmployees?: EmployeeRow[]
  insights?: string[]
  recommendations?: string[]
  ctaLabel?: string
  ctaUrl?: string
}

const WeeklyLeadershipInsightEmail = ({
  recipientName,
  weekLabel,
  totalPending = 0,
  totalOverdue = 0,
  totalCompleted = 0,
  totalDoneThisWeek = 0,
  companyCompletionPct = 0,
  departments = [],
  topPerformers = [],
  needsAttention = [],
  topEmployees = [],
  insights = [],
  recommendations = [],
  ctaLabel = 'Open Reports',
  ctaUrl,
}: Props) => (
  <EmailShell
    preview={`Friday management overview — ${companyCompletionPct}% company completion`}
    heroTitle="Weekly management overview"
    heroSubtitle={`Department performance · ${weekLabel || 'this week'}`}
  >
    <Heading style={h1}>Friday leadership briefing</Heading>
    <Text style={text}>Hi{recipientName ? ` ${recipientName}` : ''},</Text>
    <Text style={text}>
      Your weekly Admin / MD overview for {weekLabel || 'this week'}. Spot strong departments,
      teams that need follow-up, and overall company task health.
    </Text>

    <StatRow
      items={[
        { label: 'Completion', value: `${companyCompletionPct}%`, accent: colors.primary },
        { label: 'Open', value: totalPending, accent: colors.primaryMid },
        { label: 'Overdue', value: totalOverdue, accent: colors.danger },
        { label: 'Done this week', value: totalDoneThisWeek, accent: colors.success },
      ]}
    />

    <Text style={{ ...mutedText, margin: '0 0 12px' }}>
      Lifetime completed across the org: <strong style={{ color: colors.text }}>{totalCompleted}</strong>
    </Text>

    {topPerformers.length > 0 && (
      <InsightCard
        title="Best-performing departments"
        tone="success"
        body={topPerformers.join(' · ')}
      />
    )}
    {needsAttention.length > 0 && (
      <InsightCard
        title="Departments that need attention"
        tone="danger"
        body={needsAttention.join(' · ')}
      />
    )}

    <Section style={{
      background: '#ffffff', border: `1px solid ${colors.border}`,
      borderRadius: '12px', padding: '14px 16px', margin: '16px 0',
    }}>
      <Text style={{ ...text, fontWeight: 700, margin: '0 0 12px' }}>Department-wise completion</Text>
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
          <Text style={{ ...mutedText, margin: 0 }}>
            {d.completed} completed · {d.total} open · {d.overdue} overdue · {d.dueSoon} due soon
            {d.doneThisWeek > 0 ? ` · ${d.doneThisWeek} finished this week` : ''}
          </Text>
        </Section>
      ))}
      {departments.length === 0 && (
        <Text style={mutedText}>No department activity this week.</Text>
      )}
    </Section>

    {topEmployees.length > 0 && (
      <Section style={{
        background: colors.bg, border: `1px solid ${colors.border}`,
        borderRadius: '12px', padding: '14px 16px', margin: '14px 0',
      }}>
        <Text style={{ ...text, fontWeight: 700, margin: '0 0 10px' }}>Employee productivity (this week)</Text>
        {topEmployees.map((e, i) => (
          <Text key={i} style={{ ...mutedText, margin: '6px 0' }}>
            <strong style={{ color: colors.text }}>{e.name}</strong>
            {' — '}{e.completedThisWeek} completed
            {e.open > 0 ? `, ${e.open} open` : ''}
            {e.overdue > 0 ? `, ${e.overdue} overdue` : ''}
          </Text>
        ))}
      </Section>
    )}

    {insights.length > 0 && (
      <Section style={{ margin: '14px 0' }}>
        <Text style={{ ...text, fontWeight: 700, margin: '0 0 8px' }}>Key insights</Text>
        {insights.map((line, i) => (
          <InsightCard key={i} title={`Insight ${i + 1}`} body={line} tone="neutral" />
        ))}
      </Section>
    )}

    {recommendations.length > 0 && (
      <Section style={{ margin: '14px 0' }}>
        <Text style={{ ...text, fontWeight: 700, margin: '0 0 8px' }}>Recommendations</Text>
        {recommendations.map((line, i) => (
          <InsightCard key={i} title={`Action ${i + 1}`} body={line} tone="warning" />
        ))}
      </Section>
    )}

    <Text style={mutedText}>
      Personal pending-task briefings go to everyone each morning at 10:00 IST.
      This Friday mail is for leadership overlook only.
    </Text>
    <Section style={{ textAlign: 'center', margin: '20px 0 8px' }}>
      <Button href={ctaUrl || `${APP_URL}/reports`} style={button}>{ctaLabel}</Button>
    </Section>
  </EmailShell>
)

export const template = {
  component: WeeklyLeadershipInsightEmail,
  subject: (d) => d.title || `Friday management overview — ${d.companyCompletionPct || 0}% completion`,
  displayName: 'Weekly leadership insight',
  previewData: {
    title: 'Friday management overview — 74% completion',
    recipientName: 'Pawan',
    weekLabel: 'Week ending Fri 31 Jul 2026',
    totalPending: 24,
    totalOverdue: 5,
    totalCompleted: 66,
    totalDoneThisWeek: 12,
    companyCompletionPct: 74,
    departments: [
      { name: 'Exports', total: 12, overdue: 3, dueSoon: 2, completed: 20, completionPct: 62, doneThisWeek: 4 },
      { name: 'Operations', total: 8, overdue: 1, dueSoon: 1, completed: 30, completionPct: 79, doneThisWeek: 6 },
    ],
    topPerformers: ['Operations'],
    needsAttention: ['Exports'],
    topEmployees: [
      { name: 'Anita', completedThisWeek: 5, overdue: 0, open: 2 },
      { name: 'Rahul', completedThisWeek: 4, overdue: 1, open: 3 },
    ],
    insights: [
      'Operations leads completion at 79% with the strongest weekly throughput.',
      'Exports carries 60% of org overdue volume — worth a focused huddle.',
    ],
    recommendations: [
      'Review Exports overdue list in Reports and rebalance assignees if needed.',
      'Celebrate Operations weekly completions in the Monday standup.',
    ],
  },
} satisfies TemplateEntry
