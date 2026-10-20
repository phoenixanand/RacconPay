/**
 * RacconPay v2 shared UI primitives.
 * All colors from CSS vars — never hardcode hex here.
 *
 * Exports (existing):
 *   Card, Label, PrimaryButton, GhostButton, Input, Badge, Stat, TxStatus, PageHeader
 *
 * New in v2:
 *   GlowCard, StatCard, SectionTitle, Divider, TokenAmountBadge, StepBadge
 */
import React from 'react'
import { Loader2, ExternalLink, CheckCircle2, AlertCircle } from 'lucide-react'

/* ══════════════════════════════════════════════════════════════════════
   CARD
   ══════════════════════════════════════════════════════════════════════ */
export function Card({
  children, className = '', strong = false, style,
}: {
  children: React.ReactNode; className?: string; strong?: boolean; style?: React.CSSProperties
}) {
  return (
    <div className={`rounded-2xl ${strong ? 'glass-strong' : 'glass'} ${className}`} style={style}>
      {children}
    </div>
  )
}

/* ══════════════════════════════════════════════════════════════════════
   GLOW CARD  — hover lifts + border glows in accentColor
   ══════════════════════════════════════════════════════════════════════ */
export function GlowCard({
  children, className = '', accentColor = 'var(--accent)', glowColor,
}: {
  children: React.ReactNode
  className?: string
  accentColor?: string
  glowColor?: string
}) {
  const glow = glowColor ?? `color-mix(in srgb, ${accentColor} 20%, transparent)`
  return (
    <div
      className={`glow-card rounded-2xl glass ${className}`}
      onMouseEnter={e => {
        const el = e.currentTarget
        el.style.borderColor = accentColor
        el.style.boxShadow = `0 0 24px ${glow}`
        el.style.background = `color-mix(in srgb, ${accentColor} 6%, var(--surface))`
      }}
      onMouseLeave={e => {
        const el = e.currentTarget
        el.style.borderColor = ''
        el.style.boxShadow = ''
        el.style.background = ''
      }}
    >
      {children}
    </div>
  )
}

/* ══════════════════════════════════════════════════════════════════════
   STAT CARD  — big number + label + optional icon
   ══════════════════════════════════════════════════════════════════════ */
export function StatCard({
  label, value, sub, icon: Icon, accentColor = 'var(--accent)',
}: {
  label: string
  value: React.ReactNode
  sub?: string
  icon?: React.ElementType
  accentColor?: string
}) {
  return (
    <div
      className="flex flex-col gap-2 p-4 rounded-2xl"
      style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}
    >
      <div className="flex items-center justify-between">
        <p className="text-[9px] font-semibold uppercase tracking-[0.12em]" style={{ color: 'var(--subtle)' }}>
          {label}
        </p>
        {Icon && (
          <span
            className="w-6 h-6 rounded-lg flex items-center justify-center"
            style={{ background: `color-mix(in srgb, ${accentColor} 14%, transparent)` }}
          >
            <Icon size={12} style={{ color: accentColor }} />
          </span>
        )}
      </div>
      <div className="font-display font-bold text-xl tabular-nums" style={{ color: 'var(--ink)' }}>{value}</div>
      {sub && <p className="text-xs" style={{ color: 'var(--subtle)' }}>{sub}</p>}
    </div>
  )
}

/* ══════════════════════════════════════════════════════════════════════
   SECTION TITLE
   ══════════════════════════════════════════════════════════════════════ */
export function SectionTitle({ title, subtitle }: { title: string; subtitle?: string }) {
  return (
    <div className="flex flex-col gap-1 mb-5">
      <h2
        className="font-display font-bold text-xl"
        style={{ color: 'var(--ink)', letterSpacing: '-0.02em' }}
      >
        {title}
      </h2>
      {subtitle && <p className="text-sm" style={{ color: 'var(--muted)' }}>{subtitle}</p>}
    </div>
  )
}

/* ══════════════════════════════════════════════════════════════════════
   DIVIDER (spectral)
   ══════════════════════════════════════════════════════════════════════ */
export function Divider({ className = '' }: { className?: string }) {
  return (
    <div
      className={`h-px w-full rounded-full ${className}`}
      style={{ background: 'var(--spectral)', opacity: 0.3 }}
    />
  )
}

/* ══════════════════════════════════════════════════════════════════════
   TOKEN AMOUNT BADGE  — "12.50 USDC" pill
   ══════════════════════════════════════════════════════════════════════ */
export function TokenAmountBadge({ amount, symbol = 'USDC' }: { amount: string; symbol?: string }) {
  return (
    <span
      className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-sm font-semibold tabular-nums"
      style={{ background: 'var(--accent-muted)', color: 'var(--accent)', border: '1px solid var(--accent-glow)' }}
    >
      <span
        className="w-4 h-4 rounded-full flex items-center justify-center text-[8px] font-black shrink-0"
        style={{ background: 'var(--accent)', color: '#fff8f0' }}
      >
        $
      </span>
      {amount} {symbol}
    </span>
  )
}

/* ══════════════════════════════════════════════════════════════════════
   STEP BADGE  — "1 of 2" numbered step indicator
   ══════════════════════════════════════════════════════════════════════ */
export function StepBadge({
  step, total, label,
}: { step: number; total: number; label?: string }) {
  return (
    <div className="flex items-center gap-2">
      <span
        className="w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold shrink-0"
        style={{ background: 'var(--accent)', color: '#fff8f0' }}
      >
        {step}
      </span>
      <span className="text-sm font-medium" style={{ color: 'var(--ink-2)' }}>
        {label ?? `Step ${step} of ${total}`}
      </span>
    </div>
  )
}

/* ══════════════════════════════════════════════════════════════════════
   LABEL
   ══════════════════════════════════════════════════════════════════════ */
export function Label({ children }: { children: React.ReactNode }) {
  return (
    <p className="text-[10px] font-semibold uppercase tracking-[0.1em]" style={{ color: 'var(--subtle)' }}>
      {children}
    </p>
  )
}

/* ══════════════════════════════════════════════════════════════════════
   PRIMARY BUTTON
   ══════════════════════════════════════════════════════════════════════ */
export function PrimaryButton({
  children, onClick, disabled, loading, className = '', type = 'button',
}: {
  children: React.ReactNode; onClick?: () => void; disabled?: boolean
  loading?: boolean; className?: string; type?: 'button' | 'submit'
}) {
  const isDisabled = disabled || loading
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={isDisabled}
      className={`w-full flex items-center justify-center gap-2 rounded-xl py-3 text-sm font-semibold
        transition-all hover:scale-[1.01] hover:brightness-110 active:scale-[0.99]
        disabled:opacity-40 disabled:cursor-not-allowed disabled:scale-100 disabled:brightness-100 ${className}`}
      style={{
        background: isDisabled
          ? 'var(--surface-strong)'
          : 'linear-gradient(135deg, var(--pay-accent) 0%, var(--receipt-accent) 100%)',
        color: isDisabled ? 'var(--muted)' : '#fff8f0',
        boxShadow: isDisabled ? 'none' : '0 4px 14px rgba(196,120,42,0.28)',
      }}
    >
      {loading && <Loader2 size={15} className="animate-spin shrink-0" />}
      {children}
    </button>
  )
}

/* ══════════════════════════════════════════════════════════════════════
   GHOST BUTTON
   ══════════════════════════════════════════════════════════════════════ */
export function GhostButton({
  children, onClick, disabled, className = '',
}: {
  children: React.ReactNode; onClick?: () => void; disabled?: boolean; className?: string
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={`flex items-center justify-center gap-1.5 rounded-xl px-4 py-2.5 text-sm font-medium
        transition-all hover:bg-white/5 active:bg-white/10
        disabled:opacity-40 disabled:cursor-not-allowed ${className}`}
      style={{ color: 'var(--ink-2)', border: '1px solid var(--border-strong)' }}
    >
      {children}
    </button>
  )
}

/* ══════════════════════════════════════════════════════════════════════
   INPUT
   ══════════════════════════════════════════════════════════════════════ */
export function Input({
  value, onChange, onKeyDown, placeholder, type = 'text',
  className = '', label, mono = false,
}: {
  value: string; onChange: (v: string) => void; onKeyDown?: (e: React.KeyboardEvent) => void
  placeholder?: string; type?: string; className?: string; label?: string; mono?: boolean
}) {
  return (
    <div className="flex flex-col gap-1">
      {label && <Label>{label}</Label>}
      <input
        type={type}
        value={value}
        onChange={e => onChange(e.target.value)}
        onKeyDown={onKeyDown}
        placeholder={placeholder}
        className={`w-full rounded-xl px-3.5 py-2.5 text-sm outline-none transition-all
          placeholder:text-[var(--subtle)] ${mono ? 'font-mono' : ''} ${className}`}
        style={{ background: 'var(--surface-muted)', color: 'var(--ink)', border: '1px solid var(--border)' }}
        onFocus={e => (e.currentTarget.style.borderColor = 'var(--border-strong)')}
        onBlur={e  => (e.currentTarget.style.borderColor = 'var(--border)')}
      />
    </div>
  )
}

/* ══════════════════════════════════════════════════════════════════════
   BADGE
   ══════════════════════════════════════════════════════════════════════ */
export function Badge({
  children, variant = 'default', className = '',
}: {
  children: React.ReactNode
  variant?: 'default' | 'success' | 'danger' | 'warning' | 'green' | 'red' | 'yellow' | 'blue'
  className?: string
}) {
  const styles: Record<string, React.CSSProperties> = {
    default: { background: 'var(--surface-strong)', color: 'var(--muted)',   border: '1px solid var(--border)' },
    success: { background: 'var(--success-muted)',  color: 'var(--success)', border: '1px solid rgba(52,211,153,0.25)' },
    danger:  { background: 'var(--danger-muted)',   color: 'var(--danger)',  border: '1px solid rgba(248,113,113,0.25)' },
    warning: { background: 'var(--warning-muted)',  color: 'var(--warning)', border: '1px solid rgba(251,191,36,0.25)' },
    green:   { background: 'var(--success-muted)',  color: 'var(--success)', border: '1px solid rgba(52,211,153,0.25)' },
    red:     { background: 'var(--danger-muted)',   color: 'var(--danger)',  border: '1px solid rgba(248,113,113,0.25)' },
    yellow:  { background: 'var(--warning-muted)',  color: 'var(--warning)', border: '1px solid rgba(251,191,36,0.25)' },
    blue:    { background: 'rgba(99,157,255,0.12)', color: 'var(--accent)',  border: '1px solid rgba(99,157,255,0.25)' },
  }
  return (
    <span
      className={`inline-flex items-center px-2.5 py-1 rounded-full text-[10px] font-semibold uppercase tracking-wide ${className}`}
      style={styles[variant]}
    >
      {children}
    </span>
  )
}

/* ══════════════════════════════════════════════════════════════════════
   STAT CELL  (legacy — kept for existing pages)
   ══════════════════════════════════════════════════════════════════════ */
export function Stat({ label, value, sub }: { label: string; value: React.ReactNode; sub?: string }) {
  return (
    <div className="flex flex-col gap-0.5">
      <Label>{label}</Label>
      <div className="font-display font-bold text-xl tabular-nums" style={{ color: 'var(--ink)' }}>{value}</div>
      {sub && <p className="text-xs" style={{ color: 'var(--subtle)' }}>{sub}</p>}
    </div>
  )
}

/* ══════════════════════════════════════════════════════════════════════
   TX STATUS ROW
   ══════════════════════════════════════════════════════════════════════ */
export function TxStatus({
  isPending, isConfirming, isSuccess, hash, explorerUrl, successMsg = 'Transaction confirmed', className = '',
}: {
  isPending?: boolean; isConfirming?: boolean; isSuccess?: boolean
  hash?: string; explorerUrl?: (h: string) => string; successMsg?: string; className?: string
}) {
  if (!isPending && !isConfirming && !isSuccess) return null
  return (
    <div
      className={`flex items-center justify-between gap-3 rounded-xl px-4 py-3 text-sm ${className}`}
      style={{
        background: isSuccess ? 'var(--success-muted)' : 'var(--surface-muted)',
        border: `1px solid ${isSuccess ? 'rgba(52,211,153,0.25)' : 'var(--border)'}`,
        color: isSuccess ? 'var(--success)' : 'var(--muted)',
      }}
    >
      <span className="flex items-center gap-2">
        {(isPending || isConfirming) && <Loader2 size={13} className="animate-spin shrink-0" />}
        {isSuccess && <CheckCircle2 size={13} className="shrink-0" />}
        {isPending    && 'Waiting for wallet signature…'}
        {isConfirming && 'Confirming on-chain…'}
        {isSuccess    && successMsg}
      </span>
      {isSuccess && hash && explorerUrl && (
        <a
          href={explorerUrl(hash)}
          target="_blank"
          rel="noreferrer"
          className="flex items-center gap-1 text-xs shrink-0 hover:opacity-70 transition-opacity"
          style={{ color: 'var(--accent)' }}
        >
          <ExternalLink size={11} /> View
        </a>
      )}
    </div>
  )
}

/* ══════════════════════════════════════════════════════════════════════
   PAGE HEADER
   ══════════════════════════════════════════════════════════════════════ */
export function PageHeader({
  icon: Icon, title, subtitle, accentColor = 'var(--accent)',
}: {
  icon?: React.ElementType; title: string; subtitle?: string; accentColor?: string
}) {
  const grad = `linear-gradient(120deg, color-mix(in srgb, ${accentColor} 10%, transparent) 0%, transparent 65%)`
  return (
    <div
      className="page-hero flex items-center gap-4"
      style={{ '--hero-accent-grad': grad } as React.CSSProperties}
    >
      {Icon && (
        <div
          className="relative z-10 flex-shrink-0 flex items-center justify-center rounded-2xl"
          style={{
            width: 52, height: 52,
            background: `color-mix(in srgb, ${accentColor} 13%, transparent)`,
            border: `1px solid color-mix(in srgb, ${accentColor} 26%, transparent)`,
          }}
        >
          <Icon size={24} style={{ color: accentColor }} strokeWidth={1.8} />
        </div>
      )}
      <div className="relative z-10 min-w-0">
        <h1
          className="font-display font-bold text-2xl leading-tight"
          style={{ color: 'var(--ink)', letterSpacing: '-0.025em' }}
        >
          {title}
        </h1>
        {subtitle && (
          <p className="text-sm mt-0.5" style={{ color: 'var(--muted)' }}>{subtitle}</p>
        )}
      </div>
    </div>
  )
}

/* ══════════════════════════════════════════════════════════════════════
   ALERT BOX
   ══════════════════════════════════════════════════════════════════════ */
export function AlertBox({
  children, variant = 'warning',
}: {
  children: React.ReactNode; variant?: 'warning' | 'danger' | 'info'
}) {
  const map = {
    warning: { bg: 'var(--warning-muted)', border: 'rgba(251,191,36,0.25)', color: 'var(--warning)', Icon: AlertCircle },
    danger:  { bg: 'var(--danger-muted)',  border: 'rgba(248,113,113,0.25)', color: 'var(--danger)',  Icon: AlertCircle },
    info:    { bg: 'var(--accent-muted)',  border: 'rgba(99,157,255,0.25)',  color: 'var(--accent)',  Icon: AlertCircle },
  }
  const { bg, border, color, Icon } = map[variant]
  return (
    <div
      className="flex items-start gap-2.5 px-4 py-3 rounded-xl text-sm"
      style={{ background: bg, border: `1px solid ${border}`, color }}
    >
      <Icon size={15} className="shrink-0 mt-0.5" />
      <span>{children}</span>
    </div>
  )
}
