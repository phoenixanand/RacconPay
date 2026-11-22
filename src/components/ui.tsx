/**
 * RacconPay shared UI primitives.
 * All colours come from CSS variables in index.css. Never hardcode hex here.
 *
 * Exports: Card, GlowCard, StatCard, SectionTitle, Divider, TokenAmountBadge, StepBadge,
 *          Label, PrimaryButton, GhostButton, Input, Badge, Stat, TxStatus, PageHeader, AlertBox
 * Props are unchanged from earlier versions so existing pages keep working.
 */
import React, { useId } from 'react'
import { Loader2, ExternalLink, CheckCircle2, AlertCircle, XCircle, Info } from 'lucide-react'

/* ── Card ─────────────────────────────────────────────────────────── */
export function Card({
  children, className = '', strong = false, style,
}: {
  children: React.ReactNode; className?: string; strong?: boolean; style?: React.CSSProperties
}) {
  return (
    <div className={`rounded-xl ${strong ? 'glass-strong' : 'glass'} ${className}`} style={style}>
      {children}
    </div>
  )
}

/** Card with a hover border. The accent colour props are kept for compatibility and only tint the hover border. */
export function GlowCard({
  children, className = '', accentColor = 'var(--accent)',
}: {
  children: React.ReactNode
  className?: string
  accentColor?: string
  glowColor?: string
}) {
  return (
    <div
      className={`glow-card rounded-xl glass hover:!border-[var(--hover-accent)] ${className}`}
      style={{ '--hover-accent': accentColor } as React.CSSProperties}
    >
      {children}
    </div>
  )
}

/* ── Stat card ────────────────────────────────────────────────────── */
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
    <div className="flex flex-col gap-2 p-4 rounded-xl glass">
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs font-medium" style={{ color: 'var(--muted)' }}>{label}</p>
        {Icon && (
          <span
            className="w-7 h-7 rounded-lg flex items-center justify-center shrink-0"
            style={{ background: `color-mix(in srgb, ${accentColor} 10%, transparent)` }}
          >
            <Icon size={14} style={{ color: accentColor }} aria-hidden="true" />
          </span>
        )}
      </div>
      <div className="text-2xl font-semibold tabular-nums tracking-tight break-words" style={{ color: 'var(--ink)' }}>{value}</div>
      {sub && <p className="text-xs" style={{ color: 'var(--muted)' }}>{sub}</p>}
    </div>
  )
}

/* ── Section title ────────────────────────────────────────────────── */
export function SectionTitle({ title, subtitle }: { title: string; subtitle?: string }) {
  return (
    <div className="flex flex-col gap-1 mb-4">
      <h2 className="text-base font-semibold tracking-tight" style={{ color: 'var(--ink)' }}>{title}</h2>
      {subtitle && <p className="text-sm" style={{ color: 'var(--muted)' }}>{subtitle}</p>}
    </div>
  )
}

/* ── Divider ──────────────────────────────────────────────────────── */
export function Divider({ className = '' }: { className?: string }) {
  return <div role="separator" className={`h-px w-full ${className}`} style={{ background: 'var(--border)' }} />
}

/* ── Token amount pill ────────────────────────────────────────────── */
export function TokenAmountBadge({ amount, symbol = 'USDC' }: { amount: string; symbol?: string }) {
  return (
    <span
      className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-sm font-semibold tabular-nums"
      style={{ background: 'var(--accent-muted)', color: 'var(--accent)' }}
    >
      {amount} {symbol}
    </span>
  )
}

/* ── Step badge ───────────────────────────────────────────────────── */
export function StepBadge({ step, total, label }: { step: number; total: number; label?: string }) {
  return (
    <div className="flex items-center gap-2">
      <span
        className="w-6 h-6 rounded-full flex items-center justify-center text-xs font-semibold shrink-0"
        style={{ background: 'var(--accent)', color: 'var(--on-accent)' }}
      >
        {step}
      </span>
      <span className="text-sm font-medium" style={{ color: 'var(--ink-2)' }}>
        {label ?? `Step ${step} of ${total}`}
      </span>
    </div>
  )
}

/* ── Label ────────────────────────────────────────────────────────── */
export function Label({ children, htmlFor }: { children: React.ReactNode; htmlFor?: string }) {
  return (
    <label htmlFor={htmlFor} className="text-xs font-medium" style={{ color: 'var(--ink-2)' }}>
      {children}
    </label>
  )
}

/* ── Buttons ──────────────────────────────────────────────────────── */
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
      aria-busy={loading || undefined}
      className={`w-full min-h-[44px] flex items-center justify-center gap-2 rounded-lg px-4 py-2.5 text-sm font-semibold
        transition-colors hover:bg-[var(--accent-hover)] active:brightness-95
        disabled:cursor-not-allowed disabled:hover:bg-[var(--surface-muted)] ${className}`}
      style={{
        background: isDisabled ? 'var(--surface-muted)' : 'var(--accent)',
        color: isDisabled ? 'var(--subtle)' : 'var(--on-accent)',
        border: isDisabled ? '1px solid var(--border)' : '1px solid transparent',
      }}
    >
      {loading && <Loader2 size={15} className="animate-spin shrink-0" aria-hidden="true" />}
      {children}
    </button>
  )
}

export function GhostButton({
  children, onClick, disabled, className = '',
}: {
  children: React.ReactNode; onClick?: () => void; disabled?: boolean; className?: string
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`min-h-[44px] flex items-center justify-center gap-1.5 rounded-lg px-4 py-2.5 text-sm font-medium
        transition-colors hover:bg-[var(--surface-hover)] disabled:opacity-50 disabled:cursor-not-allowed ${className}`}
      style={{ color: 'var(--ink-2)', border: '1px solid var(--border-strong)', background: 'var(--surface)' }}
    >
      {children}
    </button>
  )
}

/* ── Input ────────────────────────────────────────────────────────── */
export function Input({
  value, onChange, onKeyDown, placeholder, type = 'text',
  className = '', label, mono = false,
}: {
  value: string; onChange: (v: string) => void; onKeyDown?: (e: React.KeyboardEvent) => void
  placeholder?: string; type?: string; className?: string; label?: string; mono?: boolean
}) {
  const id = useId()
  return (
    <div className="flex flex-col gap-1.5">
      {label && <Label htmlFor={id}>{label}</Label>}
      <input
        id={id}
        type={type}
        value={value}
        onChange={e => onChange(e.target.value)}
        onKeyDown={onKeyDown}
        placeholder={placeholder}
        className={`w-full min-h-[44px] rounded-lg px-3.5 py-2.5 text-sm outline-none transition-colors
          placeholder:text-[var(--subtle)] focus:border-[var(--accent)] focus:ring-2 focus:ring-[var(--accent-glow)]
          ${mono ? 'font-mono' : ''} ${className}`}
        style={{ background: 'var(--surface)', color: 'var(--ink)', border: '1px solid var(--border-strong)' }}
      />
    </div>
  )
}

/* ── Badge ────────────────────────────────────────────────────────── */
export function Badge({
  children, variant = 'default', className = '',
}: {
  children: React.ReactNode
  variant?: 'default' | 'success' | 'danger' | 'warning' | 'green' | 'red' | 'yellow' | 'blue'
  className?: string
}) {
  const tone = {
    default: { bg: 'var(--surface-muted)', fg: 'var(--muted)' },
    success: { bg: 'var(--success-muted)', fg: 'var(--success)' },
    danger:  { bg: 'var(--danger-muted)',  fg: 'var(--danger)' },
    warning: { bg: 'var(--warning-muted)', fg: 'var(--warning)' },
    blue:    { bg: 'var(--accent-muted)',  fg: 'var(--accent)' },
  }
  const map = { green: 'success', red: 'danger', yellow: 'warning' } as const
  const t = tone[(map as Record<string, keyof typeof tone>)[variant] ?? (variant as keyof typeof tone)]
  return (
    <span
      className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium whitespace-nowrap ${className}`}
      style={{ background: t.bg, color: t.fg }}
    >
      {children}
    </span>
  )
}

/* ── Stat cell (legacy) ───────────────────────────────────────────── */
export function Stat({ label, value, sub }: { label: string; value: React.ReactNode; sub?: string }) {
  return (
    <div className="flex flex-col gap-0.5">
      <p className="text-xs font-medium" style={{ color: 'var(--muted)' }}>{label}</p>
      <div className="text-xl font-semibold tabular-nums tracking-tight" style={{ color: 'var(--ink)' }}>{value}</div>
      {sub && <p className="text-xs" style={{ color: 'var(--muted)' }}>{sub}</p>}
    </div>
  )
}

/* ── Transaction status row ───────────────────────────────────────── */
export function TxStatus({
  isPending, isConfirming, isSuccess, isError, errorMsg, hash, explorerUrl,
  successMsg = 'Transaction confirmed', className = '',
}: {
  isPending?: boolean; isConfirming?: boolean; isSuccess?: boolean
  isError?: boolean; errorMsg?: string
  hash?: string; explorerUrl?: (h: string) => string; successMsg?: string; className?: string
}) {
  if (!isPending && !isConfirming && !isSuccess && !isError) return null
  const tone = isSuccess ? 'var(--success)' : isError ? 'var(--danger)' : 'var(--muted)'
  const bg = isSuccess ? 'var(--success-muted)' : isError ? 'var(--danger-muted)' : 'var(--surface-muted)'
  return (
    <div
      role="status"
      aria-live="polite"
      className={`flex items-center justify-between gap-3 rounded-lg px-4 py-3 text-sm ${className}`}
      style={{ background: bg, border: '1px solid var(--border)', color: tone }}
    >
      <span className="flex items-center gap-2 min-w-0">
        {(isPending || isConfirming) && <Loader2 size={14} className="animate-spin shrink-0" aria-hidden="true" />}
        {isSuccess && <CheckCircle2 size={14} className="shrink-0" aria-hidden="true" />}
        {isError && <XCircle size={14} className="shrink-0" aria-hidden="true" />}
        <span className="min-w-0 break-words">
          {isPending    && 'Waiting for wallet signature…'}
          {isConfirming && 'Submitted. Waiting for confirmation on Arc…'}
          {isSuccess    && successMsg}
          {isError      && (errorMsg ?? 'Transaction failed')}
        </span>
      </span>
      {hash && explorerUrl && (isSuccess || isConfirming) && (
        <a
          href={explorerUrl(hash)}
          target="_blank"
          rel="noreferrer"
          className="flex items-center gap-1 text-xs font-medium shrink-0 hover:underline"
          style={{ color: 'var(--accent)' }}
        >
          <ExternalLink size={12} aria-hidden="true" /> View
        </a>
      )}
    </div>
  )
}

/* ── Page header ──────────────────────────────────────────────────── */
export function PageHeader({
  icon: Icon, title, subtitle, accentColor = 'var(--accent)',
}: {
  icon?: React.ElementType; title: string; subtitle?: string; accentColor?: string
}) {
  return (
    <div className="page-hero flex items-start gap-3.5">
      {Icon && (
        <div
          className="shrink-0 flex items-center justify-center rounded-xl w-10 h-10"
          style={{ background: `color-mix(in srgb, ${accentColor} 10%, transparent)` }}
        >
          <Icon size={20} style={{ color: accentColor }} strokeWidth={1.8} aria-hidden="true" />
        </div>
      )}
      <div className="min-w-0">
        <h1 className="text-2xl font-semibold leading-tight tracking-tight text-balance" style={{ color: 'var(--ink)' }}>
          {title}
        </h1>
        {subtitle && <p className="text-sm mt-1 max-w-prose text-pretty" style={{ color: 'var(--muted)' }}>{subtitle}</p>}
      </div>
    </div>
  )
}

/* ── Alert box ────────────────────────────────────────────────────── */
export function AlertBox({
  children, variant = 'warning',
}: {
  children: React.ReactNode; variant?: 'warning' | 'danger' | 'info'
}) {
  const map = {
    warning: { bg: 'var(--warning-muted)', color: 'var(--warning)', Icon: AlertCircle },
    danger:  { bg: 'var(--danger-muted)',  color: 'var(--danger)',  Icon: AlertCircle },
    info:    { bg: 'var(--accent-muted)',  color: 'var(--accent)',  Icon: Info },
  }
  const { bg, color, Icon } = map[variant]
  return (
    <div
      role={variant === 'danger' ? 'alert' : 'status'}
      className="flex items-start gap-2.5 px-4 py-3 rounded-lg text-sm"
      style={{ background: bg, border: '1px solid var(--border)', color }}
    >
      <Icon size={16} className="shrink-0 mt-0.5" aria-hidden="true" />
      <span className="min-w-0 break-words">{children}</span>
    </div>
  )
}
