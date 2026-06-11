/// <reference types="npm:@types/react@18.3.1" />
import * as React from 'npm:react@18.3.1'
import { Button, Heading, Text, Section } from 'npm:@react-email/components@0.0.22'
import type { TemplateEntry } from './registry.ts'
import { EmailShell, h1, text, mutedText, button, APP_URL, colors } from './_layout.tsx'

interface TaskItem { title: string; dueDate?: string; priority?: string }
interface Props {
  recipientName?: string
  tasks?: TaskItem[]
}

const TaskDueReminderEmail = ({ recipientName, tasks = [] }: Props) => (
  <EmailShell preview={`You have ${tasks.length} task${tasks.length === 1 ? '' : 's'} due soon`}>
    <Heading style={h1}>Tasks coming due ⏰</Heading>
    <Text style={text}>Hi{recipientName ? ` ${recipientName}` : ''},</Text>
    <Text style={text}>
      You have {tasks.length} task{tasks.length === 1 ? '' : 's'} due soon. Please review and take action.
    </Text>
    <Section style={{
      background: '#ffffff', border: `1px solid ${colors.border}`,
      borderRadius: '8px', padding: '8px 16px', margin: '14px 0',
    }}>
      {tasks.map((t, i) => (
        <Text key={i} style={{ ...mutedText, margin: '8px 0', borderBottom: i < tasks.length - 1 ? `1px solid ${colors.border}` : 'none', paddingBottom: '8px' }}>
          <strong style={{ color: colors.text }}>{t.title}</strong>
          {t.dueDate && <span> — due {new Date(t.dueDate).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}</span>}
        </Text>
      ))}
    </Section>
    <Section style={{ textAlign: 'center', margin: '20px 0 8px' }}>
      <Button href={`${APP_URL}/my-tasks`} style={button}>Open my tasks</Button>
    </Section>
  </EmailShell>
)

export const template = {
  component: TaskDueReminderEmail,
  subject: 'You have tasks due soon',
  displayName: 'Task due reminder',
  previewData: {
    recipientName: 'Priya',
    tasks: [
      { title: 'Update Q2 inventory report', dueDate: new Date(Date.now() + 86400000).toISOString(), priority: 'high' },
      { title: 'Review return policy draft', dueDate: new Date(Date.now() + 2 * 86400000).toISOString(), priority: 'medium' },
    ],
  },
} satisfies TemplateEntry
