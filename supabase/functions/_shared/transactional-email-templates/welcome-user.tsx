/// <reference types="npm:@types/react@18.3.1" />
import * as React from 'npm:react@18.3.1'
import { Button, Text, Section, Row, Column } from 'npm:@react-email/components@0.0.22'
import type { TemplateEntry } from './registry.ts'
import { EmailShell, text, mutedText, button, APP_URL, colors, infoCard } from './_layout.tsx'

interface Props {
  name?: string
  email?: string
  password?: string
  role?: string
  loginUrl?: string
}

const CredentialRow = ({ label, value, highlight }: { label: string; value: string; highlight?: boolean }) => (
  <Row style={{ marginBottom: '10px' }}>
    <Column>
      <Text style={{ fontSize: '11px', fontWeight: 700, color: colors.muted, margin: '0 0 4px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
        {label}
      </Text>
      <div style={{
        background: highlight ? '#eef2ff' : colors.bg,
        border: `1px solid ${highlight ? colors.primary : colors.border}`,
        borderRadius: '10px',
        padding: '12px 14px',
        fontSize: highlight ? '15px' : '14px',
        fontWeight: highlight ? 700 : 600,
        color: colors.text,
        fontFamily: highlight ? 'monospace' : 'inherit',
      }}>
        {value}
      </div>
    </Column>
  </Row>
)

const Step = ({ num, title, body }: { num: number; title: string; body: string }) => (
  <Row style={{ marginBottom: '12px' }}>
    <Column style={{ width: '32px', verticalAlign: 'top' }}>
      <div style={{
        width: '24px', height: '24px', borderRadius: '50%',
        background: `linear-gradient(135deg, ${colors.gradientStart}, ${colors.gradientMid})`,
        color: '#fff', textAlign: 'center', lineHeight: '24px',
        fontSize: '12px', fontWeight: 700,
      }}>{num}</div>
    </Column>
    <Column>
      <Text style={{ fontSize: '13px', fontWeight: 700, color: colors.text, margin: '2px 0 2px' }}>{title}</Text>
      <Text style={{ fontSize: '12px', color: colors.muted, margin: 0, lineHeight: '1.5' }}>{body}</Text>
    </Column>
  </Row>
)

const WelcomeUserEmail = ({ name, email, password, role, loginUrl }: Props) => {
  const signInUrl = loginUrl || APP_URL
  return (
    <EmailShell
      preview={`Welcome to TaskFlow Pro${name ? ', ' + name : ''}`}
      heroTitle={`Welcome aboard${name ? `, ${name}` : ''}`}
      heroSubtitle="Your account is ready — sign in with the credentials below"
    >
      <Text style={text}>
        Your <strong>Login ID</strong> is your email address. Use the password your admin set for you.
      </Text>

      <Section style={{
        ...infoCard,
        border: `2px solid ${colors.primary}`,
        boxShadow: '0 8px 24px rgba(99,102,241,0.12)',
      }}>
        <Text style={{ ...text, fontWeight: 700, margin: '0 0 14px', color: colors.primary, fontSize: '14px' }}>
          Your sign-in details
        </Text>
        {email && <CredentialRow label="Login ID (Email)" value={email} />}
        {password && <CredentialRow label="Password" value={password} highlight />}
        {role && <CredentialRow label="Your role" value={role} />}
      </Section>

      <Text style={{ ...text, fontWeight: 700, margin: '20px 0 12px' }}>How to get started</Text>
      <Step num={1} title="Open TaskFlow" body="Click the purple button below — same login page as the app." />
      <Step num={2} title="Enter your Login ID" body={`Email: ${email || 'your email'}`} />
      <Step num={3} title="Enter your password" body="Copy the password from the box above." />
      <Step num={4} title="Start working" body="Change your password from Settings after first login." />

      <Section style={{ textAlign: 'center', margin: '22px 0 10px' }}>
        <Button href={signInUrl} style={button}>Sign in to TaskFlow Pro</Button>
      </Section>

      <Text style={mutedText}>
        This is a one-time welcome email with your temporary password.
      </Text>
    </EmailShell>
  )
}

export const template = {
  component: WelcomeUserEmail,
  subject: 'Welcome to TaskFlow Pro — your account is ready',
  displayName: 'Welcome user',
  previewData: {
    name: 'Priya',
    email: 'priya@vbexports.co.in',
    password: 'Temp1234!',
    role: 'Team Member',
    loginUrl: 'https://task.youthnic.shop',
  },
} satisfies TemplateEntry
