/**
 * "Needs attention": leave requests waiting on you, balances ready to withdraw,
 * and payouts waiting on the vault. Empty means nothing needs doing.
 */
import { BellRing, CheckCircle2 } from 'lucide-react'
import { Card, Label } from '../ui'
import { formatUsdc } from '../../utils'
import { VESTING_STREAM_V2_YIELD_ABI as VESTING_ABI } from '../../abisV2Yield'
import { LeaveRequestRow } from './LeaveRequests'
import PendingBanner from './PendingBanner'
import { useTx, sameAddr } from './shared'
import type { ConsoleStream, PendingLeave } from './consoleData'

export type Role = 'paying' | 'receiving'

export function inRole(s: ConsoleStream, wallet: string, role: Role): boolean {
  return role === 'paying' ? sameAddr(s.stream.grantor, wallet) : sameAddr(s.stream.beneficiary, wallet)
}

function UnwindRow({ s, chainId, nameOf, onDone }: { s: ConsoleStream; chainId: number; nameOf: (a: string) => string; onDone: () => void }) {
  const tx = useTx(chainId, 'Payout retried', onDone)
  const owed = s.yieldInfo?.debt ?? 0n
  return (
    <div className="flex items-center justify-between gap-3 rounded-xl px-4 py-3" style={{ background: 'var(--surface-muted)', border: '1px solid var(--border)' }}>
      <div className="min-w-0">
        <p className="text-sm font-medium" style={{ color: 'var(--ink)' }}>Stream #{s.id.toString()} · {nameOf(s.stream.beneficiary)}</p>
        <p className="text-xs text-pretty" style={{ color: 'var(--subtle)' }}>
          Cancelled, but the vault could not pay everything out yet{owed > 0n ? ` (${formatUsdc(owed)} USDC owed to the payee)` : ''}.
        </p>
      </div>
      <button disabled={tx.busy} onClick={() => tx.send({ address: s.contract, abi: VESTING_ABI, functionName: 'unwind', args: [s.id], chainId })}
              className="px-3.5 py-2 rounded-xl text-xs font-semibold shrink-0 disabled:opacity-50"
              style={{ background: 'var(--accent-muted)', color: 'var(--accent)' }}>
        {tx.busy ? 'Working…' : 'Retry payout'}
      </button>
    </div>
  )
}

export default function Inbox({ wallet, role, chainId, streams, pendingLeaves, pendingWithdrawals, plainAddress, yieldAddress, nameOf, onDone }: {
  wallet: `0x${string}`
  role: Role
  chainId: number
  streams: ConsoleStream[]
  pendingLeaves: PendingLeave[]
  pendingWithdrawals: { plain: bigint; yielding: bigint }
  plainAddress: `0x${string}`
  yieldAddress?: `0x${string}`
  nameOf: (a: string) => string
  onDone: () => void
}) {
  const leaves = pendingLeaves.filter(l => inRole(l.stream, wallet, role))
  const waitingOnVault = streams.filter(s =>
    s.stream.cancelled && s.yieldInfo?.useYield && (s.yieldInfo.shares > 0n || s.yieldInfo.debt > 0n || s.yieldInfo.idle > 0n))
  const hasWithdrawal = pendingWithdrawals.plain > 0n || pendingWithdrawals.yielding > 0n
  const nothing = leaves.length === 0 && waitingOnVault.length === 0 && !hasWithdrawal

  return (
    <Card className="p-5 flex flex-col gap-4">
      <div className="flex items-center gap-2">
        <BellRing size={15} style={{ color: 'var(--vest-accent)' }} />
        <Label>Needs your attention</Label>
      </div>

      {nothing && (
        <p className="flex items-center gap-2 text-sm" style={{ color: 'var(--muted)' }}>
          <CheckCircle2 size={15} style={{ color: 'var(--success)' }} /> You are all caught up.
        </p>
      )}

      <PendingBanner amount={pendingWithdrawals.plain} contract={plainAddress} chainId={chainId} label="From cancelled streams" onDone={onDone} />
      {yieldAddress && (
        <PendingBanner amount={pendingWithdrawals.yielding} contract={yieldAddress} chainId={chainId} label="From cancelled yield streams" onDone={onDone} />
      )}

      {leaves.length > 0 && (
        <div className="flex flex-col gap-3">
          <p className="text-xs" style={{ color: 'var(--subtle)' }}>
            {role === 'paying' ? 'Leave requests waiting for your approval' : 'Your pending leave requests'}
          </p>
          {leaves.map(l => (
            <div key={`${l.stream.key}-${l.requestId}`} className="flex flex-col gap-1.5">
              <p className="text-xs font-semibold" style={{ color: 'var(--ink-2)' }}>
                Stream #{l.stream.id.toString()} · {nameOf(role === 'paying' ? l.stream.stream.beneficiary : l.stream.stream.grantor)}
              </p>
              <LeaveRequestRow chainId={chainId} vestingAddress={l.stream.contract} requestId={l.requestId} req={l.req}
                               isGrantor={sameAddr(l.stream.stream.grantor, wallet)} isBeneficiary={sameAddr(l.stream.stream.beneficiary, wallet)}
                               streamCancelled={l.stream.stream.cancelled} onDone={onDone} />
            </div>
          ))}
        </div>
      )}

      {waitingOnVault.map(s => <UnwindRow key={s.key} s={s} chainId={chainId} nameOf={nameOf} onDone={onDone} />)}
    </Card>
  )
}
