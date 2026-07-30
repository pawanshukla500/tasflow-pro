/// <reference types="npm:@types/react@18.3.1" />
import * as React from 'npm:react@18.3.1'
import {
  Body, Container, Head, Heading, Html, Preview, Section, Text, Link, Hr, Img, Row, Column,
} from 'npm:@react-email/components@0.0.22'

export const SITE_NAME = 'TaskFlow Pro'
export const COMPANY_NAME = 'Youthnic'
export const COMPANY_LEGAL = 'VB Exports'
export const APP_URL =
  (typeof Deno !== 'undefined' ? Deno.env.get('APP_URL') : undefined)?.replace(/\/$/, '') ||
  'https://task.youthnic.shop'

/** Real app mark (PNG). Email clients often block SVG — never default to .svg. */
export const EMAIL_LOGO_URL =
  (typeof Deno !== 'undefined' ? Deno.env.get('EMAIL_LOGO_URL') : undefined)?.trim() ||
  `${APP_URL}/youthnic-logo.png`

/**
 * Soft-UI teal palette — matches `src/index.css` primary (hsl 174 84% 32%).
 * Kept hex for email-client compatibility.
 */
export const colors = {
  primary: '#0D9488',
  primaryMid: '#0F766E',
  primaryDark: '#115E59',
  gradientStart: '#0D9488',
  gradientMid: '#0F766E',
  gradientEnd: '#134E4A',
  text: '#134E4A',
  muted: '#5B7A75',
  border: '#D5E5E2',
  bg: '#F3FAF8',
  cardBg: '#ffffff',
  danger: '#DC2626',
  warning: '#F59E0B',
  success: '#16A34A',
  chipBg: '#ffffff',
}

export const main = {
  backgroundColor: colors.bg,
  fontFamily: '"Plus Jakarta Sans", "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif',
  margin: 0,
  padding: '28px 0',
}

/** Landscape email canvas — wider than the old narrow card. */
export const container = { maxWidth: '640px', margin: '0 auto', padding: '0 12px' }

export const outerCard = {
  background: colors.cardBg,
  borderRadius: '16px',
  overflow: 'hidden' as const,
  border: `1px solid ${colors.border}`,
  boxShadow: '0 18px 40px rgba(13,148,136,0.12)',
}

export const landscapeHero = {
  background: `linear-gradient(90deg, ${colors.gradientStart} 0%, ${colors.gradientMid} 55%, ${colors.gradientEnd} 100%)`,
  padding: '22px 28px 20px',
}

export const logoChip = {
  backgroundColor: colors.chipBg,
  borderRadius: '12px',
  padding: '8px',
  display: 'inline-block' as const,
  lineHeight: 0,
  border: '1px solid rgba(255,255,255,0.35)',
}

export const logoImg = {
  display: 'block' as const,
  width: '40px',
  height: '40px',
  objectFit: 'contain' as const,
}

export const brandTitle = {
  fontSize: '20px',
  fontWeight: 800,
  color: '#ffffff',
  margin: '0 0 2px',
  letterSpacing: '-0.4px',
  lineHeight: '1.2',
}

export const brandSub = {
  fontSize: '11px',
  color: 'rgba(255,255,255,0.88)',
  margin: 0,
  letterSpacing: '0.06em',
  textTransform: 'uppercase' as const,
  lineHeight: '1.3',
}

export const heroTitle = {
  fontSize: '18px',
  fontWeight: 700,
  color: '#ffffff',
  margin: '14px 0 2px',
  letterSpacing: '-0.2px',
}

export const heroSub = {
  fontSize: '13px',
  color: 'rgba(255,255,255,0.92)',
  margin: 0,
  lineHeight: '1.5',
}

export const bodySection = { padding: '28px 28px 24px' }

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
  boxShadow: '0 8px 20px rgba(13,148,136,0.35)',
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
  padding: '16px 28px 24px',
  background: colors.bg,
  borderTop: `1px solid ${colors.border}`,
}

/** @deprecated kept for older template imports */
export const gradientHero = landscapeHero
export const logoInHero = logoImg
export const brandText = brandTitle

const year = new Date().getFullYear()

interface ShellProps {
  preview: string
  heroTitle?: string
  heroSubtitle?: string
  children: React.ReactNode
}

/**
 * Landscape branded shell — horizontal logo + wordmark (matches in-app BrandLockup),
 * teal Soft UI palette, 640px canvas.
 */
export const EmailShell = ({ preview, heroTitle: hero, heroSubtitle, children }: ShellProps) => (
  <Html lang="en" dir="ltr">
    <Head />
    <Preview>{preview}</Preview>
    <Body style={main}>
      <Container style={container}>
        <Section style={outerCard}>
          <Section style={landscapeHero}>
            <Row>
              <Column style={{ width: '56px', verticalAlign: 'middle' }}>
                <Section style={logoChip}>
                  <Img
                    src={EMAIL_LOGO_URL}
                    alt={`${SITE_NAME} logo`}
                    width="40"
                    height="40"
                    style={logoImg}
                  />
                </Section>
              </Column>
              <Column style={{ verticalAlign: 'middle', paddingLeft: '14px' }}>
                <Text style={brandTitle}>{SITE_NAME}</Text>
                <Text style={brandSub}>{COMPANY_NAME} · {COMPANY_LEGAL}</Text>
              </Column>
            </Row>
            <Heading style={heroTitle}>{hero || 'Notification'}</Heading>
            {heroSubtitle && <Text style={heroSub}>{heroSubtitle}</Text>}
          </Section>
          <Section style={bodySection}>{children}</Section>
          <Hr style={{ borderColor: colors.border, margin: 0 }} />
          <Text style={footer}>
            © {year} {SITE_NAME} · {COMPANY_NAME} ({COMPANY_LEGAL})<br />
            Team task &amp; workflow management<br />
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
