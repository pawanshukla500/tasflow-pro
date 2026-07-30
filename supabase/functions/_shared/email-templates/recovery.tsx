/// <reference types="npm:@types/react@18.3.1" />
import * as React from 'npm:react@18.3.1'
import { Button, Text, Section } from 'npm:@react-email/components@0.0.22'
import {
  EmailShell, text, mutedText, button, APP_URL, infoCard,
} from '../transactional-email-templates/_layout.tsx'

interface RecoveryEmailProps {
  siteName: string
  siteUrl: string
  confirmationUrl: string
}

export const RecoveryEmail = ({
  siteName,
  confirmationUrl,
}: RecoveryEmailProps) => (
  <EmailShell
    preview={`Reset your ${siteName} password`}
    heroTitle="Reset your password"
    heroSubtitle="Secure account recovery"
  >
    <Text style={text}>
      We received a request to reset your password. Open the secure page below to choose a new one.
    </Text>
    <Section style={infoCard}>
      <Text style={{ ...mutedText, margin: 0 }}>
        The link expires after use. If you did not request a reset, your password stays unchanged.
      </Text>
    </Section>
    <Section style={{ textAlign: 'center', margin: '22px 0 12px' }}>
      <Button style={button} href={confirmationUrl}>Reset password</Button>
    </Section>
    <Text style={mutedText}>{APP_URL}</Text>
  </EmailShell>
)

export default RecoveryEmail
