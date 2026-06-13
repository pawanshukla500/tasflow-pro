/// <reference types="npm:@types/react@18.3.1" />
import * as React from 'npm:react@18.3.1'
import { Button, Heading, Text, Section } from 'npm:@react-email/components@0.0.22'
import type { TemplateEntry } from './registry.ts'
import { EmailShell, h1, text, mutedText, button, APP_URL, colors } from './_layout.tsx'

interface TaskItem { title: string; dueDate?: string | null; priority?: string }
interface Props {
  recipientName?: string
  tasks?: TaskItem[]
}

const todayKey = () => new Date(Date.now() + 5.5 * 60 * 60 * 1000).toISOString().slice(0, 10)

const formatDue = (iso?: string | null) =>
  iso ? new Date(iso).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' }) : ''

const statusFor = (dueDate?: string | null) => {
  if (!dueDate) return { label: 'PENDING', color: colors.muted }
  const today = todayKey()
  if (dueDate < today) return { label: 'OVERDUE', color: colors.danger }
  if (dueDate === today) return { label: 'DUE TODAY', color: colors.warning }
  return { label: 'DUE SOON', color: colors.primary }
}

const TaskDueReminderEmail = ({ recipientName, tasks = [] }: Props) => {
  const overdueCount = tasks.filter((t) => t.dueDate && t.dueDate < todayKey()).length
  const dueTodayCount = tasks.filter((t) => t.dueDate && t.dueDate === todayKey()).length
  const summary =
    overdueCount > 0
      ? `${overdueCount} overdue · ${dueTodayCount} due today`
      : `${tasks.length} item${tasks.length === 1 ? '' : 's'} due soon`
  return (
    <EmailShell
      preview={`${overdueCount > 0 ? `${overdueCount} overdue, ` : ''}${tasks.length} task${tasks.length === 1 ? '' : 's'} need attention`}
      heroTitle="Tasks need your attention"
      heroSubtitle={summary}
    >
      <Heading style={h1}>Your pending tasks ⏰</Heading>
      <Text style={text}>Hi{recipientName ? ` ${recipientName}` : ''},</Text>
      <Text style={text}>
        You have {tasks.length} pending item{tasks.length === 1 ? '' : 's'}
        {overdueCount > 0 ? ` — ${overdueCount} already overdue.` : '.'} Please review and take action.
      </Text>
      <Section style={{
        background: '#ffffff', border: `1px solid ${colors.border}`,
        borderRadius: '8px', padding: '8px 16px', margin: '14px 0',
      }}>
        {tasks.map((t, i) => {
          const { label, color } = statusFor(t.dueDate)
          return (
            <Text key={i} style={{ ...mutedText, margin: '8px 0', borderBottom: i < tasks.length - 1 ? `1px solid ${colors.border}` : 'none', paddingBottom: '8px' }}>
              <strong style={{ color: colors.text }}>{t.title}</strong>
              {label && (
                <span style={{ color, fontWeight: 700, marginLeft: '6px', fontSize: '11px' }}>
                  [{label}]
                </span>
              )}
              {t.dueDate && <span> — due {formatDue(t.dueDate)}</span>}
            </Text>
          )
        })}
      </Section>
      <Section style={{ textAlign: 'center', margin: '20px 0 8px' }}>
        <Button href={`${APP_URL}/my-tasks`} style={button}>Open my tasks</Button>
      </Section>
    </EmailShell>
  )
}

export const template = {
  component: TaskDueReminderEmail,
  subject: (d) => {
    const tasks = (d.tasks || []) as TaskItem[]
    const today = todayKey()
    const overdue = tasks.filter((t) => t.dueDate && t.dueDate < today).length
    if (overdue > 0) return `${overdue} overdue task${overdue === 1 ? '' : 's'} need attention`
    return tasks.length > 0
      ? `${tasks.length} pending task${tasks.length === 1 ? '' : 's'}`
      : 'Your pending tasks'
  },
  displayName: 'Task due reminder',
  previewData: {
    recipientName: 'Priya',
    tasks: [
      { title: 'Update Q2 inventory report', dueDate: new Date(Date.now() - 86400000).toISOString().slice(0, 10), priority: 'high' },
      { title: 'Review return policy draft', dueDate: new Date(Date.now()).toISOString().slice(0, 10), priority: 'medium' },
      { title: 'Send vendor RFQ', dueDate: new Date(Date.now() + 2 * 86400000).toISOString().slice(0, 10), priority: 'medium' },
    ],
  },
} satisfies TemplateEntry
