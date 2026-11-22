/** Searchable, filterable activity table used by the Overview and Transaction History pages. */
import { useMemo, useState } from 'react'
import { ExternalLink, Search } from 'lucide-react'
import { Card } from './ui'
import { DataTable, type Column } from './kit/DataTable'
import { StatusBadge } from './kit/StatusBadge'
import { EmptyState, ErrorState } from './kit/States'
import { Select } from './kit/Fields'
import { ARC_CHAIN_ID, chainLabel, explorerTxFor } from '../constants'
import { formatToken, shortHash } from '../utils'
import { typeLabel, type ActivityRow } from '../lib/activity'

export const BUSINESS_TYPES = ['Batch payout', 'Vesting', 'Approval', 'Invoice', 'Escrow']
export const PERSONAL_TYPES = ['Group expense', 'Swap', 'Bridge']
const ALL_TYPES = [...BUSINESS_TYPES, ...PERSONAL_TYPES, 'Other']

const fmtDate = (ts: number) => new Date(ts * 1000).toLocaleString(undefined, { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })
const fmtAmount = (r: ActivityRow) => (r.amountRaw !== undefined ? `${formatToken(r.amountRaw, r.decimals ?? 6)} ${r.token ?? 'USDC'}` : '-')

function HashLink({ hash, chainId, url, label }: { hash: `0x${string}`; chainId?: number; url?: string; label?: string }) {
  return (
    <a href={url ?? explorerTxFor(chainId ?? ARC_CHAIN_ID, hash)} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 font-mono text-xs hover:underline" style={{ color: 'var(--accent)' }}>
      {label && <span style={{ color: 'var(--muted)' }}>{label}</span>}
      {shortHash(hash)} <ExternalLink size={11} aria-hidden="true" />
      <span className="sr-only">(opens explorer in a new tab)</span>
    </a>
  )
}

function Reference({ row }: { row: ActivityRow }) {
  if (!row.hash) return <span className="text-xs" style={{ color: 'var(--muted)' }}>{row.detail}</span>
  return (
    <span className="flex flex-col gap-0.5 min-w-0">
      <span className="text-xs" style={{ color: 'var(--muted)' }}>{row.detail}</span>
      <HashLink hash={row.hash} chainId={row.chainId} url={row.url} label={row.counterHash ? 'Source ' : undefined} />
      {row.counterHash && <HashLink hash={row.counterHash} chainId={row.counterChainId} url={row.counterUrl} label="Destination " />}
    </span>
  )
}

export default function ActivityTable({
  rows, loading, error, onRetry, pageSize = 8, emptyBody, caption = 'Recent activity', filters = true, typeOptions = ALL_TYPES,
}: {
  rows: ActivityRow[]; loading?: boolean; error?: boolean; onRetry?: () => void
  pageSize?: number; emptyBody?: string; caption?: string; filters?: boolean; typeOptions?: string[]
}) {
  const [q, setQ] = useState('')
  const [type, setType] = useState('All types')
  const [status, setStatus] = useState('all')

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase()
    return rows.filter(r =>
      (type === 'All types' || r.type === type) &&
      (status === 'all' || r.status === status) &&
      (!needle || [r.hash ?? '', r.counterHash ?? '', r.detail, typeLabel(r.type)].some(s => s.toLowerCase().includes(needle))),
    )
  }, [rows, q, type, status])

  const columns: Column<ActivityRow>[] = [
    { key: 'date', header: 'Date and time', render: r => <span className="whitespace-nowrap">{fmtDate(r.ts)}</span> },
    { key: 'type', header: 'Type', render: r => <span className="font-medium">{typeLabel(r.type)}</span> },
    { key: 'network', header: 'Network', render: r => <span className="whitespace-nowrap text-xs" style={{ color: 'var(--muted)' }}>{r.network ?? chainLabel(r.chainId ?? ARC_CHAIN_ID)}</span> },
    { key: 'ref', header: 'Details / hash', render: r => <Reference row={r} /> },
    { key: 'amount', header: 'Amount', align: 'right', render: r => <span className="whitespace-nowrap">{fmtAmount(r)}</span> },
    { key: 'status', header: 'Status', render: r => <StatusBadge status={r.status} /> },
  ]

  if (error) return <Card><ErrorState title="Could not load activity" body="The Arc network did not answer. Check your connection and try again." onRetry={onRetry} /></Card>

  return (
    <Card className="overflow-hidden">
      {filters && (
        <div className="p-4 grid gap-3 sm:grid-cols-[1fr_180px_160px]" style={{ borderBottom: '1px solid var(--border)' }}>
          <div className="flex flex-col gap-1.5">
            <label htmlFor="activity-search" className="text-xs font-medium" style={{ color: 'var(--ink-2)' }}>Search</label>
            <div className="relative">
              <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2" style={{ color: 'var(--subtle)' }} aria-hidden="true" />
              <input
                id="activity-search" type="search" value={q} onChange={e => setQ(e.target.value)} placeholder="Hash or details"
                className="w-full min-h-[44px] rounded-lg pl-9 pr-3 text-sm outline-none focus:border-[var(--accent)] focus:ring-2 focus:ring-[var(--accent-glow)]"
                style={{ background: 'var(--surface)', color: 'var(--ink)', border: '1px solid var(--border-strong)' }}
              />
            </div>
          </div>
          <Select label="Type" value={type} onChange={setType} options={['All types', ...typeOptions].map(t => ({ value: t, label: t === 'Group expense' ? 'Bill Split' : t }))} />
          <Select label="Status" value={status} onChange={setStatus} options={[{ value: 'all', label: 'All statuses' }, { value: 'confirmed', label: 'Confirmed' }, { value: 'pending', label: 'Pending' }, { value: 'failed', label: 'Failed' }]} />
        </div>
      )}
      <DataTable
        caption={caption}
        columns={columns} rows={filtered} rowKey={r => r.id} loading={loading} pageSize={pageSize}
        empty={<EmptyState title={rows.length ? 'No matching activity' : 'No activity yet'} body={rows.length ? 'Try a different search or filter.' : emptyBody ?? 'Payments you make with this wallet appear here once they are confirmed.'} />}
        mobileCard={r => (
          <div className="flex flex-col gap-1.5">
            <div className="flex items-center justify-between gap-2">
              <span className="text-sm font-medium" style={{ color: 'var(--ink)' }}>{typeLabel(r.type)}</span>
              <StatusBadge status={r.status} />
            </div>
            <Reference row={r} />
            <div className="flex items-center justify-between text-xs" style={{ color: 'var(--muted)' }}>
              <span>{fmtDate(r.ts)} · {r.network ?? chainLabel(r.chainId ?? ARC_CHAIN_ID)}</span><span className="tabular-nums font-medium" style={{ color: 'var(--ink)' }}>{fmtAmount(r)}</span>
            </div>
          </div>
        )}
      />
    </Card>
  )
}
