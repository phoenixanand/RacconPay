/**
 * MultiSigPayout v2 — per-proposal co-signer model.
 *
 * Any wallet can create a proposal naming two co-signers.
 * Both co-signers must approve before anyone executes.
 * No global signer registry.
 */
import { useState, useEffect, useRef, useCallback } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useAccount, useReadContract, useReadContracts, useWriteContract, useWaitForTransactionReceipt } from 'wagmi'
import { isAddress } from 'viem'
import { toast } from 'sonner'
import Papa from 'papaparse'
import {
  Users, ShieldCheck, CheckCircle2, Clock, XCircle,
  ChevronDown, ChevronUp, Upload, Plus, Trash2, Send, Play, Ban, AlertCircle,
  Copy, Link2,
} from 'lucide-react'
import {
  Card, PageHeader, PrimaryButton, GhostButton,
  Input, Label, Badge, TxStatus,
} from './ui'
import ChainGuard from './ChainGuard'
import { MULTISIG_ADDRESS, USDC_ADDRESS, BATCH_PAYOUT_ADDRESS, explorerTx, explorerAddr } from '../constants'
import { MULTISIG_ABI, ERC20_ABI } from '../abis'
import { formatUsdc, parseUsdc, shortAddr } from '../utils'

/* ── Types ─────────────────────────────────────────────── */
interface Recipient { addr: string; amount: string }
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

const STATUS_LABEL = ['Pending', 'Executed', 'Cancelled'] as const
const STATUS_VARIANT = ['warning', 'success', 'danger'] as const

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

/** Live-updating expiry countdown — re-renders every minute while pending. */
function ExpiryCountdown({ createdAt, expired }: { createdAt: bigint; expired: boolean }) {
  const expiresAtMs = Number(createdAt) * 1000 + EXPIRY_MS

  // Capture diff once on mount; interval keeps it fresh — avoids Date.now() in render body
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
      style={{ color: isExpired ? 'var(--error)' : isUrgent ? '#fb923c' : 'var(--muted)' }}>
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
          style={{ background: approved1 ? 'rgba(74,163,101,0.1)' : 'var(--surface-strong)', border: `1px solid ${approved1 ? 'var(--success)' : 'var(--border)'}` }}>
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
          style={{ background: approved2 ? 'rgba(74,163,101,0.1)' : 'var(--surface-strong)', border: `1px solid ${approved2 ? 'var(--success)' : 'var(--border)'}` }}>
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
            style={{ background: 'rgba(74,163,101,0.15)', color: 'var(--success)' }}>
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
    const url = `${window.location.origin}/multisig?proposal=${String(proposalId)}`
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
        background: copied ? 'rgba(74,163,101,0.1)' : 'var(--surface-strong)',
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

  async function handleApprove() {
    try {
      const hash = await writeContractAsync({
        address: MULTISIG_ADDRESS, abi: MULTISIG_ABI, functionName: 'approve', args: [p.id],
      })
      setApproveTx(hash)
      toast.info('Approval submitted…')
    } catch (e: unknown) { toast.error((e as Error).message?.slice(0, 80) || 'Approve failed') }
  }

  async function handleApprovePull() {
    try {
      await writeContractAsync({
        address: USDC_ADDRESS, abi: ERC20_ABI, functionName: 'approve',
        args: [MULTISIG_ADDRESS, p.totalAmount],
      })
      toast.info('Approving USDC…')
      const interval = setInterval(() => { void refetchAllowance() }, 2000)
      setTimeout(() => clearInterval(interval), 30000)
    } catch (e: unknown) { toast.error((e as Error).message?.slice(0, 80) || 'USDC approve failed') }
  }

  async function handleExecute() {
    try {
      const hash = await writeContractAsync({
        address: MULTISIG_ADDRESS, abi: MULTISIG_ABI, functionName: 'execute', args: [p.id],
      })
      setExecuteTx(hash)
      toast.info('Executing payout…')
    } catch (e: unknown) { toast.error((e as Error).message?.slice(0, 80) || 'Execute failed') }
  }

  async function handleCancel() {
    try {
      const hash = await writeContractAsync({
        address: MULTISIG_ADDRESS, abi: MULTISIG_ABI, functionName: 'cancel', args: [p.id],
      })
      setCancelTx(hash)
      toast.info('Cancelling proposal…')
    } catch (e: unknown) { toast.error((e as Error).message?.slice(0, 80) || 'Cancel failed') }
  }

  async function handleReject() {
    try {
      const hash = await writeContractAsync({
        address: MULTISIG_ADDRESS, abi: MULTISIG_ABI, functionName: 'reject', args: [p.id],
      })
      setRejectTx(hash)
      toast.info('Rejecting proposal…')
    } catch (e: unknown) { toast.error((e as Error).message?.slice(0, 80) || 'Reject failed') }
  }

  const statusLabel = p.expired && p.status === 0 ? 'Expired' : STATUS_LABEL[p.status]
  const statusVariant = p.expired && p.status === 0 ? 'danger' : STATUS_VARIANT[p.status]

  return (
    <div ref={cardRef} className="rounded-2xl overflow-hidden transition-shadow" style={{
      border: `1px solid ${highlighted ? 'var(--accent)' : 'var(--border)'}`,
      background: 'var(--surface)',
      boxShadow: highlighted ? '0 0 0 3px rgba(var(--accent-rgb, 180,120,60),0.15)' : undefined,
    }}>
      {/* Card header — colored top strip */}
      <div className="px-5 py-4" style={{ borderBottom: '1px solid var(--border)' }}>
        <div className="flex items-start justify-between gap-3">
          {/* Left: id + badges */}
          <div className="flex flex-wrap items-center gap-2 min-w-0">
            <span className="font-mono font-bold text-base" style={{ color: 'var(--accent)' }}>
              #{String(p.id)}
            </span>
            <Badge variant={statusVariant}>{statusLabel}</Badge>
            {isProposer   && <Badge variant="default">You proposed</Badge>}
            {isCoSigner1  && <Badge variant="default">Co-signer 1</Badge>}
            {isCoSigner2  && <Badge variant="default">Co-signer 2</Badge>}
          </div>
          {/* Right: expiry countdown + chevron */}
          <div className="flex items-center gap-3 shrink-0">
            <ExpiryCountdown createdAt={p.createdAt} expired={p.expired} />
            <button
              onClick={() => setExpanded(v => !v)}
              className="w-7 h-7 rounded-lg flex items-center justify-center transition-colors"
              style={{ background: 'var(--surface-strong)', color: 'var(--muted)' }}
              aria-label="Toggle details"
            >
              {expanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
            </button>
          </div>
        </div>

        {/* Description */}
        <p className="mt-2 font-medium" style={{ color: 'var(--ink)' }}>
          {p.description || <span style={{ color: 'var(--muted)' }}>No description</span>}
        </p>

        {/* Rejected banner — shown to proposer when a co-signer rejected */}
        {isProposer && p.status === 2 && (
          <div className="mt-3 flex items-center gap-2 rounded-xl px-3 py-2.5 text-sm"
               style={{ background: 'var(--danger-muted)', border: '1px solid rgba(232,109,122,0.25)', color: 'var(--danger)' }}>
            <XCircle size={14} className="shrink-0" />
            <span>This proposal was rejected by a co-signer and has been cancelled.</span>
          </div>
        )}
      </div>

      {/* Stats row */}
      <div className="px-5 py-3 flex flex-wrap gap-6" style={{ borderBottom: '1px solid var(--border)', background: 'var(--surface-muted)' }}>
        <div>
          <p className="text-[11px] uppercase tracking-widest font-semibold mb-0.5" style={{ color: 'var(--muted)' }}>Total</p>
          <p className="font-bold font-mono" style={{ color: 'var(--ink)' }}>{formatUsdc(p.totalAmount)} <span className="text-xs font-sans font-normal" style={{ color: 'var(--muted)' }}>USDC</span></p>
        </div>
        <div>
          <p className="text-[11px] uppercase tracking-widest font-semibold mb-0.5" style={{ color: 'var(--muted)' }}>Recipients</p>
          <p className="font-bold" style={{ color: 'var(--ink)' }}>{String(p.recipientCount)}</p>
        </div>
        <div>
          <p className="text-[11px] uppercase tracking-widest font-semibold mb-0.5" style={{ color: 'var(--muted)' }}>Proposer</p>
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
        <div className="px-5 py-4 flex flex-wrap gap-2">
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
      {(approveTx || executeTx || cancelTx || rejectTx) && (
        <div className="px-5 pb-4 space-y-2">
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

/* ── Step indicator ──────────────────────────────────────── */
function StepIndicator({ steps, current }: { steps: string[]; current: number }) {
  return (
    <div className="flex items-center w-full mb-6" style={{ minWidth: 0 }}>
      {steps.map((label, i) => (
        <div key={label} className="flex items-center min-w-0"
          style={{ flex: i < steps.length - 1 ? '1 1 0%' : '0 0 auto' }}>
          {/* Circle + label */}
          <div className="flex items-center gap-2 shrink-0">
            <div
              className="w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold shrink-0 transition-all"
              style={{
                background: i <= current ? 'var(--accent)' : 'var(--surface-strong)',
                color: i <= current ? '#fff' : 'var(--muted)',
                border: i <= current ? 'none' : '1px solid var(--border)',
              }}
            >
              {i < current ? '✓' : i + 1}
            </div>
            <span
              className="text-sm font-medium whitespace-nowrap"
              style={{ color: i === current ? 'var(--ink)' : 'var(--muted)' }}
            >
              {label}
            </span>
          </div>
          {/* Connector line — stretches between items */}
          {i < steps.length - 1 && (
            <div
              className="h-px mx-3 transition-all duration-300"
              style={{
                flex: '1 1 0%',
                minWidth: 12,
                background: i < current ? 'var(--accent)' : 'var(--border)',
              }}
            />
          )}
        </div>
      ))}
    </div>
  )
}

/* ── Create Proposal form ────────────────────────────────── */
function CreateProposalForm({ onCreated }: { onCreated: () => void }) {
  const { address } = useAccount()
  const [coSigner1,   setCoSigner1]   = useState('')
  const [coSigner2,   setCoSigner2]   = useState('')
  const [description, setDescription] = useState('')
  const [recipients,  setRecipients]  = useState<Recipient[]>([{ addr: '', amount: '' }])
  const [step,        setStep]        = useState<'form' | 'propose'>('form')
  const [proposeTx,   setProposeTx]   = useState<`0x${string}` | undefined>()
  const [isDone,      setIsDone]      = useState(false)

  const { writeContractAsync } = useWriteContract()

  const total = recipients.reduce((s, r) => {
    const n = parseFloat(r.amount)
    return s + (isNaN(n) ? 0 : n)
  }, 0)
  const validRecipients = recipients.filter(r => isAddress(r.addr) && parseFloat(r.amount) > 0)
  const canSubmit = isAddress(coSigner1) && isAddress(coSigner2) &&
    coSigner1.toLowerCase() !== coSigner2.toLowerCase() &&
    coSigner1.toLowerCase() !== address?.toLowerCase() &&
    coSigner2.toLowerCase() !== address?.toLowerCase() &&
    validRecipients.length > 0 && description.trim().length > 0



  const { isSuccess: proposeConfirmed } = useWaitForTransactionReceipt({ hash: proposeTx })
  const proposeRef = useRef(false)
  useEffect(() => {
    if (proposeConfirmed && !proposeRef.current) {
      proposeRef.current = true
      setIsDone(true)
      onCreated()
    }
  }, [proposeConfirmed, onCreated])

  function handleCSV(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    Papa.parse<string[]>(file, {
      skipEmptyLines: true,
      complete(res) {
        const parsed: Recipient[] = res.data
          .filter((row): row is string[] => Array.isArray(row) && row.length >= 2)
          .map(row => ({ addr: row[0].trim(), amount: row[1].trim() }))
          .filter(r => isAddress(r.addr) && !isNaN(parseFloat(r.amount)))
        if (parsed.length > 0) setRecipients(parsed)
        else toast.error('No valid rows found in CSV')
      },
    })
  }

  async function handlePropose() {
    try {
      setStep('propose')
      const recs = validRecipients.map(r => ({
        addr:   r.addr as `0x${string}`,
        amount: parseUsdc(r.amount),
      }))
      const hash = await writeContractAsync({
        address: MULTISIG_ADDRESS, abi: MULTISIG_ABI, functionName: 'propose',
        args: [recs, coSigner1 as `0x${string}`, coSigner2 as `0x${string}`, description],
      })
      setProposeTx(hash)
      toast.info('Submitting proposal…')
    } catch (e: unknown) {
      toast.error((e as Error).message?.slice(0, 80) || 'Propose failed')
      setStep('form')
    }
  }

  function reset() {
    setCoSigner1(''); setCoSigner2(''); setDescription('')
    setRecipients([{ addr: '', amount: '' }])
    setStep('form'); setProposeTx(undefined)
    setIsDone(false); proposeRef.current = false
  }

  const stepIdx = step === 'form' ? 0 : 1

  if (isDone) {
    return (
      <Card>
        <div className="flex flex-col items-center gap-4 py-10 text-center">
          <div className="w-16 h-16 rounded-full flex items-center justify-center"
            style={{ background: 'rgba(74,163,101,0.15)' }}>
            <CheckCircle2 size={36} style={{ color: 'var(--success)' }} />
          </div>
          <div>
            <p className="font-bold text-xl" style={{ color: 'var(--ink)' }}>Proposal created!</p>
            <p className="text-sm mt-1 max-w-sm" style={{ color: 'var(--muted)' }}>
              Your two co-signers can now approve the proposal. Once both approve, anyone can execute the payout.
            </p>
          </div>
          {proposeTx && (
            <a href={explorerTx(proposeTx)} target="_blank" rel="noreferrer"
               className="text-xs font-mono px-3 py-1.5 rounded-lg hover:underline"
               style={{ background: 'var(--surface-strong)', color: 'var(--accent)' }}>
              View tx: {shortAddr(proposeTx)}
            </a>
          )}
          <PrimaryButton onClick={reset}>Create another</PrimaryButton>
        </div>
      </Card>
    )
  }

  return (
    <div
      className="rounded-2xl box-border w-full"
      style={{
        background: 'var(--surface)',
        border: '1px solid var(--border)',
        padding: 'clamp(16px, 4vw, 32px)',
      }}
    >
      <StepIndicator steps={['Build', 'Propose']} current={stepIdx} />

      <div className="space-y-6">
        {/* Description */}
        <div>
          <Label>Description</Label>
          <div className="mt-2">
            <Input placeholder="e.g. October payroll" value={description} onChange={v => setDescription(v)} />
          </div>
        </div>

        {/* Co-signers */}
        <div>
          <Label>Co-signers — both must approve before payout executes</Label>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mt-2">
            <div>
              <p className="text-xs mb-1" style={{ color: 'var(--muted)' }}>Co-signer 1</p>
              <Input
                placeholder="0x..."
                value={coSigner1}
                onChange={v => setCoSigner1(v.trim())}
                className={coSigner1 && !isAddress(coSigner1) ? 'border-red-400' : ''}
              />
              {coSigner1 && !isAddress(coSigner1) && (
                <p className="text-xs mt-1 flex items-center gap-1" style={{ color: 'var(--error)' }}>
                  <AlertCircle size={11} /> Invalid address
                </p>
              )}
              {coSigner1 && isAddress(coSigner1) && coSigner1.toLowerCase() === address?.toLowerCase() && (
                <p className="text-xs mt-1 flex items-center gap-1" style={{ color: 'var(--error)' }}>
                  <AlertCircle size={11} /> Cannot be your own address
                </p>
              )}
            </div>
            <div>
              <p className="text-xs mb-1" style={{ color: 'var(--muted)' }}>Co-signer 2</p>
              <Input
                placeholder="0x..."
                value={coSigner2}
                onChange={v => setCoSigner2(v.trim())}
                className={coSigner2 && !isAddress(coSigner2) ? 'border-red-400' : ''}
              />
              {coSigner2 && !isAddress(coSigner2) && (
                <p className="text-xs mt-1 flex items-center gap-1" style={{ color: 'var(--error)' }}>
                  <AlertCircle size={11} /> Invalid address
                </p>
              )}
              {coSigner2 && isAddress(coSigner2) && coSigner2.toLowerCase() === coSigner1.toLowerCase() && (
                <p className="text-xs mt-1 flex items-center gap-1" style={{ color: 'var(--error)' }}>
                  <AlertCircle size={11} /> Must differ from co-signer 1
                </p>
              )}
            </div>
          </div>
        </div>

        {/* Recipients */}
        <div>
          <div className="flex items-center justify-between mb-3">
            <Label>Recipients</Label>
            <label className="cursor-pointer flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg font-medium transition-colors"
              style={{ background: 'var(--surface-strong)', color: 'var(--accent)', border: '1px solid var(--border)' }}>
              <Upload size={12} /> Upload CSV
              <input type="file" accept=".csv" className="hidden" onChange={handleCSV} />
            </label>
          </div>

          {/* Table header — col widths match the row grid exactly */}
          <div className="hidden sm:grid grid-cols-[1fr_160px_40px] gap-3 mb-2 px-0">
            <span className="text-xs font-medium" style={{ color: 'var(--muted)' }}>Wallet address</span>
            <span className="text-xs font-medium" style={{ color: 'var(--muted)' }}>Amount (USDC)</span>
            <span />
          </div>

          {/* Rows */}
          <div className="space-y-2">
            {recipients.map((r, i) => (
              <div key={i} className="grid grid-cols-[1fr_160px_40px] gap-3 items-center">
                <Input
                  placeholder="0x..."
                  value={r.addr}
                  onChange={v => {
                    const next = [...recipients]; next[i] = { ...next[i], addr: v.trim() }; setRecipients(next)
                  }}
                  className={r.addr && !isAddress(r.addr) ? 'border-red-400' : ''}
                />
                <Input
                  placeholder="0.00"
                  type="number"
                  value={r.amount}
                  onChange={v => {
                    const next = [...recipients]; next[i] = { ...next[i], amount: v }; setRecipients(next)
                  }}
                />
                <button
                  onClick={() => setRecipients(recipients.filter((_, j) => j !== i))}
                  disabled={recipients.length === 1}
                  className="flex items-center justify-center rounded-lg hover:opacity-70 disabled:opacity-30 transition-opacity"
                  style={{ width: 40, height: 44, background: 'var(--surface-strong)', color: 'var(--error)', flexShrink: 0 }}
                >
                  <Trash2 size={14} />
                </button>
              </div>
            ))}
          </div>

          <button
            onClick={() => setRecipients([...recipients, { addr: '', amount: '' }])}
            className="mt-3 flex items-center gap-1.5 text-xs px-3 py-2 rounded-lg font-medium transition-colors"
            style={{ background: 'var(--surface-strong)', color: 'var(--accent)', border: '1px solid var(--border)' }}
          >
            <Plus size={12} /> Add row
          </button>
        </div>

        {/* Summary box */}
        {validRecipients.length > 0 && (
          <div className="rounded-xl p-4 flex flex-wrap gap-6" style={{ background: 'var(--surface-strong)', border: '1px solid var(--border)' }}>
            <div>
              <p className="text-[11px] uppercase tracking-widest font-semibold mb-0.5" style={{ color: 'var(--muted)' }}>Valid recipients</p>
              <p className="font-bold text-lg" style={{ color: 'var(--ink)' }}>{validRecipients.length}</p>
            </div>
            <div>
              <p className="text-[11px] uppercase tracking-widest font-semibold mb-0.5" style={{ color: 'var(--muted)' }}>Total USDC</p>
              <p className="font-bold text-lg font-mono" style={{ color: 'var(--accent)' }}>{total.toFixed(2)}</p>
            </div>
          </div>
        )}

        {/* CTA */}
        <div className="pt-2 border-t" style={{ borderColor: 'var(--border)' }}>
          <PrimaryButton
            onClick={() => { void handlePropose() }}
            disabled={!canSubmit}
            loading={step === 'propose' && !proposeConfirmed && !!proposeTx}
            className="w-full justify-center"
          >
            <Send size={15} /> Create Proposal
          </PrimaryButton>
          {proposeTx && (
            <div className="mt-3">
              <TxStatus hash={proposeTx} isConfirming={!proposeConfirmed} isSuccess={proposeConfirmed} explorerUrl={explorerTx} className="mt-0" />
            </div>
          )}
        </div>
      </div>
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
            <p className="text-sm mt-1" style={{ color: 'var(--muted)' }}>Create the first one using the "+ New Proposal" tab above.</p>
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
              Proposals you create or are invited to co-sign will appear here. Create one using the "+ New Proposal" tab above, or ask someone to add your wallet as a co-signer.
            </p>
          </div>
        </div>
      </Card>
    )
  }

  return (
    <div className="space-y-3">
      <p className="text-xs font-bold uppercase tracking-widest mb-1 flex items-center gap-2" style={{ color: 'var(--muted)' }}>
        <span className="w-1.5 h-1.5 rounded-full inline-block" style={{ background: 'var(--accent)' }} />
        Your proposals ({myProposals.length})
      </p>
      {myProposals.map(p => (
        <ProposalCard key={String(p.id)} p={p} connectedAddr={connectedAddr} onRefresh={handleRefresh} highlighted={highlightId === p.id} />
      ))}
    </div>
  )
}

/* ── How it works panel ──────────────────────────────────── */
function HowItWorks() {
  const steps = [
    { icon: <Send size={18} />,        title: 'Propose',      desc: 'Any wallet creates a proposal with a recipient list and two co-signer addresses.' },
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

/* ── Page ────────────────────────────────────────────────── */
export default function MultiSigPayoutPage() {
  const { address, isConnected } = useAccount()
  const [searchParams] = useSearchParams()
  const hasProposalParam = !!searchParams.get('proposal')
  const [tab,        setTab]        = useState<'create' | 'proposals'>(hasProposalParam ? 'proposals' : 'proposals')
  const [refreshKey, setRefreshKey] = useState(0)

  function handleCreated() { setTab('proposals'); setRefreshKey(k => k + 1) }

  // suppress unused icons warning
  void XCircle

  return (
    <ChainGuard>
      <PageHeader
        title="Multi-Sig Payout"
        subtitle="Create a payout proposal with two required co-signers. Both must approve before funds move."
      />

      <div className="mt-6 space-y-6">
        <HowItWorks />

        {/* Tab bar */}
        <div className="flex gap-1 p-1 rounded-xl w-fit mb-2" style={{ background: 'var(--surface-strong)', border: '1px solid var(--border)' }}>
          {(['proposals', 'create'] as const).map(t => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className="px-5 py-2 rounded-lg text-sm font-semibold transition-all"
              style={{
                background: tab === t ? 'var(--accent)' : 'transparent',
                color:      tab === t ? '#fff' : 'var(--muted)',
              }}
            >
              {t === 'proposals' ? 'Proposals' : '+ New Proposal'}
            </button>
          ))}
        </div>

        {tab === 'create' && isConnected && <CreateProposalForm onCreated={handleCreated} />}
        {tab === 'create' && !isConnected && (
          <Card>
            <div className="flex flex-col items-center gap-3 py-10 text-center">
              <AlertCircle size={32} style={{ color: 'var(--muted)' }} />
              <p style={{ color: 'var(--muted)' }}>Connect your wallet to create a proposal.</p>
            </div>
          </Card>
        )}
        {tab === 'proposals' && (
          <ProposalsList connectedAddr={address ?? ''} refreshKey={refreshKey} />
        )}
      </div>
    </ChainGuard>
  )
}
