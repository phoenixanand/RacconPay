/**
 * Approval requests (MultiSigPayout v2, per-proposal co-signer model). Shown as the Approvals tab on the Payouts page.
 *
 * A request names two co-signers. Both must approve before the proposer executes.
 * Requests are created on the Payouts page by choosing "Require approval".
 */
import { useState, useEffect, useRef, useCallback } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useReadContract, useReadContracts, useWriteContract, useWaitForTransactionReceipt } from 'wagmi'
import { toast } from 'sonner'
import {
  Users, ShieldCheck, CheckCircle2, Clock, XCircle,
  ChevronDown, ChevronUp, Send, Play, Ban,
  Copy, Link2,
} from 'lucide-react'
import {
  Card, PrimaryButton, GhostButton,
  Badge, TxStatus, AlertBox, StatCard,
} from './ui'
import { Select } from './kit/Fields'
import { StatusBadge, type Status } from './kit/StatusBadge'
import { friendlyTxError } from '../lib/txError'
import { useRecordTx } from '../lib/txlog'
import { MULTISIG_ADDRESS, USDC_ADDRESS, BATCH_PAYOUT_ADDRESS, explorerTx, explorerAddr } from '../constants'
import { MULTISIG_ABI, ERC20_ABI } from '../abis'
import { formatUsdc, shortAddr } from '../utils'

/* ── Types ─────────────────────────────────────────────── */
interface ProposalData {
  id: bigint
  proposer: string
  coSigner1: string
  coSigner2: string
  approved1: boolean
  approved2: boolean
  totalAmount: bigint
  recipientCount: bigint
  status: number   // 0=Pending 1=Executed 2=Cancelled
  description: string
  createdAt: bigint
  expired: boolean
}


/* ── Helpers ────────────────────────────────────────────── */
const EXPIRY_MS = 7 * 24 * 60 * 60 * 1000

function formatTimeLeft(diff: number): string {
  if (diff <= 0) return 'Expired'
  const totalMins = Math.floor(diff / 60000)
  if (totalMins < 60) return `${totalMins}m left`
  const h = Math.floor(diff / 3600000)
  if (h < 24) return `${h}h ${Math.floor((diff % 3600000) / 60000)}m left`
  const d = Math.floor(h / 24)
  const remH = h % 24
  return remH > 0 ? `${d}d ${remH}h left` : `${d}d left`
}

/** Live-updating expiry countdown, re-renders every minute while pending. */
function ExpiryCountdown({ createdAt, expired }: { createdAt: bigint; expired: boolean }) {
  const expiresAtMs = Number(createdAt) * 1000 + EXPIRY_MS

  // Capture diff once on mount; interval keeps it fresh, avoids Date.now() in render body
  const [diff, setDiff] = useState<number>(() => expiresAtMs - Date.now())

  useEffect(() => {
    if (expired || diff <= 0) return
    const tick = () => setDiff(expiresAtMs - Date.now())
    const intervalMs = diff < 10 * 60000 ? 10000 : 60000
    const id = setInterval(tick, intervalMs)
    return () => clearInterval(id)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [createdAt, expired, expiresAtMs])

  const isExpired = expired || diff <= 0
  const isUrgent  = !isExpired && diff < 24 * 3600000
  const label     = formatTimeLeft(diff)

  return (
    <span className="text-xs font-medium flex items-center gap-1"
      style={{ color: isExpired ? 'var(--danger)' : isUrgent ? 'var(--warning)' : 'var(--muted)' }}>
      <Clock size={12} /> {label}
    </span>
  )
}

/* ── Co-signer approval row ──────────────────────────────── */
function ApprovalRow({
  approved1, approved2,
  coSigner1, coSigner2,
  connectedAddr,
}: {
  approved1: boolean; approved2: boolean
  coSigner1: string; coSigner2: string
  connectedAddr: string
}) {
  const both = approved1 && approved2
  const addr = connectedAddr.toLowerCase()

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center gap-3 flex-wrap">
        {/* Co-signer 1 */}
        <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg"
          style={{ background: approved1 ? 'color-mix(in srgb, var(--success) 10%, transparent)' : 'var(--surface-strong)', border: `1px solid ${approved1 ? 'var(--success)' : 'var(--border)'}` }}>
          <div className="w-5 h-5 rounded-full flex items-center justify-center shrink-0"
            style={{ background: approved1 ? 'var(--success)' : 'var(--surface-muted)' }}>
            {approved1
              ? <CheckCircle2 size={12} color="#fff" />
              : <span className="text-[10px] font-bold" style={{ color: 'var(--muted)' }}>1</span>}
          </div>
          <span className="text-xs font-mono" style={{ color: approved1 ? 'var(--success)' : 'var(--muted)' }}>
            {shortAddr(coSigner1)}
            {coSigner1.toLowerCase() === addr && <span className="ml-1 font-sans font-semibold">(you)</span>}
          </span>
          <span className="text-[10px] font-semibold" style={{ color: approved1 ? 'var(--success)' : 'var(--muted)' }}>
            {approved1 ? 'Approved' : 'Pending'}
          </span>
        </div>

        {/* Co-signer 2 */}
        <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg"
          style={{ background: approved2 ? 'color-mix(in srgb, var(--success) 10%, transparent)' : 'var(--surface-strong)', border: `1px solid ${approved2 ? 'var(--success)' : 'var(--border)'}` }}>
          <div className="w-5 h-5 rounded-full flex items-center justify-center shrink-0"
            style={{ background: approved2 ? 'var(--success)' : 'var(--surface-muted)' }}>
            {approved2
              ? <CheckCircle2 size={12} color="#fff" />
              : <span className="text-[10px] font-bold" style={{ color: 'var(--muted)' }}>2</span>}
          </div>
          <span className="text-xs font-mono" style={{ color: approved2 ? 'var(--success)' : 'var(--muted)' }}>
            {shortAddr(coSigner2)}
            {coSigner2.toLowerCase() === addr && <span className="ml-1 font-sans font-semibold">(you)</span>}
          </span>
          <span className="text-[10px] font-semibold" style={{ color: approved2 ? 'var(--success)' : 'var(--muted)' }}>
            {approved2 ? 'Approved' : 'Pending'}
          </span>
        </div>

        {both && (
          <span className="text-xs font-bold px-2 py-1 rounded-full"
            style={{ background: 'color-mix(in srgb, var(--success) 15%, transparent)', color: 'var(--success)' }}>
            ✓ Ready to execute
          </span>
        )}
      </div>

      {/* Approval progress bar */}
      <div className="h-1.5 rounded-full overflow-hidden" style={{ background: 'var(--surface-strong)' }}>
        <div
          className="h-full rounded-full transition-all duration-500"
          style={{
            width: `${(Number(approved1) + Number(approved2)) * 50}%`,
            background: both ? 'var(--success)' : 'var(--accent)',
          }}
        />
      </div>
      <p className="text-xs" style={{ color: 'var(--muted)' }}>
        {Number(approved1) + Number(approved2)}/2 approvals
      </p>
    </div>
  )
}

/* ── Recipient list (lazy-loaded per proposal) ──────────── */
function RecipientList({ proposalId, recipientCount }: { proposalId: bigint; recipientCount: bigint }) {
  const count = Number(recipientCount)

  const contracts = Array.from({ length: count }, (_, i) => ({
    address: MULTISIG_ADDRESS,
    abi: MULTISIG_ABI,
    functionName: 'getRecipient' as const,
    args: [proposalId, BigInt(i)] as [bigint, bigint],
  }))

  const { data, isLoading } = useReadContracts({ contracts, query: { enabled: count > 0 } })

  if (isLoading) {
    return (
      <div className="space-y-2">
        {Array.from({ length: Math.min(count, 3) }).map((_, i) => (
          <div key={i} className="h-8 rounded-lg animate-pulse" style={{ background: 'var(--surface-strong)' }} />
        ))}
      </div>
    )
  }

  const rows = (data ?? []).map((r, i) => {
    if (r.status !== 'success') return null
    const [addr, amount] = r.result as [string, bigint]
    return { i, addr, amount }
  }).filter(Boolean) as { i: number; addr: string; amount: bigint }[]

  return (
    <div className="rounded-xl overflow-hidden" style={{ border: '1px solid var(--border)' }}>
      {/* Header */}
      <div className="grid grid-cols-[1fr_auto] px-3 py-2 text-[11px] font-semibold uppercase tracking-widest"
        style={{ background: 'var(--surface-strong)', color: 'var(--muted)' }}>
        <span>Recipient</span>
        <span>Amount</span>
      </div>
      {/* Rows */}
      <div className="divide-y" style={{ borderColor: 'var(--border)' }}>
        {rows.map(({ i, addr, amount }) => (
          <div key={i} className="grid grid-cols-[1fr_auto] items-center px-3 py-2.5 gap-3">
            <a href={explorerAddr(addr)} target="_blank" rel="noreferrer"
               className="font-mono text-xs hover:underline truncate"
               style={{ color: 'var(--ink-2)' }}>
              {addr}
            </a>
            <span className="font-mono text-sm font-semibold shrink-0" style={{ color: 'var(--accent)' }}>
              {formatUsdc(amount)} <span className="text-xs font-sans font-normal" style={{ color: 'var(--muted)' }}>USDC</span>
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}

/* ── Share link helper ───────────────────────────────────── */
function CopyShareLink({ proposalId }: { proposalId: bigint }) {
  const [copied, setCopied] = useState(false)

  function handleCopy() {
    const url = `${window.location.origin}/pay?tab=approvals&proposal=${String(proposalId)}`
    void navigator.clipboard.writeText(url).then(() => {
      setCopied(true)
      toast.success('Invite link copied!')
      setTimeout(() => setCopied(false), 2000)
    })
  }

  return (
    <button
      onClick={handleCopy}
      className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg font-medium transition-all"
      style={{
        background: copied ? 'color-mix(in srgb, var(--success) 10%, transparent)' : 'var(--surface-strong)',
        color: copied ? 'var(--success)' : 'var(--accent)',
        border: `1px solid ${copied ? 'var(--success)' : 'var(--border)'}`,
      }}
    >
      {copied ? <CheckCircle2 size={12} /> : <Link2 size={12} />}
      {copied ? 'Copied!' : 'Copy invite link'}
    </button>
  )
}

/* ── Proposal card ──────────────────────────────────────── */
function ProposalCard({
  p, connectedAddr, onRefresh, highlighted,
}: {
  p: ProposalData; connectedAddr: string; onRefresh: () => void; highlighted?: boolean
}) {
  const cardRef = useRef<HTMLDivElement>(null)
  const [expanded, setExpanded] = useState(highlighted ?? false)

  // Scroll highlighted card into view on mount
  useEffect(() => {
    if (highlighted && cardRef.current) {
      cardRef.current.scrollIntoView({ behavior: 'smooth', block: 'center' })
    }
  }, [highlighted])

  const [approveTx, setApproveTx] = useState<`0x${string}` | undefined>()
  const [executeTx, setExecuteTx] = useState<`0x${string}` | undefined>()
  const [cancelTx,  setCancelTx]  = useState<`0x${string}` | undefined>()
  const [rejectTx,  setRejectTx]  = useState<`0x${string}` | undefined>()

  const addr = connectedAddr.toLowerCase()
  const isProposer    = p.proposer.toLowerCase()  === addr
  const isCoSigner1   = p.coSigner1.toLowerCase() === addr
  const isCoSigner2   = p.coSigner2.toLowerCase() === addr
  const isParticipant = isProposer || isCoSigner1 || isCoSigner2
  const isPending     = p.status === 0
  const canApprove    = isPending && !p.expired &&
    ((isCoSigner1 && !p.approved1) || (isCoSigner2 && !p.approved2))
  const canExecute    = isPending && !p.expired && p.approved1 && p.approved2 && isProposer
  const canReject     = isPending && !p.expired && (isCoSigner1 || isCoSigner2)
  const canCancel     = isPending && (isProposer || p.expired)

  const { writeContractAsync } = useWriteContract()
  const [signing, setSigning] = useState(false)

  const { data: allowance, refetch: refetchAllowance } = useReadContract({
    address: USDC_ADDRESS,
    abi: ERC20_ABI,
    functionName: 'allowance',
    args: [connectedAddr as `0x${string}`, MULTISIG_ADDRESS],
    query: { enabled: canExecute && !!connectedAddr },
  })
  const needsApprove = canExecute && (allowance === undefined || allowance < p.totalAmount)

  const { isSuccess: approveConfirmed } = useWaitForTransactionReceipt({ hash: approveTx })
  const approveConfirmedRef = useRef(false)
  useEffect(() => {
    if (approveConfirmed && !approveConfirmedRef.current) {
      approveConfirmedRef.current = true
      toast.success('Approval recorded on-chain')
      onRefresh()
    }
  }, [approveConfirmed, onRefresh])

  const { isSuccess: executeConfirmed } = useWaitForTransactionReceipt({ hash: executeTx })
  const executeConfirmedRef = useRef(false)
  useEffect(() => {
    if (executeConfirmed && !executeConfirmedRef.current) {
      executeConfirmedRef.current = true
      toast.success('Payout executed!')
      onRefresh()
    }
  }, [executeConfirmed, onRefresh])

  const { isSuccess: cancelConfirmed } = useWaitForTransactionReceipt({ hash: cancelTx })
  const cancelConfirmedRef = useRef(false)
  useEffect(() => {
    if (cancelConfirmed && !cancelConfirmedRef.current) {
      cancelConfirmedRef.current = true
      toast.success('Proposal cancelled')
      onRefresh()
    }
  }, [cancelConfirmed, onRefresh])

  const { isSuccess: rejectConfirmed } = useWaitForTransactionReceipt({ hash: rejectTx })
  const rejectConfirmedRef = useRef(false)
  useEffect(() => {
    if (rejectConfirmed && !rejectConfirmedRef.current) {
      rejectConfirmedRef.current = true
      toast.success('Proposal rejected')
      onRefresh()
    }
  }, [rejectConfirmed, onRefresh])

  useRecordTx({ address: connectedAddr, hash: approveTx, confirmed: approveConfirmed, kind: 'Approval', detail: `Approved proposal #${p.id.toString()}` })
  useRecordTx({ address: connectedAddr, hash: executeTx, confirmed: executeConfirmed, kind: 'Approval', detail: `Executed proposal #${p.id.toString()}`, amountRaw: p.totalAmount, token: 'USDC' })
  useRecordTx({ address: connectedAddr, hash: cancelTx, confirmed: cancelConfirmed, kind: 'Approval', detail: `Cancelled proposal #${p.id.toString()}` })
  useRecordTx({ address: connectedAddr, hash: rejectTx, confirmed: rejectConfirmed, kind: 'Approval', detail: `Rejected proposal #${p.id.toString()}` })

  async function handleApprove() {
    try {
      setSigning(true)
      const hash = await writeContractAsync({
        address: MULTISIG_ADDRESS, abi: MULTISIG_ABI, functionName: 'approve', args: [p.id],
      })
      setSigning(false)
      setApproveTx(hash)
      toast.info('Approval submitted…')
    } catch (e: unknown) { setSigning(false); toast.error(friendlyTxError(e)) }
  }

  async function handleApprovePull() {
    try {
      setSigning(true)
      await writeContractAsync({
        address: USDC_ADDRESS, abi: ERC20_ABI, functionName: 'approve',
        args: [MULTISIG_ADDRESS, p.totalAmount],
      })
      setSigning(false)
      toast.info('Approving USDC…')
      const interval = setInterval(() => { void refetchAllowance() }, 2000)
      setTimeout(() => clearInterval(interval), 30000)
    } catch (e: unknown) { setSigning(false); toast.error(friendlyTxError(e)) }
  }

  async function handleExecute() {
    try {
      setSigning(true)
      const hash = await writeContractAsync({
        address: MULTISIG_ADDRESS, abi: MULTISIG_ABI, functionName: 'execute', args: [p.id],
      })
      setSigning(false)
      setExecuteTx(hash)
      toast.info('Executing payout…')
    } catch (e: unknown) { setSigning(false); toast.error(friendlyTxError(e)) }
  }

  async function handleCancel() {
    try {
      setSigning(true)
      const hash = await writeContractAsync({
        address: MULTISIG_ADDRESS, abi: MULTISIG_ABI, functionName: 'cancel', args: [p.id],
      })
      setSigning(false)
      setCancelTx(hash)
      toast.info('Cancelling proposal…')
    } catch (e: unknown) { setSigning(false); toast.error(friendlyTxError(e)) }
  }

  async function handleReject() {
    try {
      setSigning(true)
      const hash = await writeContractAsync({
        address: MULTISIG_ADDRESS, abi: MULTISIG_ABI, functionName: 'reject', args: [p.id],
      })
      setSigning(false)
      setRejectTx(hash)
      toast.info('Rejecting proposal…')
    } catch (e: unknown) { setSigning(false); toast.error(friendlyTxError(e)) }
  }

  const badgeStatus: Status = p.expired && p.status === 0 ? 'expired' : (['pending', 'executed', 'cancelled'] as const)[p.status] ?? 'pending'

  return (
    <div ref={cardRef} className="rounded-xl overflow-hidden transition-shadow" style={{
      border: `1px solid ${highlighted ? 'var(--accent)' : 'var(--border)'}`,
      background: 'var(--surface)',
      boxShadow: highlighted ? '0 0 0 3px var(--accent-glow)' : undefined,
    }}>
      {/* Card header, colored top strip */}
      <div className="px-5 py-4" style={{ borderBottom: '1px solid var(--border)' }}>
        <div className="flex items-start justify-between gap-3">
          {/* Left: id + badges */}
          <div className="flex flex-wrap items-center gap-2 min-w-0">
            <span className="font-mono font-bold text-base" style={{ color: 'var(--accent)' }}>
              #{String(p.id)}
            </span>
            <StatusBadge status={badgeStatus} />
            {isProposer   && <Badge variant="default">You proposed</Badge>}
            {isCoSigner1  && <Badge variant="default">Co-signer 1</Badge>}
            {isCoSigner2  && <Badge variant="default">Co-signer 2</Badge>}
          </div>
          {/* Right: expiry countdown + chevron */}
          <div className="flex items-center gap-3 shrink-0">
            <ExpiryCountdown createdAt={p.createdAt} expired={p.expired} />
            <button
              onClick={() => setExpanded(v => !v)}
              className="w-11 h-11 -mr-2 rounded-lg flex items-center justify-center transition-colors hover:bg-[var(--surface-hover)]"
              style={{ color: 'var(--muted)' }}
              aria-label={expanded ? 'Hide proposal details' : 'Show proposal details'}
              aria-expanded={expanded}
            >
              {expanded ? <ChevronUp size={16} aria-hidden="true" /> : <ChevronDown size={16} aria-hidden="true" />}
            </button>
          </div>
        </div>

        {/* Description */}
        <p className="mt-2 font-medium" style={{ color: 'var(--ink)' }}>
          {p.description || <span style={{ color: 'var(--muted)' }}>No description</span>}
        </p>

        {/* Rejected banner, shown to proposer when a co-signer rejected */}
        {isProposer && p.status === 2 && (
          <div className="mt-3 flex items-center gap-2 rounded-xl px-3 py-2.5 text-sm"
               style={{ background: 'var(--danger-muted)', border: '1px solid color-mix(in srgb, var(--danger) 25%, transparent)', color: 'var(--danger)' }}>
            <XCircle size={14} className="shrink-0" />
            <span>This proposal was rejected by a co-signer and has been cancelled.</span>
          </div>
        )}
      </div>

      {/* Stats row */}
      <div className="px-5 py-3 flex flex-wrap gap-6" style={{ borderBottom: '1px solid var(--border)', background: 'var(--surface-muted)' }}>
        <div>
          <p className="text-[11px] uppercase tracking-widest font-semibold mb-0.5" style={{ color: 'var(--muted)' }}>Requested amount</p>
          <p className="font-bold font-mono" style={{ color: 'var(--ink)' }}>{formatUsdc(p.totalAmount)} <span className="text-xs font-sans font-normal" style={{ color: 'var(--muted)' }}>USDC</span></p>
        </div>
        <div>
          <p className="text-[11px] uppercase tracking-widest font-semibold mb-0.5" style={{ color: 'var(--muted)' }}>Recipients</p>
          <p className="font-bold" style={{ color: 'var(--ink)' }}>{String(p.recipientCount)}</p>
        </div>
        <div>
          <p className="text-[11px] uppercase tracking-widest font-semibold mb-0.5" style={{ color: 'var(--muted)' }}>Requested by</p>
          <a href={explorerAddr(p.proposer)} target="_blank" rel="noreferrer"
             className="font-mono text-sm hover:underline"
             style={{ color: isProposer ? 'var(--accent)' : 'var(--ink-2)' }}>
            {shortAddr(p.proposer)}{isProposer && ' (you)'}
          </a>
        </div>
      </div>

      {/* Approval row */}
      <div className="px-5 py-4" style={{ borderBottom: expanded ? '1px solid var(--border)' : 'none' }}>
        <ApprovalRow
          approved1={p.approved1} approved2={p.approved2}
          coSigner1={p.coSigner1} coSigner2={p.coSigner2}
          connectedAddr={connectedAddr}
        />
      </div>

      {/* Expanded detail */}
      {expanded && (
        <div className="px-5 py-4 space-y-5" style={{ borderBottom: '1px solid var(--border)' }}>
          {/* Participants */}
          <div>
            <p className="text-[11px] uppercase tracking-widest font-semibold mb-2" style={{ color: 'var(--muted)' }}>Participants</p>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              {([
                ['Proposer',    p.proposer,  isProposer],
                ['Co-signer 1', p.coSigner1, isCoSigner1],
                ['Co-signer 2', p.coSigner2, isCoSigner2],
              ] as [string, string, boolean][]).map(([lbl, val, highlight]) => (
                <div key={lbl} className="p-3 rounded-xl" style={{ background: 'var(--surface-strong)' }}>
                  <p className="text-[11px] uppercase tracking-widest font-semibold mb-1" style={{ color: 'var(--muted)' }}>{lbl}</p>
                  <a href={explorerAddr(val)} target="_blank" rel="noreferrer"
                     className="font-mono text-xs break-all hover:underline"
                     style={{ color: highlight ? 'var(--accent)' : 'var(--ink-2)' }}>
                    {val}
                  </a>
                  {highlight && <p className="text-xs font-semibold mt-1" style={{ color: 'var(--accent)' }}>You</p>}
                </div>
              ))}
            </div>
          </div>

          {/* Recipients */}
          <div>
            <p className="text-[11px] uppercase tracking-widest font-semibold mb-2" style={{ color: 'var(--muted)' }}>
              Recipients ({String(p.recipientCount)})
            </p>
            <RecipientList proposalId={p.id} recipientCount={p.recipientCount} />
          </div>

          {/* Share link */}
          <div className="flex items-center gap-3 pt-1">
            <span className="text-xs" style={{ color: 'var(--muted)' }}>
              <Copy size={11} className="inline mr-1" />
              Share with co-signers:
            </span>
            <CopyShareLink proposalId={p.id} />
          </div>
        </div>
      )}

      {/* Action buttons */}
      {isParticipant && isPending && (
        <div className="px-5 py-4 flex flex-wrap items-center gap-2">
          {!canApprove && !canExecute && !canReject && !canCancel && (
            <p className="text-sm" style={{ color: 'var(--muted)' }}>Nothing for you to do on this proposal right now.</p>
          )}
          {canApprove && (
            <PrimaryButton onClick={() => { void handleApprove() }} loading={!!approveTx && !approveConfirmed}>
              <ShieldCheck size={15} /> Approve Proposal
            </PrimaryButton>
          )}
          {canReject && (
            <GhostButton onClick={() => { void handleReject() }} disabled={!!rejectTx && !rejectConfirmed}>
              <XCircle size={15} /> Reject
            </GhostButton>
          )}
          {canExecute && needsApprove && (
            <PrimaryButton onClick={() => { void handleApprovePull() }}>
              Approve USDC First
            </PrimaryButton>
          )}
          {canExecute && !needsApprove && (
            <PrimaryButton onClick={() => { void handleExecute() }} loading={!!executeTx && !executeConfirmed}>
              <Play size={15} /> Execute Payout
            </PrimaryButton>
          )}
          {canCancel && (
            <GhostButton onClick={() => { void handleCancel() }} disabled={!!cancelTx && !cancelConfirmed}>
              <Ban size={15} /> Cancel
            </GhostButton>
          )}
        </div>
      )}

      {/* Tx status */}
      {(signing || approveTx || executeTx || cancelTx || rejectTx) && (
        <div className="px-5 pb-4 space-y-2" aria-live="polite">
          {signing && <TxStatus isPending />}
          {approveTx && (
            <TxStatus hash={approveTx} isConfirming={!approveConfirmed} isSuccess={approveConfirmed} explorerUrl={explorerTx} className="mt-0" />
          )}
          {executeTx && (
            <TxStatus hash={executeTx} isConfirming={!executeConfirmed} isSuccess={executeConfirmed} explorerUrl={explorerTx} className="mt-0" />
          )}
          {cancelTx && (
            <TxStatus hash={cancelTx} isConfirming={!cancelConfirmed} isSuccess={cancelConfirmed} explorerUrl={explorerTx} className="mt-0" />
          )}
          {rejectTx && (
            <TxStatus hash={rejectTx} isConfirming={!rejectConfirmed} isSuccess={rejectConfirmed} explorerUrl={explorerTx} className="mt-0" />
          )}
        </div>
      )}
    </div>
  )
}

/* ── Proposals list ──────────────────────────────────────── */
function ProposalsList({ connectedAddr, refreshKey }: { connectedAddr: string; refreshKey: number }) {
  const [searchParams] = useSearchParams()
  const highlightId = searchParams.get('proposal') ? BigInt(searchParams.get('proposal')!) : null

  const [proposals, setProposals] = useState<ProposalData[]>([])
  const [loaded,    setLoaded]    = useState(false)
  const [refresh,   setRefresh]   = useState(0)
  const [filter, setFilter] = useState<'all' | 'action' | 'pending' | 'executed' | 'closed'>('all')

  const { data: countData } = useReadContract({
    address: MULTISIG_ADDRESS, abi: MULTISIG_ABI, functionName: 'proposalCount',
  })
  const count = countData ? Number(countData) : 0

  const loadProposals = useCallback(async (n: number): Promise<ProposalData[]> => {
    if (n === 0) return []
    const rpcUrl = 'https://rpc.mainnet.arc.io'
    const { createPublicClient, http, defineChain } = await import('viem')
    const arcMainnet = defineChain({
      id: 5042, name: 'Arc Mainnet',
      nativeCurrency: { name: 'USDC', symbol: 'USDC', decimals: 6 },
      rpcUrls: { default: { http: [rpcUrl] } },
    })
    const client = createPublicClient({ chain: arcMainnet, transport: http(rpcUrl) })
    const out: ProposalData[] = []
    for (let i = n; i >= 1; i--) {
      const res = await client.readContract({
        address: MULTISIG_ADDRESS, abi: MULTISIG_ABI, functionName: 'getProposal', args: [BigInt(i)],
      }) as readonly [string, string, string, boolean, boolean, bigint, bigint, number, string, bigint, boolean]
      out.push({
        id: BigInt(i), proposer: res[0], coSigner1: res[1], coSigner2: res[2],
        approved1: res[3], approved2: res[4], totalAmount: res[5], recipientCount: res[6],
        status: res[7], description: res[8], createdAt: res[9], expired: res[10],
      })
    }
    return out
  }, [])

  useEffect(() => {
    let mounted = true
    const promise = loadProposals(count)
    promise.then(data => {
      if (mounted) { setProposals(data); setLoaded(true) }
    }).catch(() => { if (mounted) setLoaded(true) })
    return () => { mounted = false }
  }, [count, refresh, refreshKey, loadProposals])

  function handleRefresh() { setRefresh(v => v + 1) }

  if (!loaded) {
    return (
      <div className="space-y-3">
        {[1, 2].map(i => (
          <div key={i} className="h-36 rounded-2xl animate-pulse" style={{ background: 'var(--surface-strong)' }} />
        ))}
      </div>
    )
  }

  if (proposals.length === 0) {
    return (
      <Card>
        <div className="flex flex-col items-center gap-3 py-12 text-center">
          <div className="w-14 h-14 rounded-full flex items-center justify-center" style={{ background: 'var(--surface-strong)' }}>
            <Users size={28} style={{ color: 'var(--muted)' }} />
          </div>
          <div>
            <p className="font-semibold" style={{ color: 'var(--ink)' }}>No proposals yet</p>
            <p className="text-sm mt-1" style={{ color: 'var(--muted)' }}>Create one from the New payout tab by choosing Require approval.</p>
          </div>
        </div>
      </Card>
    )
  }

  const myProposals = proposals.filter(p =>
    [p.proposer, p.coSigner1, p.coSigner2].some(a => a.toLowerCase() === connectedAddr.toLowerCase())
  )

  if (myProposals.length === 0) {
    return (
      <Card>
        <div className="flex flex-col items-center gap-3 py-12 text-center">
          <div className="w-14 h-14 rounded-full flex items-center justify-center" style={{ background: 'var(--surface-strong)' }}>
            <ShieldCheck size={28} style={{ color: 'var(--muted)' }} />
          </div>
          <div>
            <p className="font-semibold" style={{ color: 'var(--ink)' }}>No proposals for your wallet</p>
            <p className="text-sm mt-1 max-w-xs" style={{ color: 'var(--muted)' }}>
              Proposals you create or are invited to co-sign will appear here. Create one from the New payout tab, or ask someone to add your wallet as a co-signer.
            </p>
          </div>
        </div>
      </Card>
    )
  }

  const me = connectedAddr.toLowerCase()
  const needsMe = (p: ProposalData) => p.status === 0 && !p.expired && (
    (p.coSigner1.toLowerCase() === me && !p.approved1) || (p.coSigner2.toLowerCase() === me && !p.approved2) ||
    (p.approved1 && p.approved2 && p.proposer.toLowerCase() === me)
  )
  const counts = {
    action: myProposals.filter(needsMe).length,
    pending: myProposals.filter(p => p.status === 0 && !p.expired).length,
    executed: myProposals.filter(p => p.status === 1).length,
  }
  const shown = myProposals.filter(p =>
    filter === 'all' ? true
      : filter === 'action' ? needsMe(p)
      : filter === 'pending' ? p.status === 0 && !p.expired
      : filter === 'executed' ? p.status === 1
      : p.status === 2 || (p.status === 0 && p.expired))

  return (
    <div className="flex flex-col gap-4">
      <section aria-label="Approval summary" className="grid grid-cols-1 min-[480px]:grid-cols-3 gap-3">
        <StatCard label="Needs your action" value={counts.action.toString()} sub="Approve, execute or review" icon={ShieldCheck} />
        <StatCard label="Pending requests" value={counts.pending.toString()} sub="Waiting for approvals" icon={Clock} />
        <StatCard label="Executed" value={counts.executed.toString()} sub="Payments sent" icon={CheckCircle2} />
      </section>
      <div className="max-w-xs">
        <Select label="Show" value={filter} onChange={v => setFilter(v as typeof filter)} options={[
          { value: 'all', label: `All requests (${myProposals.length})` },
          { value: 'action', label: `Needs your action (${counts.action})` },
          { value: 'pending', label: `Pending (${counts.pending})` },
          { value: 'executed', label: `Executed (${counts.executed})` },
          { value: 'closed', label: 'Cancelled or expired' },
        ]} />
      </div>
      {shown.length === 0
        ? <Card><p className="py-8 text-center text-sm" style={{ color: 'var(--muted)' }}>No requests match this filter.</p></Card>
        : shown.map(p => (
          <ProposalCard key={String(p.id)} p={p} connectedAddr={connectedAddr} onRefresh={handleRefresh} highlighted={highlightId === p.id} />
        ))}
    </div>
  )
}

/* ── How it works panel ──────────────────────────────────── */
function HowItWorks() {
  const steps = [
    { icon: <Send size={18} />,        title: 'Request',      desc: 'On the New payout tab, choose Require approval and name two co-signers.' },
    { icon: <ShieldCheck size={18} />, title: 'Both approve', desc: 'Both named co-signers approve on-chain. No approval = no payout.' },
    { icon: <Play size={18} />,        title: 'Execute',      desc: 'Once both co-signers approve, only the proposer can execute the payout.' },
    { icon: <Clock size={18} />,       title: 'Auto-expires', desc: 'Proposals expire after 7 days. Anyone can cancel an expired proposal.' },
  ]
  return (
    <Card>
      <p className="text-sm font-bold mb-4" style={{ color: 'var(--ink)' }}>How it works</p>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {steps.map((s, i) => (
          <div key={i} className="flex items-start gap-3 p-4 rounded-xl" style={{ background: 'var(--surface-strong)' }}>
            <div className="shrink-0 w-9 h-9 rounded-xl flex items-center justify-center"
              style={{ background: 'var(--accent)', color: '#fff' }}>
              {s.icon}
            </div>
            <div>
              <p className="text-sm font-semibold" style={{ color: 'var(--ink)' }}>{s.title}</p>
              <p className="text-xs mt-1 leading-relaxed" style={{ color: 'var(--muted)' }}>{s.desc}</p>
            </div>
          </div>
        ))}
      </div>
      <div className="mt-3 p-3 rounded-xl text-xs flex flex-wrap gap-x-4 gap-y-1" style={{ background: 'var(--surface-strong)' }}>
        <span style={{ color: 'var(--muted)' }}>
          Contract:{' '}
          <a href={explorerAddr(MULTISIG_ADDRESS)} target="_blank" rel="noreferrer"
             className="font-mono hover:underline" style={{ color: 'var(--accent)' }}>
            {shortAddr(MULTISIG_ADDRESS)}
          </a>
        </span>
        <span style={{ color: 'var(--muted)' }}>
          Routes via:{' '}
          <a href={explorerAddr(BATCH_PAYOUT_ADDRESS)} target="_blank" rel="noreferrer"
             className="font-mono hover:underline" style={{ color: 'var(--accent)' }}>
            BatchPayout {shortAddr(BATCH_PAYOUT_ADDRESS)}
          </a>
        </span>
      </div>
    </Card>
  )
}

/* ── Approvals panel (shown as a tab on the Payouts page) ── */
export function ApprovalsPanel({ connectedAddr }: { connectedAddr: string }) {
  return (
    <div className="flex flex-col gap-5">
      <AlertBox variant="info">
        Approving, rejecting, cancelling and executing a request each send a transaction, so your wallet asks you to sign. Viewing requests never needs a signature.
      </AlertBox>
      <HowItWorks />
      <ProposalsList connectedAddr={connectedAddr} refreshKey={0} />
    </div>
  )
}
