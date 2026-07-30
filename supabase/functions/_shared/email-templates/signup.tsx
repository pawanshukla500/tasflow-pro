/// <reference types="npm:@types/react@18.3.1" />
import * as React from 'npm:react@18.3.1'
import { Button, Text, Section } from 'npm:@react-email/components@0.0.22'
import {
  EmailShell, text, mutedText, button, APP_URL, colors, infoCard,
} from '../transactional-email-templates/_layout.tsx'

interface SignupEmailProps {
  siteName: string
  siteUrl: string
  recipient: string
  confirmationUrl: string
}

export const SignupEmail = ({
  siteName,
  siteUrl,
  recipient,
  confirmationUrl,
}: SignupEmailProps) => (
  <EmailShell
    preview={`Confirm your email for ${siteName}`}
    heroTitle="Confirm your email"
    heroSubtitle="Activate your TaskFlow Pro account"
  >
    <Text style={text}>
      Thanks for signing up! Please confirm <strong>{recipient}</strong> to activate your account.
    </Text>
    <Section style={{ textAlign: 'center', margin: '22px 0 12px' }}>
      <Button style={button} href={confirmationUrl}>Verify email</Button>
    </Section>
    <Text style={mutedText}>
      If you did not create an account on {siteUrl || APP_URL}, you can ignore this email.
    </Text>
  </EmailShell>
)

export default SignupEmail
