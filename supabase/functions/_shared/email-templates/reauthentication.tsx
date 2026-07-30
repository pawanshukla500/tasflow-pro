/// <reference types="npm:@types/react@18.3.1" />
import * as React from 'npm:react@18.3.1'
import { Text, Section } from 'npm:@react-email/components@0.0.22'
import {
  EmailShell, text, mutedText, colors, infoCard,
} from '../transactional-email-templates/_layout.tsx'

interface ReauthenticationEmailProps {
  token: string
}

export const ReauthenticationEmail = ({ token }: ReauthenticationEmailProps) => (
  <EmailShell
    preview="Your TaskFlow Pro verification code"
    heroTitle="Verification code"
    heroSubtitle="Confirm it is really you"
  >
    <Text style={text}>Use this one-time code to continue:</Text>
    <Section style={{
      ...infoCard,
      textAlign: 'center' as const,
      border: `2px solid ${colors.primary}`,
    }}>
      <Text style={{
        fontFamily: 'Consolas, Monaco, monospace',
        fontSize: '28px',
        fontWeight: 800,
        color: colors.primary,
        letterSpacing: '6px',
        margin: 0,
      }}>
        {token}
      </Text>
    </Section>
    <Text style={mutedText}>
      This code expires shortly. If you did not request it, you can ignore this email.
    </Text>
  </EmailShell>
)

export default ReauthenticationEmail
