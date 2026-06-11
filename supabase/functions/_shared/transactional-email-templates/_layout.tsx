/// <reference types="npm:@types/react@18.3.1" />
import * as React from 'npm:react@18.3.1'
import {
  Body, Container, Head, Heading, Html, Preview, Section, Text, Link, Hr,
} from 'npm:@react-email/components@0.0.22'

export const SITE_NAME = 'TaskFlow Pro'
export const COMPANY_NAME = 'VB Exports'
export const APP_URL =
  (typeof Deno !== 'undefined' ? Deno.env.get('APP_URL') : undefined)?.replace(/\/$/, '') ||
  'https://task.youthnic.shop'

export const EMAIL_LOGO_URL =
  (typeof Deno !== 'undefined' ? Deno.env.get('EMAIL_LOGO_URL') : undefined) ||
  `${APP_URL}/youthnic-logo.svg`

export const colors = {
  primary: '#6366f1',
  primaryMid: '#7c3aed',
  primaryDark: '#6d28d9',
  gradientStart: '#4f46e5',
  gradientMid: '#7c3aed',
  gradientEnd: '#7e22ce',
  text: '#0f172a',
  muted: '#64748b',
  border: '#e2e8f0',
  bg: '#f8fafc',
  cardBg: '#ffffff',
  danger: '#dc2626',
  warning: '#f59e0b',
  success: '#16a34a',
}

export const main = {
  backgroundColor: colors.bg,
  fontFamily: '"Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif',
  margin: 0,
  padding: '32px 0',
}
export const container = { maxWidth: '560px', margin: '0 auto', padding: '0 16px' }
export const outerCard = {
  background: colors.cardBg,
  borderRadius: '16px',
  overflow: 'hidden' as const,
  border: `1px solid ${colors.border}`,
  boxShadow: '0 20px 50px rgba(79,70,229,0.12)',
}
export const gradientHero = {
  background: `linear-gradient(135deg, ${colors.gradientStart}, ${colors.gradientMid}, ${colors.gradientEnd})`,
  padding: '24px 24px 20px',
  textAlign: 'center' as const,
}
export const heroTitle = {
  fontSize: '20px',
  fontWeight: 800,
  color: '#ffffff',
  margin: '8px 0 4px',
  letterSpacing: '-0.3px',
}
export const heroSub = {
  fontSize: '13px',
  color: 'rgba(255,255,255,0.92)',
  margin: 0,
  lineHeight: '1.5',
}
export const bodySection = { padding: '28px 24px' }
export const logoInHero = {
  display: 'block',
  margin: '0 auto',
  maxWidth: '180px',
  height: 'auto',
}
export const brandText = {
  fontSize: '22px',
  fontWeight: 800,
  color: '#ffffff',
  margin: '0 0 2px',
  letterSpacing: '-0.5px',
}
export const brandSub = {
  fontSize: '12px',
  color: 'rgba(255,255,255,0.88)',
  margin: '0 0 12px',
  textTransform: 'uppercase' as const,
  letterSpacing: '0.08em',
}
export const h1 = { fontSize: '20px', fontWeight: 700, color: colors.text, margin: '0 0 12px' }
export const text = { fontSize: '14px', color: colors.text, lineHeight: '1.65', margin: '0 0 12px' }
export const mutedText = { fontSize: '13px', color: colors.muted, lineHeight: '1.55', margin: '0 0 8px' }
export const button = {
  background: `linear-gradient(135deg, ${colors.gradientStart}, ${colors.gradientMid})`,
  color: '#ffffff',
  borderRadius: '10px',
  padding: '14px 28px',
  fontSize: '14px',
  fontWeight: 700,
  textDecoration: 'none',
  display: 'inline-block',
  boxShadow: '0 8px 20px rgba(99,102,241,0.35)',
}
export const infoCard = {
  background: colors.bg,
  border: `1px solid ${colors.border}`,
  borderRadius: '12px',
  padding: '16px 18px',
  margin: '16px 0',
}
export const footer = {
  textAlign: 'center' as const,
  fontSize: '11px',
  color: colors.muted,
  margin: '0',
  lineHeight: '1.7',
  padding: '16px 24px 24px',
  background: colors.bg,
  borderTop: `1px solid ${colors.border}`,
}

const year = new Date().getFullYear()

interface ShellProps {
  preview: string
  heroTitle?: string
  heroSubtitle?: string
  children: React.ReactNode
}

export const EmailShell = ({ preview, heroTitle: hero, heroSubtitle, children }: ShellProps) => (
  <Html lang="en" dir="ltr">
    <Head />
    <Preview>{preview}</Preview>
    <Body style={main}>
      <Container style={container}>
        <Section style={outerCard}>
          <Section style={gradientHero}>
            <img src={EMAIL_LOGO_URL} alt={`${SITE_NAME} by ${COMPANY_NAME}`} width="180" height="48" style={logoInHero} />
            <Text style={brandText}>{SITE_NAME}</Text>
            <Text style={brandSub}>by {COMPANY_NAME}</Text>
            <Heading style={heroTitle}>{hero || 'Notification'}</Heading>
            {heroSubtitle && <Text style={heroSub}>{heroSubtitle}</Text>}
          </Section>
          <Section style={bodySection}>{children}</Section>
          <Hr style={{ borderColor: colors.border, margin: 0 }} />
          <Text style={footer}>
            © {year} {SITE_NAME} · {COMPANY_NAME}<br />
            Enterprise task &amp; workflow management<br />
            <Link href={APP_URL} style={{ color: colors.primary, textDecoration: 'none', fontWeight: 600 }}>
              Open TaskFlow Pro →
            </Link>
          </Text>
        </Section>
      </Container>
    </Body>
  </Html>
)

export function DetailRow({ label, value, mono, accent }: {
  label: string
  value?: string | null
  mono?: boolean
  accent?: string
}) {
  if (!value) return null
  return (
    <Text style={{ ...mutedText, margin: '4px 0' }}>
      <strong style={{ color: colors.text }}>{label}:</strong>{' '}
      <span style={{
        fontFamily: mono ? 'Consolas, Monaco, monospace' : 'inherit',
        color: accent || colors.text,
        fontWeight: mono ? 600 : 400,
      }}>{value}</span>
    </Text>
  )
}

export function EmailDetailCard({ title, children }: { title?: string; children: React.ReactNode }) {
  return (
    <Section style={infoCard}>
      {title && <Text style={{ ...text, fontWeight: 700, margin: '0 0 10px' }}>{title}</Text>}
      {children}
    </Section>
  )
}
