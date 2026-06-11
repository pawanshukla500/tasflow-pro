/// <reference types="npm:@types/react@18.3.1" />
import * as React from 'npm:react@18.3.1'
import { Button, Heading, Text, Section } from 'npm:@react-email/components@0.0.22'
import type { TemplateEntry } from './registry.ts'
import { EmailShell, h1, text, button, APP_URL, colors, DetailRow, EmailDetailCard } from './_layout.tsx'

interface Props {
  recipientName?: string
  workflowTitle?: string
  stageName?: string
  stagePosition?: number
  totalStages?: number
  tatHours?: number
  raisedBy?: string
  isOverdue?: boolean
  workflowId?: string
  stageId?: string
  trackingNumber?: string
  referenceId?: string
  priority?: string
  dueDate?: string
  assigneeName?: string
  status?: string
  changeType?: string
}

const priorityColor: Record<string, string> = {
  critical: colors.danger,
  high: colors.warning,
  medium: colors.primary,
  low: colors.muted,
}

const Email = ({
  recipientName, workflowTitle, stageName, stagePosition, totalStages, tatHours, raisedBy, isOverdue,
  workflowId, stageId, trackingNumber, referenceId, priority, dueDate, assigneeName, status, changeType,
}: Props) => {
  const params = new URLSearchParams()
  if (workflowId) params.set('wf', workflowId)
  if (stageId) params.set('stage', stageId)
  const deepLink = params.toString() ? `${APP_URL}/workflows?${params.toString()}` : `${APP_URL}/workflows`
  const trackNo = trackingNumber || referenceId
  const hero = isOverdue ? 'Workflow SLA breach' : changeType === 'start' ? 'Workflow started' : 'Workflow update'

  return (
  <EmailShell
    preview={isOverdue ? `Overdue: ${trackNo || workflowTitle}` : `${trackNo || workflowTitle} — ${stageName}`}
    heroTitle={hero}
    heroSubtitle={isOverdue ? 'Immediate action required' : 'You have a workflow action pending'}
  >
    <Heading style={h1}>
      {isOverdue ? '⚠️ Workflow overdue / SLA breach' : changeType === 'start' ? '🚀 New workflow started' : '📋 Workflow stage assigned'}
    </Heading>
    <Text style={text}>Hi{recipientName ? ` ${recipientName}` : ''},</Text>
    <Text style={text}>
      {isOverdue
        ? 'A workflow stage has exceeded its turnaround time. Please action it immediately.'
        : changeType === 'start'
          ? `A new workflow "${workflowTitle || 'Workflow'}" has been launched and requires your attention.`
          : `You've been assigned the next stage of "${workflowTitle || 'a workflow'}".`}
    </Text>
    <EmailDetailCard title="Workflow details">
      <DetailRow label="Tracking number" value={trackNo} mono accent={colors.primary} />
      <DetailRow label="Workflow" value={workflowTitle} />
      <DetailRow label="Stage" value={`${stagePosition || 1}${totalStages ? ` / ${totalStages}` : ''}: ${stageName || 'Stage'}`} />
      <DetailRow label="Priority" value={priority} accent={priority ? priorityColor[priority] : undefined} />
      <DetailRow label="Status" value={status || (isOverdue ? 'Overdue' : 'In progress')} accent={isOverdue ? colors.danger : colors.primary} />
      <DetailRow label="Assigned to" value={assigneeName} />
      <DetailRow label="Due by" value={dueDate} accent={isOverdue ? colors.danger : undefined} />
      <DetailRow label="TAT" value={tatHours != null ? `${tatHours} hour${tatHours === 1 ? '' : 's'}` : undefined} />
      <DetailRow label="Raised by" value={raisedBy} />
    </EmailDetailCard>
    <Section style={{ textAlign: 'center', margin: '20px 0 8px' }}>
      <Button href={deepLink} style={button}>Open workflow</Button>
    </Section>
  </EmailShell>
)}

export const template = {
  component: Email,
  subject: (d) => {
    const track = d.trackingNumber || d.referenceId
    if (d.isOverdue) return `⚠️ SLA breach${track ? `: ${track}` : ''} — ${d.stageName || 'Workflow stage'}`
    if (d.changeType === 'start') return `Workflow started${track ? `: ${track}` : ''} — ${d.workflowTitle || 'New workflow'}`
    return `Action needed${track ? `: ${track}` : ''} — ${d.stageName || 'Workflow stage'}`
  },
  displayName: 'Workflow stage assigned',
  previewData: {
    recipientName: 'Anita',
    workflowTitle: 'Raw Material Procurement — Cotton',
    stageName: 'Quality Check',
    stagePosition: 3,
    totalStages: 4,
    tatHours: 24,
    raisedBy: 'Production Team',
    isOverdue: false,
    trackingNumber: 'WF-20260611-000001',
    priority: 'high',
    dueDate: '11 Jun 2026, 5:00 PM IST',
    assigneeName: 'Anita Sharma',
    status: 'In progress',
    changeType: 'advance',
    workflowId: 'sample-wf-id',
    stageId: 'sample-stage-id',
  },
} satisfies TemplateEntry
