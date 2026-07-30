/// <reference types="npm:@types/react@18.3.1" />
import * as React from 'npm:react@18.3.1'
import { Button, Text, Section } from 'npm:@react-email/components@0.0.22'
import {
  EmailShell, text, mutedText, button, APP_URL,
} from '../transactional-email-templates/_layout.tsx'

interface MagicLinkEmailProps {
  siteName: string
  siteUrl: string
  confirmationUrl: string
}

export const MagicLinkEmail = ({
  siteName,
  confirmationUrl,
}: MagicLinkEmailProps) => (
  <EmailShell
    preview={`Your ${siteName} login link`}
    heroTitle="Sign in to TaskFlow Pro"
    heroSubtitle="Secure one-tap login link"
  >
    <Text style={text}>
      Click the button below to sign in. This link expires shortly and can only be used once.
    </Text>
    <Section style={{ textAlign: 'center', margin: '22px 0 12px' }}>
      <Button style={button} href={confirmationUrl}>Sign in securely</Button>
    </Section>
    <Text style={mutedText}>
      If you did not request this link for {siteName}, ignore this email. ({APP_URL})
    </Text>
  </EmailShell>
)

export default MagicLinkEmail
