/**
 * StatsRow: a compact strip of three live numbers with honest loading, syncing and error states.
 * Used on Home, Swap, Bill Split and Bridge.
 */
import { Loader2 } from 'lucide-react'
import { formatToken } from '../utils'

export interface StatCardData {
  label: string
  /** Display text, or null while unknown. */
  value: string | null
  sub?: string
}

interface Props {
  title?: string
  cards: StatCardData[]
  /** True while the first read is still running. */
  syncing?: boolean
  /** 0 to 1 share of history already read; shown only while syncing. */
  progress?: number
  error?: boolean
  note?: string
  className?: string
}

export function formatCount(n: number): string {
  return new Intl.NumberFormat('en-US').format(n)
}

/** "1,234.56" from a raw 6-decimal amount. */
export function formatAmount(raw: bigint, decimals = 6, maxFraction = 2): string {
  const [whole, frac = ''] = formatToken(raw, decimals).split('.')
  const w = new Intl.NumberFormat('en-US').format(BigInt(whole))
  const f = frac.slice(0, maxFraction)
  return f ? `${w}.${f}` : w
}

export default function StatsRow({ title, cards, syncing, progress = 0, error, note, className = '' }: Props) {
  const pct = Math.round(progress * 100)
  return (
    <section className={`flex flex-col gap-3 ${className}`} aria-label={title ?? 'Statistics'}>
      <div className={`flex flex-wrap items-center gap-x-3 gap-y-1 ${title ? 'justify-between' : 'justify-end'} ${!title && !syncing ? 'hidden' : ''}`}>
        {title && <p className="text-[10px] font-bold uppercase tracking-[0.12em]" style={{ color: 'var(--subtle)' }}>{title}</p>}
        {syncing && (
          <span className="flex items-center gap-1.5 text-[11px]" style={{ color: 'var(--muted)' }}>
            <Loader2 size={11} className="animate-spin" />
            {pct > 0 && pct < 100 ? `Syncing ${pct}%` : 'Syncing'}
          </span>
        )}
      </div>

      <div className="grid grid-cols-1 min-[420px]:grid-cols-3 gap-2.5">
        {cards.map(c => (
          <div
            key={c.label}
            className="min-w-0 flex flex-col gap-1 rounded-2xl px-4 py-3.5"
            style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}
          >
            <p className="text-[9px] font-semibold uppercase tracking-[0.12em]" style={{ color: 'var(--subtle)' }}>{c.label}</p>
            {c.value === null ? (
              <span
                className={`h-7 w-20 rounded-md ${syncing ? 'animate-pulse' : ''}`}
                style={{ background: 'var(--surface-strong)' }}
                aria-label={syncing ? 'Loading' : 'Unavailable'}
              >
                {!syncing && <span className="text-xl font-display font-bold" style={{ color: 'var(--subtle)' }}>-</span>}
              </span>
            ) : (
              <p className="font-display font-bold text-xl tabular-nums break-words" style={{ color: 'var(--ink)' }}>{c.value}</p>
            )}
            {c.sub && <p className="text-[11px] leading-snug break-words" style={{ color: 'var(--subtle)' }}>{c.sub}</p>}
          </div>
        ))}
      </div>

      {(error || note) && (
        <p className="text-[11px] leading-relaxed" style={{ color: error ? 'var(--warning)' : 'var(--subtle)' }}>
          {error ? 'Could not reach the network just now. Showing the last saved numbers, which may be out of date. ' : ''}
          {note}
        </p>
      )}
    </section>
  )
}
