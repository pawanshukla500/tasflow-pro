/// <reference types="npm:@types/react@18.3.1" />
import * as React from 'npm:react@18.3.1'

export interface TemplateEntry {
  component: React.ComponentType<any>
  subject: string | ((data: Record<string, any>) => string)
  to?: string
  displayName?: string
  previewData?: Record<string, any>
}

import { template as welcomeUser } from './welcome-user.tsx'
import { template as taskAssigned } from './task-assigned.tsx'
import { template as taskDueReminder } from './task-due-reminder.tsx'
import { template as monthlyReport } from './monthly-report.tsx'
import { template as genericNotification } from './generic-notification.tsx'
import { template as workflowStageAssigned } from './workflow-stage-assigned.tsx'
import { template as dailyDigest } from './daily-digest.tsx'
import { template as weeklyLeadershipInsight } from './weekly-leadership-insight.tsx'
import { template as passwordReset } from './password-reset.tsx'
import { template as departmentDailySummary } from './department-daily-summary.tsx'

export const TEMPLATES: Record<string, TemplateEntry> = {
  'welcome-user': welcomeUser,
  'task-assigned': taskAssigned,
  'task-due-reminder': taskDueReminder,
  'monthly-report': monthlyReport,
  'generic-notification': genericNotification,
  'workflow-stage-assigned': workflowStageAssigned,
  'daily-digest': dailyDigest,
  'weekly-leadership-insight': weeklyLeadershipInsight,
  'department-daily-summary': departmentDailySummary,
  'password-reset': passwordReset,
}
