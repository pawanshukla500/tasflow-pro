/// <reference types="npm:@types/react@18.3.1" />
import * as React from 'npm:react@18.3.1'
import { Button, Text, Section } from 'npm:@react-email/components@0.0.22'
import {
  EmailShell, text, mutedText, button, APP_URL,
} from '../transactional-email-templates/_layout.tsx'

interface InviteEmailProps {
  siteName: string
  siteUrl: string
  confirmationUrl: string
}

export const InviteEmail = ({
  siteName,
  siteUrl,
  confirmationUrl,
}: InviteEmailProps) => (
  <EmailShell
    preview={`You've been invited to join ${siteName}`}
    heroTitle="You're invited"
    heroSubtitle={`Join ${siteName} on TaskFlow Pro`}
  >
    <Text style={text}>
      You've been invited to join <strong>{siteName}</strong>. Accept the invitation to create your account and start collaborating.
    </Text>
    <Section style={{ textAlign: 'center', margin: '22px 0 12px' }}>
      <Button style={button} href={confirmationUrl}>Accept invitation</Button>
    </Section>
    <Text style={mutedText}>
      If you were not expecting this, you can safely ignore it. ({siteUrl || APP_URL})
    </Text>
  </EmailShell>
)

export default InviteEmail
