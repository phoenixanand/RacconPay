/**
 * Invoice Dashboard — analytics overview of all invoices.
 * Shows totals, paid/unpaid/overdue breakdown, monthly chart, and recent activity.
 */
import React, { useMemo } from 'react'
import { BarChart2, CheckCircle2, Clock, AlertTriangle, TrendingUp, FileText, Download } from 'lucide-react'
import { Card, PageHeader, Badge, Divider } from './ui'
import { type InvoiceData, type InvoiceStatus } from './InvoiceGenerator'
import { shortAddr } from '../utils'
import { explorerTx } from '../constants'
import { ExternalLink } from 'lucide-react'

const LS_KEY = 'racconpay-invoices'
// Stable timestamp — computed once at module load, not during render
const MODULE_NOW = new Date()
const MODULE_NOW_ISO = MODULE_NOW.toISOString().slice(0, 7)

function loadInvoices(): InvoiceData[] {
  try { return JSON.parse(localStorage.getItem(LS_KEY) ?? '[]') as InvoiceData[] } catch { return [] }
}

function computeStatus(inv: InvoiceData): InvoiceStatus {
  if (inv.status === 'paid') return 'paid'
  if (inv.dueDate && new Date(inv.dueDate) < new Date()) return 'overdue'
  return 'unpaid'
}

function statusBadge(s: InvoiceStatus) {
  if (s === 'paid')    return <Badge variant="success">Paid</Badge>
  if (s === 'overdue') return <Badge variant="danger">Overdue</Badge>
  return <Badge variant="warning">Unpaid</Badge>
}

/* ── Mini bar chart ─────────────────────────────────────── */
function MonthlyChart({ invoices }: { invoices: InvoiceData[] }) {
  const months = useMemo(() => {
    const map: Record<string, { total: number; paid: number }> = {}
    const now = MODULE_NOW
    // last 6 months
    for (let i = 5; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1)
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
      map[key] = { total: 0, paid: 0 }
    }
    invoices.forEach(inv => {
      const d = new Date(inv.createdAt)
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
      if (key in map) {
        const amt = parseFloat(inv.amount) || 0
        map[key].total += amt
        if (computeStatus(inv) === 'paid') map[key].paid += amt
      }
    })
    return Object.entries(map).map(([key, v]) => ({
      label: new Date(key + '-01').toLocaleString('default', { month: 'short' }),
      ...v,
    }))
  }, [invoices])

  const maxVal = Math.max(...months.map(m => m.total), 1)

  return (
    <Card className="p-5">
      <div className="flex items-center gap-2 mb-4">
        <BarChart2 size={16} style={{ color: 'var(--receipt-accent)' }} />
        <span className="font-display font-semibold text-sm" style={{ color: 'var(--ink)' }}>Monthly Invoiced (USDC)</span>
      </div>
      <div className="flex items-end gap-2 h-28">
        {months.map((m, i) => (
          <div key={i} className="flex-1 flex flex-col items-center gap-1">
            <div className="w-full flex flex-col justify-end rounded-t-sm overflow-hidden" style={{ height: '88px', background: 'var(--surface-strong)' }}>
              {/* total bar */}
              <div
                className="w-full rounded-t-sm transition-all duration-500"
                style={{
                  height: `${(m.total / maxVal) * 88}px`,
                  background: 'var(--receipt-accent)',
                  opacity: 0.25,
                }}
              />
              {/* paid overlay */}
              <div
                className="w-full absolute rounded-t-sm transition-all duration-500"
                style={{
                  height: `${(m.paid / maxVal) * 88}px`,
                  background: 'var(--success)',
                  position: 'relative',
                  marginTop: `-${(m.paid / maxVal) * 88}px`,
                  opacity: 0.7,
                }}
              />
            </div>
            <span className="text-[10px]" style={{ color: 'var(--subtle)' }}>{m.label}</span>
          </div>
        ))}
      </div>
      <div className="flex items-center gap-4 mt-3">
        <div className="flex items-center gap-1.5">
          <div className="w-3 h-3 rounded-sm" style={{ background: 'var(--receipt-accent)', opacity: 0.4 }} />
          <span className="text-xs" style={{ color: 'var(--subtle)' }}>Invoiced</span>
        </div>
        <div className="flex items-center gap-1.5">
          <div className="w-3 h-3 rounded-sm" style={{ background: 'var(--success)', opacity: 0.7 }} />
          <span className="text-xs" style={{ color: 'var(--subtle)' }}>Paid</span>
        </div>
      </div>
    </Card>
  )
}

/* ── Stat card ──────────────────────────────────────────── */
function StatTile({
  icon: Icon, label, value, sub, accent,
}: {
  icon: React.ElementType; label: string; value: string; sub?: string; accent: string
}) {
  return (
    <Card className="p-4 flex flex-col gap-2">
      <div className="flex items-center gap-2">
        <div className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ background: `color-mix(in srgb, ${accent} 15%, transparent)` }}>
          <Icon size={16} style={{ color: accent }} />
        </div>
        <span className="text-xs font-semibold uppercase tracking-wide" style={{ color: 'var(--subtle)' }}>{label}</span>
      </div>
      <p className="font-display font-bold text-2xl tabular-nums" style={{ color: 'var(--ink)' }}>{value}</p>
      {sub && <p className="text-xs" style={{ color: 'var(--muted)' }}>{sub}</p>}
    </Card>
  )
}

/* ── Main Dashboard ─────────────────────────────────────── */
export default function InvoiceDashboard() {
  const invoices = useMemo(() => loadInvoices(), [])

  const totalInvoiced  = invoices.reduce((s, i) => s + (parseFloat(i.amount) || 0), 0)
  const totalPaid      = invoices.filter(i => computeStatus(i) === 'paid').reduce((s, i) => s + (parseFloat(i.amount) || 0), 0)
  const totalOutstanding = invoices.filter(i => computeStatus(i) !== 'paid').reduce((s, i) => s + (parseFloat(i.amount) || 0), 0)
  const overdueCount   = invoices.filter(i => computeStatus(i) === 'overdue').length
  const paidCount      = invoices.filter(i => computeStatus(i) === 'paid').length
  const unpaidCount    = invoices.filter(i => computeStatus(i) === 'unpaid').length
  const collectionRate = totalInvoiced > 0 ? ((totalPaid / totalInvoiced) * 100).toFixed(0) : '0'

  // Average days to pay (paid invoices only)
  const paidInvoices = invoices.filter(i => computeStatus(i) === 'paid' && i.paidAt)
  const avgDaysToPay = paidInvoices.length > 0
    ? (paidInvoices.reduce((s, i) => s + (i.paidAt! - i.createdAt), 0) / paidInvoices.length / 86400000).toFixed(1)
    : null

  // This month — uses module-level constant to avoid impure new Date() in render
  const thisMonth = MODULE_NOW_ISO
  const thisMonthInvoiced = invoices
    .filter(i => new Date(i.createdAt).toISOString().slice(0, 7) === thisMonth)
    .reduce((s, i) => s + (parseFloat(i.amount) || 0), 0)

  // Recent invoices (last 5)
  const recent = [...invoices].sort((a, b) => b.createdAt - a.createdAt).slice(0, 5)

  if (invoices.length === 0) {
    return (
      <div className="flex flex-col gap-6 animate-fade-up">
        <PageHeader icon={BarChart2} title="Invoice Dashboard" subtitle="Analytics overview of all your invoices." accentColor="var(--receipt-accent)" />
        <div className="flex flex-col items-center gap-3 py-16 text-center">
          <BarChart2 size={40} style={{ color: 'var(--subtle)' }} />
          <p className="font-display font-semibold" style={{ color: 'var(--ink)' }}>No invoices yet</p>
          <p className="text-sm" style={{ color: 'var(--muted)' }}>Create your first invoice to see analytics here.</p>
        </div>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-6 animate-fade-up">
      <PageHeader
        icon={BarChart2}
        title="Invoice Dashboard"
        subtitle="Analytics overview of all your invoices."
        accentColor="var(--receipt-accent)"
      />

      {/* Stats grid */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <StatTile icon={FileText}     label="Total invoiced"  value={`${totalInvoiced.toFixed(2)}`}  sub="USDC all time"             accent="var(--receipt-accent)" />
        <StatTile icon={CheckCircle2} label="Total collected" value={`${totalPaid.toFixed(2)}`}      sub={`${collectionRate}% collection rate`} accent="var(--success)" />
        <StatTile icon={Clock}        label="Outstanding"     value={`${totalOutstanding.toFixed(2)}`} sub={`${unpaidCount} unpaid invoice${unpaidCount !== 1 ? 's' : ''}`} accent="var(--vest-accent)" />
        <StatTile icon={AlertTriangle} label="Overdue"        value={String(overdueCount)}            sub={overdueCount > 0 ? 'Need attention' : 'All good'} accent="var(--error)" />
      </div>

      {/* Secondary stats */}
      <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
        <Card className="p-4">
          <p className="text-xs font-semibold uppercase tracking-wide mb-1" style={{ color: 'var(--subtle)' }}>This month</p>
          <p className="font-display font-bold text-xl tabular-nums" style={{ color: 'var(--ink)' }}>{thisMonthInvoiced.toFixed(2)} <span className="text-sm font-normal" style={{ color: 'var(--muted)' }}>USDC</span></p>
        </Card>
        <Card className="p-4">
          <p className="text-xs font-semibold uppercase tracking-wide mb-1" style={{ color: 'var(--subtle)' }}>Paid invoices</p>
          <p className="font-display font-bold text-xl tabular-nums" style={{ color: 'var(--ink)' }}>{paidCount} <span className="text-sm font-normal" style={{ color: 'var(--muted)' }}>of {invoices.length}</span></p>
        </Card>
        <Card className="p-4">
          <p className="text-xs font-semibold uppercase tracking-wide mb-1" style={{ color: 'var(--subtle)' }}>Avg. days to pay</p>
          <p className="font-display font-bold text-xl tabular-nums" style={{ color: 'var(--ink)' }}>
            {avgDaysToPay !== null ? `${avgDaysToPay}d` : '—'}
          </p>
        </Card>
      </div>

      {/* Monthly chart */}
      <MonthlyChart invoices={invoices} />

      {/* Recent activity */}
      <Card className="p-5">
        <div className="flex items-center gap-2 mb-4">
          <TrendingUp size={16} style={{ color: 'var(--receipt-accent)' }} />
          <span className="font-display font-semibold text-sm" style={{ color: 'var(--ink)' }}>Recent Invoices</span>
        </div>
        <div className="flex flex-col divide-y" style={{ borderColor: 'var(--border)' }}>
          {recent.map(inv => {
            const s = computeStatus(inv)
            return (
              <div key={inv.id} className="py-3 flex items-center justify-between gap-3 flex-wrap">
                <div className="flex flex-col gap-0.5 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-mono text-xs font-bold" style={{ color: 'var(--receipt-accent)' }}>{inv.id}</span>
                    {statusBadge(s)}
                  </div>
                  {inv.memo && <p className="text-xs truncate" style={{ color: 'var(--muted)' }}>{inv.memo}</p>}
                  <p className="text-xs font-mono" style={{ color: 'var(--subtle)' }}>to {shortAddr(inv.to)}</p>
                </div>
                <div className="flex flex-col items-end gap-1 shrink-0">
                  <span className="font-display font-bold tabular-nums" style={{ color: 'var(--receipt-accent)' }}>
                    {inv.amount} <span className="text-xs font-normal" style={{ color: 'var(--muted)' }}>USDC</span>
                  </span>
                  {inv.dueDate && (
                    <span className="text-xs" style={{ color: s === 'overdue' ? 'var(--error)' : 'var(--subtle)' }}>
                      Due {inv.dueDate}
                    </span>
                  )}
                  {inv.paidTx && (
                    <a href={explorerTx(inv.paidTx)} target="_blank" rel="noreferrer"
                      className="flex items-center gap-1 text-xs" style={{ color: 'var(--success)' }}>
                      <ExternalLink size={10} /> View tx
                    </a>
                  )}
                </div>
              </div>
            )
          })}
        </div>
        {invoices.length > 5 && (
          <>
            <Divider />
            <p className="text-xs text-center pt-2" style={{ color: 'var(--subtle)' }}>
              Showing 5 of {invoices.length} invoices — see all on the <a href="/invoice" style={{ color: 'var(--accent)' }}>Invoices page</a>
            </p>
          </>
        )}
      </Card>

      {/* Export hint */}
      <div className="flex items-center gap-2 px-1">
        <Download size={13} style={{ color: 'var(--subtle)' }} />
        <p className="text-xs" style={{ color: 'var(--subtle)' }}>
          Download individual invoice PDFs from the <a href="/invoice" style={{ color: 'var(--accent)' }}>Invoices page</a>.
        </p>
      </div>
    </div>
  )
}
