/**
 * One escrow with its milestones. Buttons shown depend on your role (payer, payee, arbiter)
 * and the live state of each milestone, so only actions the contract will accept are offered.
 */
import { useEffect, useState } from 'react'
import { useAccount, useWaitForTransactionReceipt, useWriteContract } from 'wagmi'
import { keccak256, toBytes, zeroAddress, zeroHash } from 'viem'
import { toast } from 'sonner'
import { CheckCircle2, ExternalLink } from 'lucide-react'
import { Badge, Card, GhostButton, Input, PrimaryButton, AlertBox } from '../ui'
import { ARC_CHAIN_ID, ESCROW_ADDRESS, explorerTxFor } from '../../constants'
import { ESCROW_ABI } from '../../abisEscrow'
import { symbolForAddress, TOKENS } from '../../tokens'
import { formatToken, shortAddr } from '../../utils'
import {
  DISPUTE_TIMEOUT_SECONDS, useNow,
  type EscrowView, type MilestoneView, type MilestoneStatus,
} from './useEscrows'

const STATUS_VARIANT: Record<MilestoneStatus, 'default' | 'warning' | 'success' | 'danger' | 'blue'> = {
  Funded: 'default', Submitted: 'warning', Released: 'success',
  Disputed: 'danger', Resolved: 'blue', Refunded: 'default',
}

function errorText(e: unknown): string {
  const msg = e instanceof Error ? e.message : String(e)
  if (msg.toLowerCase().includes('user rejected')) return 'Request cancelled in your wallet.'
  return msg.length > 140 ? `${msg.slice(0, 140)}…` : msg
}

const ESC = { address: ESCROW_ADDRESS, abi: ESCROW_ABI, chainId: ARC_CHAIN_ID } as const

function fmtDate(sec: bigint): string {
  return new Date(Number(sec) * 1000).toLocaleString()
}

/** Run a single escrow call and report confirmation to the parent. */
function useEscrowTx(onDone: () => void) {
  const { writeContract, data: hash, isPending, reset } = useWriteContract()
  const { isLoading: confirming, isSuccess } = useWaitForTransactionReceipt({ hash })
  const [error, setError] = useState<string | null>(null)
  useEffect(() => {
    if (!isSuccess) return
    toast.success('Transaction confirmed')
    onDone()
    reset()
  }, [isSuccess, onDone, reset])
  const run = (request: Parameters<typeof writeContract>[0]) => {
    setError(null)
    writeContract(request, { onError: e => setError(errorText(e)) })
  }
  return { run, busy: isPending || confirming, hash, error }
}

function MilestoneRow({
  escrow, m, role, now, decimals, symbol, onDone,
}: {
  escrow: EscrowView; m: MilestoneView
  role: { payer: boolean; payee: boolean; arbiter: boolean }
  now: bigint; decimals: number; symbol: string; onDone: () => void
}) {
  const tx = useEscrowTx(onDone)
  const [evidence, setEvidence] = useState('')
  const [split, setSplit] = useState('')

  const windowEnd = m.submittedAt + escrow.reviewWindow
  const hasArbiter = escrow.arbiter !== zeroAddress
  const inWindow = m.status === 'Submitted' && now < windowEnd
  const pastWindow = m.status === 'Submitted' && now >= windowEnd
  const timeoutAt = m.disputedAt + DISPUTE_TIMEOUT_SECONDS
  const idx = BigInt(m.index)

  let splitRaw: bigint | null = null
  try {
    const [w, f = ''] = split.split('.')
    splitRaw = split ? BigInt(w || '0') * 10n ** BigInt(decimals) + BigInt(f.slice(0, decimals).padEnd(decimals, '0') || '0') : null
  } catch { splitRaw = null }
  const splitValid = splitRaw !== null && splitRaw <= m.amount

  return (
    <div className="rounded-xl p-3 flex flex-col gap-2"
      style={{ background: 'var(--surface-muted)', border: '1px solid var(--border)' }}>
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div className="flex items-center gap-2">
          <span className="text-xs font-semibold tabular-nums" style={{ color: 'var(--subtle)' }}>#{m.index + 1}</span>
          <span className="font-display font-bold tabular-nums" style={{ color: 'var(--ink)' }}>
            {formatToken(m.amount, decimals)} {symbol}
          </span>
        </div>
        <Badge variant={STATUS_VARIANT[m.status]}>{m.status}</Badge>
      </div>

      {m.status === 'Submitted' && (
        <p className="text-xs" style={{ color: 'var(--muted)' }}>
          Submitted {fmtDate(m.submittedAt)}.{' '}
          {inWindow ? `Review window ends ${fmtDate(windowEnd)}.` : 'Review window has ended.'}
        </p>
      )}
      {m.status === 'Disputed' && (
        <p className="text-xs" style={{ color: 'var(--muted)' }}>
          Disputed {fmtDate(m.disputedAt)}.{' '}
          {now >= timeoutAt ? 'Arbiter timeout reached: anyone can split 50/50.' : `If unresolved, anyone can split 50/50 after ${fmtDate(timeoutAt)}.`}
        </p>
      )}

      {/* Payee: submit */}
      {m.status === 'Funded' && role.payee && !escrow.cancelled && (
        <div className="flex flex-col gap-2">
          <Input value={evidence} onChange={setEvidence} placeholder="Link or note for your work (optional)" />
          <PrimaryButton
            onClick={() => tx.run({ ...ESC, functionName: 'submitMilestone', args: [escrow.id, idx, evidence.trim() ? keccak256(toBytes(evidence.trim())) : zeroHash] })}
            loading={tx.busy}
          >
            Submit milestone
          </PrimaryButton>
        </div>
      )}

      {/* Payer: approve / dispute */}
      {m.status === 'Submitted' && role.payer && (
        <div className="flex gap-2 flex-wrap">
          <PrimaryButton onClick={() => tx.run({ ...ESC, functionName: 'approveMilestone', args: [escrow.id, idx] })} loading={tx.busy} className="flex-1">
            Approve and release
          </PrimaryButton>
          {inWindow && hasArbiter && (
            <GhostButton onClick={() => tx.run({ ...ESC, functionName: 'dispute', args: [escrow.id, idx] })} disabled={tx.busy}>Dispute</GhostButton>
          )}
        </div>
      )}

      {/* Payee: claim after window */}
      {pastWindow && role.payee && (
        <PrimaryButton onClick={() => tx.run({ ...ESC, functionName: 'claimAfterWindow', args: [escrow.id, idx] })} loading={tx.busy}>
          Collect (review window passed)
        </PrimaryButton>
      )}

      {/* Arbiter: resolve */}
      {m.status === 'Disputed' && role.arbiter && (
        <div className="flex flex-col gap-2">
          <Input
            value={split} onChange={setSplit} type="number"
            placeholder={`Amount to payee (0 to ${formatToken(m.amount, decimals)} ${symbol}); rest goes to payer`}
          />
          <PrimaryButton
            onClick={() => splitRaw !== null && tx.run({ ...ESC, functionName: 'resolve', args: [escrow.id, idx, splitRaw] })}
            disabled={!splitValid} loading={tx.busy}
          >
            Resolve dispute
          </PrimaryButton>
        </div>
      )}

      {/* Anyone: timeout split */}
      {m.status === 'Disputed' && now >= timeoutAt && (
        <GhostButton onClick={() => tx.run({ ...ESC, functionName: 'resolveByTimeout', args: [escrow.id, idx] })} disabled={tx.busy}>
          Split 50/50 (arbiter timed out)
        </GhostButton>
      )}

      {/* Payer: refund unstarted */}
      {m.status === 'Funded' && role.payer && now > escrow.deadline && (
        <GhostButton onClick={() => tx.run({ ...ESC, functionName: 'refundUnstarted', args: [escrow.id, idx] })} disabled={tx.busy}>
          Refund (deadline passed, not submitted)
        </GhostButton>
      )}

      {tx.error && <AlertBox variant="danger">{tx.error}</AlertBox>}
      {tx.hash && (
        <a href={explorerTxFor(ARC_CHAIN_ID, tx.hash)} target="_blank" rel="noreferrer"
          className="flex items-center gap-1 text-xs" style={{ color: 'var(--accent)' }}>
          <ExternalLink size={11} /> View transaction
        </a>
      )}
    </div>
  )
}

export default function EscrowCard({ escrow, onChanged }: { escrow: EscrowView; onChanged: () => void }) {
  const { address } = useAccount()
  const now = useNow()
  const cancelTx = useEscrowTx(onChanged)

  const me = address?.toLowerCase() ?? ''
  const role = {
    payer: escrow.payer.toLowerCase() === me,
    payee: escrow.payee.toLowerCase() === me,
    arbiter: escrow.arbiter.toLowerCase() === me,
  }
  const symbol = symbolForAddress(escrow.token, ARC_CHAIN_ID) ?? 'TOKEN'
  const decimals = symbol === 'TOKEN' ? 6 : TOKENS[symbol].decimals
  const total = escrow.milestones.reduce((s, m) => s + m.amount, 0n)
  const released = escrow.milestones.filter(m => m.status === 'Released').reduce((s, m) => s + m.amount, 0n)
  const hasFunded = escrow.milestones.some(m => m.status === 'Funded')
  const myConfirmed = (role.payer && escrow.payerConfirmed) || (role.payee && escrow.payeeConfirmed)
  const roleLabels = [role.payer && 'Payer', role.payee && 'Payee', role.arbiter && 'Arbiter'].filter(Boolean).join(' / ')

  return (
    <Card className="p-4 flex flex-col gap-3">
      <div className="flex items-start justify-between gap-2 flex-wrap">
        <div className="flex flex-col gap-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-mono text-xs font-bold" style={{ color: 'var(--receipt-accent)' }}>ESC-{escrow.id.toString()}</span>
            {roleLabels && <Badge variant="blue">{roleLabels}</Badge>}
            {escrow.cancelled && <Badge variant="danger">Cancelled</Badge>}
          </div>
          {escrow.memo && <p className="text-sm" style={{ color: 'var(--ink-2)' }}>{escrow.memo}</p>}
          <p className="text-xs font-mono" style={{ color: 'var(--subtle)' }}>
            Payer {shortAddr(escrow.payer)} · Payee {shortAddr(escrow.payee)} ·{' '}
            {escrow.arbiter === zeroAddress ? 'No arbiter' : `Arbiter ${shortAddr(escrow.arbiter)}`}
          </p>
        </div>
        <div className="text-right">
          <p className="font-display font-bold text-lg tabular-nums" style={{ color: 'var(--ink)' }}>
            {formatToken(total, decimals)} {symbol}
          </p>
          <p className="text-xs tabular-nums" style={{ color: 'var(--success)' }}>
            {formatToken(released, decimals)} released
          </p>
        </div>
      </div>

      <div className="flex flex-col gap-2">
        {escrow.milestones.map(m => (
          <MilestoneRow
            key={m.index} escrow={escrow} m={m} role={role} now={now}
            decimals={decimals} symbol={symbol} onDone={onChanged}
          />
        ))}
      </div>

      <p className="text-xs" style={{ color: 'var(--subtle)' }}>
        Review window {Number(escrow.reviewWindow) / 86400} days · refund deadline {fmtDate(escrow.deadline)}
      </p>

      {(role.payer || role.payee) && !escrow.cancelled && hasFunded && (
        <div className="flex flex-col gap-2">
          {myConfirmed ? (
            <p className="flex items-center gap-1.5 text-xs" style={{ color: 'var(--success)' }}>
              <CheckCircle2 size={12} /> You asked to cancel. Waiting for the other party to confirm.
            </p>
          ) : (
            <GhostButton onClick={() => cancelTx.run({ ...ESC, functionName: 'cancelByAgreement', args: [escrow.id] })} disabled={cancelTx.busy}>
              Cancel by agreement (both must confirm)
            </GhostButton>
          )}
          {cancelTx.error && <AlertBox variant="danger">{cancelTx.error}</AlertBox>}
        </div>
      )}
    </Card>
  )
}
