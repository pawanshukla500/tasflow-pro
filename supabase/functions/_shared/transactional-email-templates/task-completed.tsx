/// <reference types="npm:@types/react@18.3.1" />
import * as React from 'npm:react@18.3.1'
import { Button, Heading, Text, Section } from 'npm:@react-email/components@0.0.22'
import type { TemplateEntry } from './registry.ts'
import { EmailShell, h1, text, button, APP_URL, colors, DetailRow, EmailDetailCard } from './_layout.tsx'

interface Props {
  recipientName?: string
  taskTitle?: string
  completedBy?: string
  completedAt?: string
  departmentName?: string
  taskId?: string
}

const TaskCompletedEmail = ({
  recipientName,
  taskTitle,
  completedBy,
  completedAt,
  departmentName,
  taskId,
}: Props) => {
  const deepLink = taskId ? `${APP_URL}/my-tasks?task=${taskId}` : `${APP_URL}/my-tasks`
  return (
    <EmailShell
      preview={`Completed: ${taskTitle || 'Task'}`}
      heroTitle="Task completed"
      heroSubtitle="A task on your radar was marked done"
    >
      <Heading style={h1}>Nice progress</Heading>
      <Text style={text}>Hi{recipientName ? ` ${recipientName}` : ''},</Text>
      <Text style={text}>
        {completedBy || 'A teammate'} marked a task as complete
        {completedAt ? ` on ${completedAt}` : ''}.
      </Text>
      <EmailDetailCard title="Completed task">
        <DetailRow label="Task" value={taskTitle || 'Untitled task'} />
        <DetailRow label="Completed by" value={completedBy} />
        <DetailRow label="Department" value={departmentName} />
      </EmailDetailCard>
      <Section style={{ textAlign: 'center', margin: '20px 0 8px' }}>
        <Button href={deepLink} style={button}>View in TaskFlow</Button>
      </Section>
      <Text style={mutedText}>You receive this only when you are the creator or watcher — not for every team completion.</Text>
    </EmailShell>
  )
}

export const template = {
  component: TaskCompletedEmail,
  subject: (d) => `Completed: ${d.taskTitle || 'Task'}`,
  displayName: 'Task completed',
  previewData: {
    recipientName: 'Pawan',
    taskTitle: 'Ship packing list for SJIT',
    completedBy: 'Anita',
    completedAt: '30 Jul 2026',
    departmentName: 'Exports',
    taskId: 'sample-task-id',
  },
} satisfies TemplateEntry
