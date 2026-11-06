/**
 * Dashboard summary of your open escrows on Arc Mainnet: what you have locked, what you can still
 * collect, and what needs your action.
 */
import { Link } from 'react-router-dom'
import { zeroAddress } from 'viem'
import { GlowCard } from '../ui'
import { useEscrows } from './useEscrows'
import { symbolForAddress, TOKENS } from '../../tokens'
import { ARC_CHAIN_ID } from '../../constants'
import { formatToken } from '../../utils'

export default function EscrowSummary({ address }: { address: `0x${string}` }) {
  const { escrows, isLoading } = useEscrows(address)
  const me = address.toLowerCase()

  if (isLoading) {
    return <div className="w-full rounded-2xl animate-pulse" style={{ height: 80, background: 'var(--surface)' }} />
  }
  if (escrows.length === 0) {
    return (
      <GlowCard accentColor="var(--split-accent)" className="p-4">
        <p className="text-xs text-center py-2" style={{ color: 'var(--subtle)' }}>
          No escrows on Arc Mainnet.{' '}
          <Link to="/escrow" className="underline" style={{ color: 'var(--split-accent)' }}>Create one →</Link>
        </p>
      </GlowCard>
    )
  }

  // Per-token totals so USDC and EURC are never added together.
  const locked: Record<string, bigint> = {}
  const incoming: Record<string, bigint> = {}
  let needsAction = 0

  for (const e of escrows) {
    const symbol = symbolForAddress(e.token, ARC_CHAIN_ID)
    if (!symbol) continue
    for (const m of e.milestones) {
      const open = m.status === 'Funded' || m.status === 'Submitted' || m.status === 'Disputed'
      if (!open) continue
      if (e.payer.toLowerCase() === me) {
        locked[symbol] = (locked[symbol] ?? 0n) + m.amount
        if (m.status === 'Submitted') needsAction++
      }
      if (e.payee.toLowerCase() === me) incoming[symbol] = (incoming[symbol] ?? 0n) + m.amount
      if (e.arbiter !== zeroAddress && e.arbiter.toLowerCase() === me && m.status === 'Disputed') needsAction++
    }
  }

  const line = (label: string, totals: Record<string, bigint>) => {
    const parts = Object.entries(totals).map(([sym, v]) => `${formatToken(v, TOKENS[sym as 'USDC' | 'EURC'].decimals)} ${sym}`)
    if (parts.length === 0) return null
    return (
      <div className="flex items-center justify-between py-2.5 border-b last:border-b-0" style={{ borderColor: 'var(--border)' }}>
        <span className="text-xs font-medium" style={{ color: 'var(--ink)' }}>{label}</span>
        <span className="text-sm font-semibold tabular-nums" style={{ color: 'var(--ink)' }}>{parts.join(' · ')}</span>
      </div>
    )
  }

  return (
    <GlowCard accentColor="var(--split-accent)" className="p-4">
      {line('You have locked', locked)}
      {line('You can still receive', incoming)}
      <div className="flex items-center justify-between pt-2.5">
        <span className="text-xs" style={{ color: needsAction > 0 ? 'var(--warning)' : 'var(--subtle)' }}>
          {needsAction > 0 ? `${needsAction} milestone${needsAction !== 1 ? 's' : ''} need your action` : `${escrows.length} escrow${escrows.length !== 1 ? 's' : ''}`}
        </span>
        <Link to="/escrow" className="text-xs underline" style={{ color: 'var(--split-accent)' }}>Open →</Link>
      </div>
    </GlowCard>
  )
}
