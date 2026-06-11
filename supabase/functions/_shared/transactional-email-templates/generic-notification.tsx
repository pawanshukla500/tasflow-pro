/// <reference types="npm:@types/react@18.3.1" />
import * as React from 'npm:react@18.3.1'
import { Button, Heading, Text, Section } from 'npm:@react-email/components@0.0.22'
import type { TemplateEntry } from './registry.ts'
import { EmailShell, h1, text, mutedText, button, APP_URL, colors } from './_layout.tsx'

interface Props {
  title?: string
  message?: string
  ctaLabel?: string
  ctaUrl?: string
}

const GenericNotificationEmail = ({ title, message, ctaLabel, ctaUrl }: Props) => {
  const lines = (message || '').split('\n').filter((l) => l.trim())
  return (
    <EmailShell preview={title || 'TaskFlow Pro notification'}>
      <Heading style={h1}>{title || 'Notification'}</Heading>
      <Section style={{
        background: '#ffffff',
        border: `1px solid ${colors.border}`,
        borderRadius: '12px',
        padding: '16px 18px',
        margin: '12px 0 16px',
      }}>
        {lines.length > 0 ? lines.map((line, i) => (
          <Text key={i} style={{ ...mutedText, margin: i === lines.length - 1 ? 0 : '0 0 8px', color: colors.text, lineHeight: '1.55' }}>
            {line}
          </Text>
        )) : (
          <Text style={mutedText}>You have a new update in TaskFlow Pro.</Text>
        )}
      </Section>
      <Section style={{ textAlign: 'center', margin: '20px 0 8px' }}>
        <Button href={ctaUrl || APP_URL} style={button}>{ctaLabel || 'Open TaskFlow Pro'}</Button>
      </Section>
      <Text style={{ ...mutedText, fontSize: '11px', textAlign: 'center' }}>
        TaskFlow Pro by VB Exports
      </Text>
    </EmailShell>
  )
}

export const template = {
  component: GenericNotificationEmail,
  subject: (d) => d.title || 'TaskFlow Pro notification',
  displayName: 'Generic notification',
  previewData: {
    title: 'Workflow step ready',
    message: 'A workflow step is awaiting your action.\n\nPlease review and complete it today.',
    ctaLabel: 'Open task',
    ctaUrl: 'https://task.youthnic.shop/my-tasks',
  },
} satisfies TemplateEntry
