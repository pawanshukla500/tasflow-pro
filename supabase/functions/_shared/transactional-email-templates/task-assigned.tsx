/// <reference types="npm:@types/react@18.3.1" />
import * as React from 'npm:react@18.3.1'
import { Button, Heading, Text, Section } from 'npm:@react-email/components@0.0.22'
import type { TemplateEntry } from './registry.ts'
import { EmailShell, h1, text, button, APP_URL, colors, DetailRow, EmailDetailCard, InsightCard } from './_layout.tsx'

interface Props {
  recipientName?: string
  taskTitle?: string
  taskDescription?: string
  priority?: string
  dueDate?: string
  assignedBy?: string
  taskId?: string
}

const priorityColor: Record<string, string> = {
  critical: colors.danger, high: colors.warning, medium: colors.primary, low: colors.muted,
}

/** Sent whenever a teammate is assigned on create (honors notification preferences). */
const TaskAssignedEmail = ({ recipientName, taskTitle, taskDescription, priority, dueDate, assignedBy, taskId }: Props) => {
  const deepLink = taskId ? `${APP_URL}/my-tasks?task=${taskId}` : `${APP_URL}/my-tasks`
  return (
    <EmailShell
      preview={`Task assigned: ${taskTitle || 'Task'}`}
      heroTitle="Task assigned to you"
      heroSubtitle="Open TaskFlow to review and take action"
    >
      <Heading style={h1}>You have a new assignment</Heading>
      <Text style={text}>Hi{recipientName ? ` ${recipientName}` : ''},</Text>
      <Text style={text}>
        {assignedBy || 'A team member'} assigned you a task. Open it in TaskFlow to review details and get started.
      </Text>
      <EmailDetailCard title="Task details">
        <DetailRow label="Task" value={taskTitle || 'Untitled task'} />
        {taskDescription && <Text style={{ ...text, fontSize: '13px', color: colors.muted }}>{taskDescription}</Text>}
        <DetailRow label="Priority" value={priority} accent={priority ? priorityColor[priority] : undefined} />
        <DetailRow
          label="Due date"
          value={dueDate ? new Date(dueDate).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }) : undefined}
        />
        <DetailRow label="Assigned by" value={assignedBy} />
      </EmailDetailCard>
      <InsightCard
        title="Tip"
        tone="neutral"
        body="Your full pending list arrives Mon–Sat at 09:30 IST in the daily digest."
      />
      <Section style={{ textAlign: 'center', margin: '20px 0 8px' }}>
        <Button href={deepLink} style={button}>Open this task</Button>
      </Section>
    </EmailShell>
  )
}

export const template = {
  component: TaskAssignedEmail,
  subject: (d) => `Task assigned: ${d.taskTitle || 'Task'}`,
  displayName: 'Task assigned',
  previewData: {
    recipientName: 'Priya', taskTitle: 'Update Q2 inventory report',
    taskDescription: 'Compile and submit the Q2 inventory report for the Operations dept.',
    priority: 'high', dueDate: new Date(Date.now() + 3 * 86400000).toISOString(), assignedBy: 'Vivek Bhandari',
    taskId: 'sample-task-id',
  },
} satisfies TemplateEntry
