/// <reference types="npm:@types/react@18.3.1" />
import * as React from 'npm:react@18.3.1'
import { Button, Text, Section } from 'npm:@react-email/components@0.0.22'
import {
  EmailShell, text, mutedText, button, APP_URL,
} from '../transactional-email-templates/_layout.tsx'

interface EmailChangeEmailProps {
  siteName: string
  siteUrl: string
  confirmationUrl: string
  newEmail?: string
}

export const EmailChangeEmail = ({
  siteName,
  confirmationUrl,
  newEmail,
}: EmailChangeEmailProps) => (
  <EmailShell
    preview={`Confirm your new email for ${siteName}`}
    heroTitle="Confirm email change"
    heroSubtitle="Verify your updated address"
  >
    <Text style={text}>
      Please confirm{newEmail ? <> <strong>{newEmail}</strong> as</> : ' '} your new email address for TaskFlow Pro.
    </Text>
    <Section style={{ textAlign: 'center', margin: '22px 0 12px' }}>
      <Button style={button} href={confirmationUrl}>Confirm new email</Button>
    </Section>
    <Text style={mutedText}>
      If you did not request this change, contact your admin. ({APP_URL})
    </Text>
  </EmailShell>
)

export default EmailChangeEmail
