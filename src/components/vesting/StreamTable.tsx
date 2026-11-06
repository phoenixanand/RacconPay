/**
 * Searchable, filterable, sortable table of streams. A row opens the full stream detail below it.
 */
import { Fragment, useState } from 'react'
import { Search, Download, ChevronDown, ChevronUp, Clock } from 'lucide-react'

import { Card, Badge, GhostButton } from '../ui'
import { formatUsdc } from '../../utils'
import StreamCardV2 from './StreamCardV2'
import { exportStreamsCsv } from './exportCsv'
import { useNow, fmtDate } from './shared'
import { STATUS_LABEL, streamStatus, vestedPct, type ConsoleStream, type StreamStatus } from './consoleData'
import type { Role } from './Inbox'

type Filter = 'all' | StreamStatus
type SortKey = 'newest' | 'largest' | 'ending' | 'claimable'

const FILTERS: Filter[] = ['all', 'active', 'paused', 'vested', 'completed', 'cancelled']
const BADGE: Record<StreamStatus, 'default' | 'warning' | 'success' | 'danger'> = {
  active: 'default', paused: 'warning', vested: 'success', completed: 'success', cancelled: 'danger',
}

export default function StreamTable({ streams, wallet, role, chainId, networkName, nameOf, onRefresh }: {
  streams: ConsoleStream[]
  wallet: `0x${string}`
  role: Role
  chainId: number
  networkName: string
  nameOf: (addr: string) => string
  onRefresh: () => void
}) {
  const now = useNow(30_000)
  const [query, setQuery] = useState('')
  const [filter, setFilter] = useState<Filter>('all')
  const [sort, setSort] = useState<SortKey>('newest')
  const [openKey, setOpenKey] = useState<string | null>(null)

  const counterparty = (s: ConsoleStream) => (role === 'paying' ? s.stream.beneficiary : s.stream.grantor)
  const q = query.trim().toLowerCase()

  const rows = streams
    .filter(s => filter === 'all' || streamStatus(s, now) === filter)
    .filter(s => {
      if (!q) return true
      const who = counterparty(s)
      return who.toLowerCase().includes(q) || nameOf(who).toLowerCase().includes(q) || s.id.toString() === q.replace('#', '')
    })
    .sort((a, b) => {
      if (sort === 'largest') return Number(b.stream.totalAmount - a.stream.totalAmount)
      if (sort === 'ending') return Number((a.metrics?.effectiveEnd ?? a.stream.endTime) - (b.metrics?.effectiveEnd ?? b.stream.endTime))
      if (sort === 'claimable') return Number((b.metrics?.claimable ?? 0n) - (a.metrics?.claimable ?? 0n))
      return Number(b.stream.startTime - a.stream.startTime)
    })

  const th = 'px-4 py-2.5 text-left text-[10px] font-semibold uppercase tracking-[0.1em]'

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative flex-1 min-w-[200px]">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2" style={{ color: 'var(--subtle)' }} />
          <input value={query} onChange={e => setQuery(e.target.value)} placeholder="Search by name, address or stream #"
                 className="w-full rounded-xl pl-9 pr-3 py-2.5 text-sm outline-none placeholder:text-[var(--subtle)]"
                 style={{ background: 'var(--surface-muted)', color: 'var(--ink)', border: '1px solid var(--border)' }} />
        </div>
        <select value={sort} onChange={e => setSort(e.target.value as SortKey)} aria-label="Sort streams"
                className="rounded-xl px-3 py-2.5 text-sm outline-none"
                style={{ background: 'var(--surface-muted)', color: 'var(--ink)', border: '1px solid var(--border)' }}>
          <option value="newest">Newest first</option>
          <option value="largest">Largest amount</option>
          <option value="ending">Ending soonest</option>
          <option value="claimable">Most ready to claim</option>
        </select>
        <GhostButton onClick={() => exportStreamsCsv(rows, nameOf, networkName)} disabled={rows.length === 0}>
          <Download size={14} /> Export CSV
        </GhostButton>
      </div>

      <div className="flex flex-wrap gap-1.5">
        {FILTERS.map(f => (
          <button key={f} onClick={() => setFilter(f)} className="px-3 py-1.5 rounded-lg text-xs font-medium transition-all"
                  style={{
                    background: filter === f ? 'var(--surface-strong)' : 'transparent',
                    color: filter === f ? 'var(--ink)' : 'var(--muted)',
                    border: `1px solid ${filter === f ? 'var(--border-strong)' : 'var(--border)'}`,
                  }}>
            {f === 'all' ? 'All' : STATUS_LABEL[f]}
          </button>
        ))}
      </div>

      {rows.length === 0 ? (
        <Card className="flex flex-col items-center gap-3 py-14 text-center">
          <Clock size={24} style={{ color: 'var(--subtle)' }} />
          <p className="text-sm font-semibold" style={{ color: 'var(--ink)' }}>
            {streams.length === 0 ? 'No streams yet' : 'No streams match these filters'}
          </p>
          <p className="text-sm" style={{ color: 'var(--muted)' }}>
            {streams.length === 0 ? 'Create a stream or upload a CSV to get started.' : 'Try a different search or status.'}
          </p>
        </Card>
      ) : (
        <Card className="overflow-x-auto">
          <table className="w-full min-w-[760px] text-sm">
            <thead>
              <tr className="border-b border-[var(--border)]" style={{ color: 'var(--subtle)' }}>
                <th className={th}>Stream</th>
                <th className={th}>{role === 'paying' ? 'Payee' : 'Payer'}</th>
                <th className={th}>Status</th>
                <th className={th}>Vested</th>
                <th className={`${th} text-right`}>Total (USDC)</th>
                <th className={`${th} text-right`}>{role === 'paying' ? 'Yield (USDC)' : 'Ready to claim'}</th>
                <th className={th}>Ends</th>
                <th className={th} aria-label="Open" />
              </tr>
            </thead>
            <tbody>
              {rows.map(s => {
                const status = streamStatus(s, now)
                const open = openKey === s.key
                const pct = vestedPct(s)
                return (
                  <Fragment key={s.key}>
                    <tr onClick={() => setOpenKey(open ? null : s.key)} className="cursor-pointer border-b border-[var(--border)] last:border-0 hover:bg-white/[0.03]">
                      <td className="px-4 py-3 whitespace-nowrap">
                        <span className="font-mono font-semibold" style={{ color: 'var(--accent)' }}>#{s.id.toString()}</span>
                        {s.hasYield && <span className="ml-2 text-[10px] font-semibold uppercase" style={{ color: 'var(--success)' }}>yield</span>}
                      </td>
                      <td className="px-4 py-3" style={{ color: 'var(--ink)' }}>{nameOf(counterparty(s))}</td>
                      <td className="px-4 py-3"><Badge variant={BADGE[status]}>{STATUS_LABEL[status]}</Badge></td>
                      <td className="px-4 py-3 w-40">
                        <div className="h-1.5 rounded-full overflow-hidden" style={{ background: 'var(--surface-strong)' }}>
                          <div className="h-full rounded-full" style={{ width: `${pct}%`, background: status === 'cancelled' ? 'var(--danger)' : status === 'paused' ? 'var(--warning)' : 'var(--accent)' }} />
                        </div>
                        <span className="text-[11px] tabular-nums" style={{ color: 'var(--subtle)' }}>{pct.toFixed(1)}%</span>
                      </td>
                      <td className="px-4 py-3 text-right tabular-nums" style={{ color: 'var(--ink)' }}>{formatUsdc(s.stream.totalAmount)}</td>
                      <td className="px-4 py-3 text-right tabular-nums" style={{ color: 'var(--ink-2)' }}>
                        {role === 'paying'
                          ? (s.hasYield && s.yieldInfo ? formatUsdc(s.yieldInfo.yieldEarned) : '-')
                          : (s.stream.cancelled ? '-' : formatUsdc(s.metrics?.claimable ?? 0n))}
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap tabular-nums" style={{ color: 'var(--muted)' }}>
                        {fmtDate(s.metrics?.effectiveEnd ?? s.stream.endTime)}
                      </td>
                      <td className="px-4 py-3" style={{ color: 'var(--subtle)' }}>
                        {open ? <ChevronUp size={15} /> : <ChevronDown size={15} />}
                      </td>
                    </tr>
                    {open && (
                      <tr className="border-b border-[var(--border)]">
                        <td colSpan={8} className="p-3" style={{ background: 'var(--surface-muted)' }}>
                          <StreamCardV2 streamId={s.id} stream={s.stream} address={wallet} chainId={chainId}
                                        vestingAddress={s.contract} hasYield={s.hasYield} defaultExpanded onRefresh={onRefresh} />
                        </td>
                      </tr>
                    )}
                  </Fragment>
                )
              })}
            </tbody>
          </table>
        </Card>
      )}
    </div>
  )
}
