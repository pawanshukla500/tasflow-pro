/// <reference types="npm:@types/react@18.3.1" />
import * as React from 'npm:react@18.3.1'
import { Button, Text, Section } from 'npm:@react-email/components@0.0.22'
import type { TemplateEntry } from './registry.ts'
import { EmailShell, text, mutedText, button, APP_URL, colors, infoCard } from './_layout.tsx'

interface Props {
  recipientName?: string
  recipientEmail?: string
  resetUrl?: string
}

const PasswordResetEmail = ({ recipientName, recipientEmail, resetUrl }: Props) => (
  <EmailShell
    preview="Reset your TaskFlow Pro password"
    heroTitle="Reset your password"
    heroSubtitle="Secure password reset for your TaskFlow Pro account"
  >
    <Text style={text}>
      Hi{recipientName ? ` ${recipientName}` : ''},
    </Text>
    <Text style={text}>
      We received a request to reset the password for
      {recipientEmail ? ` ${recipientEmail}` : ' your account'}.
      Click the button below — it opens the same branded page as the TaskFlow login screen.
    </Text>

    <Section style={infoCard}>
      <Text style={{ ...mutedText, margin: '0 0 8px', fontWeight: 700, color: colors.text }}>
        What happens next
      </Text>
      <Text style={{ ...mutedText, margin: '4px 0' }}>1. Open the secure reset page</Text>
      <Text style={{ ...mutedText, margin: '4px 0' }}>2. Enter your new password twice</Text>
      <Text style={{ ...mutedText, margin: '4px 0' }}>3. Sign in with your new password</Text>
    </Section>

    <Section style={{ textAlign: 'center', margin: '24px 0 12px' }}>
      <Button href={resetUrl || `${APP_URL}/reset-password`} style={button}>
        Reset my password
      </Button>
    </Section>

    <Text style={mutedText}>
      This link expires after use. If you did not request a reset, ignore this email — your password stays the same.
    </Text>
  </EmailShell>
)

export const template = {
  component: PasswordResetEmail,
  subject: 'Reset your TaskFlow Pro password',
  displayName: 'Password reset',
  previewData: {
    recipientName: 'Pawan',
    recipientEmail: 'returnorders@vbexports.co.in',
    resetUrl: 'https://task.youthnic.shop/reset-password?oobCode=preview',
  },
} satisfies TemplateEntry
