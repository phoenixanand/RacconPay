/**
 * VestingStream page — Arc Dark redesign.
 *
 * DECIMAL NOTE:
 *   All amounts are 6-decimal ERC-20 USDC. Arc native gas is 18-decimal — never used here.
 */

import React, { useState, useCallback } from 'react'
import {
  useAccount, useWriteContract, useWaitForTransactionReceipt,
  useReadContract, useReadContracts,
} from 'wagmi'
import { toast } from 'sonner'
import { Clock, CheckCircle2, XCircle, ExternalLink, ChevronDown, ChevronUp, Loader2, AlertTriangle } from 'lucide-react'

import ChainGuard from './ChainGuard'
import SuccessAnimation from './SuccessAnimation'
import { USDC_ADDRESS, VESTING_STREAM_ADDRESS, ARC_CHAIN_ID, explorerTx } from '../constants'
import { ERC20_ABI, VESTING_STREAM_ABI } from '../abis'
import { parseUsdc, formatUsdc } from '../utils'
import { Card, Label, PrimaryButton, GhostButton, Badge, PageHeader, TxStatus } from './ui'

interface StreamData {
  grantor: `0x${string}`; beneficiary: `0x${string}`
  totalAmount: bigint; claimedAmount: bigint
  startTime: bigint; endTime: bigint; cancelled: boolean
}

function durationToSeconds(value: string, unit: 'days' | 'hours' | 'minutes'): bigint {
  const n = parseFloat(value)
  if (isNaN(n) || n <= 0) throw new Error('Duration must be > 0')
  return BigInt(Math.floor(n * { minutes: 60, hours: 3600, days: 86400 }[unit]))
}

function formatDuration(seconds: bigint): string {
  const s = Number(seconds)
  if (s >= 86400) return `${(s / 86400).toFixed(1)} days`
  if (s >= 3600)  return `${(s / 3600).toFixed(1)} hours`
  if (s >= 60)    return `${(s / 60).toFixed(1)} min`
  return `${s}s`
}

function formatDate(ts: bigint): string {
  return new Date(Number(ts) * 1000).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })
}

function progressPct(stream: StreamData): number {
  const now = BigInt(Math.floor(Date.now() / 1000))
  if (now <= stream.startTime) return 0
  if (now >= stream.endTime)   return 100
  return Math.min(100, Number(((now - stream.startTime) * 100n) / (stream.endTime - stream.startTime)))
}

function shortAddr(addr: string) { return `${addr.slice(0, 6)}…${addr.slice(-4)}` }

export default function VestingStreamPage() {
  return <ChainGuard><Inner /></ChainGuard>
}

type Tab = 'create' | 'streams'

function Inner() {
  const { address } = useAccount()
  const [tab, setTab] = useState<Tab>('create')

  return (
    <div className="flex flex-col gap-6">
      <PageHeader icon={Clock} title="Vesting Streams" subtitle="Create linear USDC streams or manage existing ones." />

      {/* Tab bar */}
      <div className="flex gap-1 p-1 rounded-xl w-fit" style={{ background: 'var(--surface-muted)', border: '1px solid var(--border)' }}>
        {(['create', 'streams'] as Tab[]).map(t => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className="px-4 py-1.5 rounded-lg text-sm font-medium transition-all"
            style={{
              background: tab === t ? 'var(--surface-strong)' : 'transparent',
              color: tab === t ? 'var(--ink)' : 'var(--muted)',
              border: tab === t ? '1px solid var(--border-strong)' : '1px solid transparent',
            }}
          >
            {t === 'create' ? 'Create Stream' : 'My Streams'}
          </button>
        ))}
      </div>

      {tab === 'create'  && <CreateStream  address={address!} />}
      {tab === 'streams' && <MyStreams      address={address!} />}
    </div>
  )
}

// ── Create Stream ─────────────────────────────────────────────────────
type CreateStep = 'idle' | 'approving' | 'approved' | 'creating'

function CreateStream({ address }: { address: `0x${string}` }) {
  const [beneficiary, setBeneficiary] = useState('')
  const [amount, setAmount]           = useState('')
  const [duration, setDuration]       = useState('')
  const [unit, setUnit]               = useState<'days' | 'hours' | 'minutes'>('days')
  const [step, setStep]               = useState<CreateStep>('idle')
  const [isDone, setIsDone]           = useState(false)
  const [showSuccess, setShowSuccess] = useState(false)
  const [newStreamId, setNewStreamId] = useState<bigint | null>(null)
  const [errors, setErrors]           = useState<string[]>([])

  const { data: balance } = useReadContract({
    address: USDC_ADDRESS, abi: ERC20_ABI, functionName: 'balanceOf',
    args: [address], chainId: ARC_CHAIN_ID,
  })

  const { writeContract: writeApprove, data: approveHash, isPending: isApproving } = useWriteContract()
  const { isSuccess: approveConfirmed } = useWaitForTransactionReceipt({ hash: approveHash })
  const { writeContract: writeCreate,  data: createHash,  isPending: isCreating  } = useWriteContract()
  const { isSuccess: createConfirmed,  data: createReceipt, isLoading: createLoading } = useWaitForTransactionReceipt({ hash: createHash })

  if (approveConfirmed && step === 'approving') {
    setStep('approved')
    toast.success('USDC allowed — confirm stream creation')
  }

  if (createConfirmed && createReceipt && !isDone) {
    try {
      const log = createReceipt.logs.find(l => l.address.toLowerCase() === VESTING_STREAM_ADDRESS.toLowerCase())
      if (log?.topics[1] && newStreamId === null) setNewStreamId(BigInt(log.topics[1]))
    } catch { /* ignore */ }
    setIsDone(true)
    setShowSuccess(true)
  }

  function validate() {
    const errs: string[] = []
    if (!beneficiary.match(/^0x[0-9a-fA-F]{40}$/)) errs.push('Invalid beneficiary address')
    else if (beneficiary === '0x0000000000000000000000000000000000000000') errs.push('Zero address not allowed')
    let amtRaw = 0n; let durSecs = 0n
    try { amtRaw = parseUsdc(amount); if (amtRaw === 0n) errs.push('Amount cannot be zero') }
    catch { errs.push(`Invalid amount`) }
    try { durSecs = durationToSeconds(duration, unit) }
    catch { errs.push('Duration must be a positive number') }
    setErrors(errs)
    return { valid: errs.length === 0, amtRaw, durSecs }
  }

  function handleApprove() {
    const { valid, amtRaw } = validate(); if (!valid) return
    setStep('approving')
    try {
      writeApprove({ address: USDC_ADDRESS, abi: ERC20_ABI, functionName: 'approve',
        args: [VESTING_STREAM_ADDRESS, amtRaw], chainId: ARC_CHAIN_ID })
    } catch (e: unknown) {
      setStep('idle')
      toast.error(e instanceof Error && e.message.includes('user rejected') ? 'Cancelled' : String(e))
    }
  }

  function handleCreate() {
    const { valid, amtRaw, durSecs } = validate(); if (!valid) return
    setStep('creating')
    try {
      writeCreate({ address: VESTING_STREAM_ADDRESS, abi: VESTING_STREAM_ABI, functionName: 'createStream',
        args: [beneficiary as `0x${string}`, amtRaw, durSecs], chainId: ARC_CHAIN_ID })
    } catch (e: unknown) {
      setStep('approved')
      toast.error(e instanceof Error && e.message.includes('user rejected') ? 'Cancelled' : String(e))
    }
  }

  function reset() { setBeneficiary(''); setAmount(''); setDuration(''); setStep('idle'); setIsDone(false); setNewStreamId(null); setErrors([]) }

  // Success
  if (isDone) {
    return (
      <Card strong className="p-8 flex flex-col items-center text-center gap-5 max-w-md">
        <div className="w-16 h-16 rounded-2xl flex items-center justify-center"
             style={{ background: 'var(--success-muted)', border: '1px solid rgba(94,207,138,0.25)' }}>
          <CheckCircle2 size={32} style={{ color: 'var(--success)' }} />
        </div>
        <div>
          <h2 className="font-display font-bold text-2xl" style={{ color: 'var(--ink)', letterSpacing: '-0.02em' }}>
            Stream Created!
          </h2>
          {newStreamId !== null && (
            <p className="text-sm mt-1.5" style={{ color: 'var(--muted)' }}>
              Stream <span className="font-mono font-semibold" style={{ color: 'var(--accent)' }}>#{newStreamId.toString()}</span> is now vesting.
            </p>
          )}
        </div>
        <div className="flex gap-3">
          {createHash && (
            <a href={explorerTx(createHash)} target="_blank" rel="noreferrer"
               className="flex items-center gap-1.5 text-sm" style={{ color: 'var(--accent)' }}>
              <ExternalLink size={14} /> View tx
            </a>
          )}
          <GhostButton onClick={reset}>New Stream</GhostButton>
        </div>
      </Card>
    )
  }

  const balFmt = balance ? formatUsdc(balance) : '—'

  if (showSuccess) {
    return (
      <>
        <SuccessAnimation
          show={showSuccess}
          label="Stream created!"
          sublabel={newStreamId !== null ? `Stream #${newStreamId}` : 'Vesting started'}
          duration={2400}
          onDone={() => setShowSuccess(false)}
        />
        <div className="opacity-0 h-40" />
      </>
    )
  }

  let amtRawPreview = 0n
  try { amtRawPreview = parseUsdc(amount) } catch { /* leave */ }
  const insufficientFunds = balance !== undefined && amtRawPreview > 0n && balance < amtRawPreview
  const canApprove = step === 'idle'
  const canCreate  = step === 'approved'

  return (
    <div className="grid grid-cols-1 md:grid-cols-[1fr_280px] gap-6 items-start">
      {/* Form */}
      <Card className="divide-y divide-[var(--border)]">
        {/* Beneficiary */}
        <div className="p-5">
          <Label>Beneficiary address</Label>
          <input
            className="font-mono text-xs w-full rounded-xl mt-1.5 px-3.5 py-2.5 outline-none transition-all placeholder:text-[var(--subtle)]"
            style={{ background: 'var(--surface-muted)', color: 'var(--ink)', border: '1px solid var(--border)' }}
            placeholder="0x…"
            value={beneficiary}
            onChange={e => setBeneficiary(e.target.value)}
            onFocus={e => (e.currentTarget.style.borderColor = 'var(--border-strong)')}
            onBlur={e  => (e.currentTarget.style.borderColor = 'var(--border)')}
          />
        </div>

        {/* Amount */}
        <div className="p-5">
          <Label>Total USDC to vest</Label>
          <div className="flex items-center gap-2 mt-1.5">
            <input
              className="flex-1 text-sm tabular-nums rounded-xl px-3.5 py-2.5 outline-none transition-all placeholder:text-[var(--subtle)]"
              style={{ background: 'var(--surface-muted)', color: 'var(--ink)', border: '1px solid var(--border)' }}
              placeholder="0.00" value={amount} onChange={e => setAmount(e.target.value)}
              onFocus={e => (e.currentTarget.style.borderColor = 'var(--border-strong)')}
              onBlur={e  => (e.currentTarget.style.borderColor = 'var(--border)')}
            />
            <span className="text-sm shrink-0" style={{ color: 'var(--subtle)' }}>USDC</span>
          </div>
        </div>

        {/* Duration */}
        <div className="p-5">
          <Label>Vesting duration</Label>
          <div className="flex items-center gap-2 mt-1.5">
            <input
              className="flex-1 text-sm tabular-nums rounded-xl px-3.5 py-2.5 outline-none transition-all placeholder:text-[var(--subtle)]"
              style={{ background: 'var(--surface-muted)', color: 'var(--ink)', border: '1px solid var(--border)' }}
              placeholder="30" value={duration} onChange={e => setDuration(e.target.value)}
              onFocus={e => (e.currentTarget.style.borderColor = 'var(--border-strong)')}
              onBlur={e  => (e.currentTarget.style.borderColor = 'var(--border)')}
            />
            <select
              className="text-sm rounded-xl px-3 py-2.5 outline-none transition-all"
              style={{ background: 'var(--surface-muted)', color: 'var(--ink)', border: '1px solid var(--border)' }}
              value={unit} onChange={e => setUnit(e.target.value as typeof unit)}
            >
              <option value="minutes">Minutes</option>
              <option value="hours">Hours</option>
              <option value="days">Days</option>
            </select>
          </div>
        </div>
      </Card>

      {/* Right col — summary + actions */}
      <div className="flex flex-col gap-4">
        <Card strong className="p-5 flex flex-col gap-4">
          <div className="flex items-center justify-between">
            <Label>Your balance</Label>
            <span className="font-mono text-sm tabular-nums" style={{ color: 'var(--muted)' }}>
              {balFmt} <span style={{ color: 'var(--subtle)' }}>USDC</span>
            </span>
          </div>
          <div className="h-px rounded-full" style={{ background: 'var(--spectral)', opacity: 0.3 }} />

          <div className="flex flex-col gap-2.5 text-xs" style={{ color: 'var(--subtle)' }}>
            <div className="flex items-center gap-2">
              <span className="w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold"
                    style={{ background: step !== 'idle' ? 'var(--success-muted)' : 'var(--surface-strong)',
                             color: step !== 'idle' ? 'var(--success)' : 'var(--subtle)',
                             border: `1px solid ${step !== 'idle' ? 'rgba(94,207,138,0.3)' : 'var(--border)'}` }}>
                {step !== 'idle' ? '✓' : '1'}
              </span>
              Allow USDC
            </div>
            <div className="flex items-center gap-2">
              <span className="w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold"
                    style={{ background: isDone ? 'var(--success-muted)' : 'var(--surface-strong)',
                             color: isDone ? 'var(--success)' : 'var(--subtle)',
                             border: `1px solid ${isDone ? 'rgba(94,207,138,0.3)' : 'var(--border)'}` }}>
                {isDone ? '✓' : '2'}
              </span>
              Create stream
            </div>
          </div>

          {/* Insufficient funds warning */}
          {insufficientFunds && (
            <div className="flex items-start gap-2 rounded-xl px-3 py-2.5 text-xs"
                 style={{ background: 'var(--danger-muted)', border: '1px solid rgba(232,109,122,0.25)', color: 'var(--danger)' }}>
              <AlertTriangle size={13} className="shrink-0 mt-0.5" />
              <span>You need {amount} USDC but have {balFmt}. Get USDC on Arc first.</span>
            </div>
          )}

          {canApprove && (
            <PrimaryButton onClick={handleApprove} loading={isApproving} disabled={insufficientFunds}>
              {isApproving ? 'Waiting for wallet…' : 'Allow USDC'}
            </PrimaryButton>
          )}
          {step === 'approving' && !canApprove && (
            <PrimaryButton onClick={handleApprove} loading={true}>Waiting…</PrimaryButton>
          )}
          {canCreate && (
            <PrimaryButton onClick={handleCreate} loading={isCreating || createLoading}>
              {isCreating ? 'Waiting for wallet…' : createLoading ? 'Confirming…' : 'Create Stream'}
            </PrimaryButton>
          )}

          <TxStatus isPending={isApproving} isConfirming={!isApproving && step === 'approving'}
                    hash={approveHash} explorerUrl={explorerTx} successMsg="Allowed" />
        </Card>

        {/* Errors */}
        {errors.length > 0 && (
          <div className="rounded-xl px-4 py-3 text-sm space-y-1"
               style={{ background: 'var(--danger-muted)', border: '1px solid rgba(232,109,122,0.25)', color: 'var(--danger)' }}>
            {errors.map((e, i) => <p key={i}>{e}</p>)}
          </div>
        )}
      </div>
    </div>
  )
}

// ── My Streams ────────────────────────────────────────────────────────
type StreamTab = 'received' | 'sent'
function MyStreams({ address }: { address: `0x${string}` }) {
  const [streamTab, setStreamTab] = useState<StreamTab>('received')
  const { data: streamIds, refetch: refetchIds } = useReadContract({
    address: VESTING_STREAM_ADDRESS, abi: VESTING_STREAM_ABI, functionName: 'streamsOf',
    args: [address], chainId: ARC_CHAIN_ID,
  })

  const { data: pending, refetch: refetchPending } = useReadContract({
    address: VESTING_STREAM_ADDRESS, abi: VESTING_STREAM_ABI, functionName: 'pendingWithdrawals',
    args: [address], chainId: ARC_CHAIN_ID,
  })

  const refetch = useCallback(() => { void refetchIds(); void refetchPending() }, [refetchIds, refetchPending])
  const ids = (streamIds ?? []) as bigint[]

  const { data: streamResults } = useReadContracts({
    contracts: ids.map(id => ({
      address: VESTING_STREAM_ADDRESS as `0x${string}`,
      abi: VESTING_STREAM_ABI,
      functionName: 'getStream' as const,
      args: [id] as const,
      chainId: ARC_CHAIN_ID,
    })),
  })

  const allStreams = ids.map((id, i) => ({ id, data: streamResults?.[i]?.result as StreamData ?? null }))
                       .filter(s => s.data !== null)

  const streams = allStreams.filter(s =>
    streamTab === 'sent'
      ? s.data.grantor.toLowerCase() === address.toLowerCase()
      : s.data.beneficiary.toLowerCase() === address.toLowerCase()
  )
  const sentCount     = allStreams.filter(s => s.data.grantor.toLowerCase()     === address.toLowerCase()).length
  const receivedCount = allStreams.filter(s => s.data.beneficiary.toLowerCase() === address.toLowerCase()).length

  const { writeContract: writeWithdraw, data: withdrawHash, isPending: isWithdrawing } = useWriteContract()
  const { isSuccess: withdrawConfirmed } = useWaitForTransactionReceipt({ hash: withdrawHash })
  if (withdrawConfirmed) { refetch(); toast.success('Withdrawn!') }

  function handleWithdraw() {
    writeWithdraw({ address: VESTING_STREAM_ADDRESS, abi: VESTING_STREAM_ABI, functionName: 'withdraw', chainId: ARC_CHAIN_ID })
  }

  // Sub-tab bar (always shown once we have any stream data)
  const subTabBar = (
    <div className="flex gap-1 p-1 rounded-xl w-fit" style={{ background: 'var(--surface-muted)', border: '1px solid var(--border)' }}>
      {(['received', 'sent'] as StreamTab[]).map(t => (
        <button key={t} onClick={() => setStreamTab(t)}
                className="px-4 py-1.5 rounded-lg text-sm font-medium transition-all flex items-center gap-1.5"
                style={{
                  background: streamTab === t ? 'var(--surface-strong)' : 'transparent',
                  color: streamTab === t ? 'var(--ink)' : 'var(--muted)',
                  border: streamTab === t ? '1px solid var(--border-strong)' : '1px solid transparent',
                }}>
          {t === 'received' ? 'Receiving' : 'Sent'}
          <span className="text-[10px] px-1.5 py-0.5 rounded-full font-semibold"
                style={{ background: 'var(--surface-strong)', color: 'var(--subtle)' }}>
            {t === 'received' ? receivedCount : sentCount}
          </span>
        </button>
      ))}
    </div>
  )

  if (ids.length === 0) {
    return (
      <div className="flex flex-col gap-4">
        {subTabBar}
        <Card className="flex flex-col items-center gap-4 py-16 text-center">
          <div className="w-14 h-14 rounded-2xl flex items-center justify-center"
               style={{ background: 'var(--surface-strong)', border: '1px solid var(--border-strong)' }}>
            <Clock size={24} style={{ color: 'var(--subtle)' }} />
          </div>
          <div>
            <p className="font-semibold text-sm" style={{ color: 'var(--ink)' }}>No streams yet</p>
            <p className="text-sm mt-1" style={{ color: 'var(--muted)' }}>Create a stream or wait to receive one.</p>
          </div>
        </Card>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-4">
      {subTabBar}
      {streams.length === 0 && (
        <Card className="flex flex-col items-center gap-4 py-12 text-center">
          <p className="font-semibold text-sm" style={{ color: 'var(--ink)' }}>
            No {streamTab === 'sent' ? 'sent' : 'received'} streams
          </p>
          <p className="text-sm" style={{ color: 'var(--muted)' }}>
            {streamTab === 'sent' ? 'Create a stream to see it here.' : 'Streams sent to you will appear here.'}
          </p>
        </Card>
      )}
      {/* Pending withdrawal banner */}
      {pending !== undefined && pending > 0n && (
        <div className="flex items-center justify-between gap-4 rounded-2xl px-5 py-4"
             style={{ background: 'var(--warning-muted)', border: '1px solid rgba(245,192,90,0.25)' }}>
          <div>
            <Label>Pending withdrawal</Label>
            <p className="font-display font-bold text-xl tabular-nums mt-0.5" style={{ color: 'var(--warning)', letterSpacing: '-0.02em' }}>
              {formatUsdc(pending)} <span className="text-sm font-normal">USDC</span>
            </p>
            <p className="text-xs mt-0.5" style={{ color: 'var(--warning)' }}>From cancelled streams</p>
          </div>
          <button
            onClick={handleWithdraw} disabled={isWithdrawing}
            className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold transition-all hover:scale-[1.02] disabled:opacity-50 shrink-0"
            style={{ background: 'var(--warning)', color: '#080f1a' }}
          >
            {isWithdrawing && <Loader2 size={13} className="animate-spin" />}
            {isWithdrawing ? 'Withdrawing…' : 'Withdraw'}
          </button>
        </div>
      )}

      {streams.map(({ id, data }) => (
        <StreamCard key={id.toString()} streamId={id} data={data} address={address} onRefresh={refetch} />
      ))}
    </div>
  )
}

// ── Stream card ───────────────────────────────────────────────────────
function StreamCard({ streamId, data, address, onRefresh }: {
  streamId: bigint; data: StreamData; address: `0x${string}`; onRefresh: () => void
}) {
  const [expanded, setExpanded] = useState(false)

  const isBeneficiary = data.beneficiary.toLowerCase() === address.toLowerCase()
  const isGrantor     = data.grantor.toLowerCase() === address.toLowerCase()
  const pct           = progressPct(data)

  const { data: claimable, refetch: refetchClaimable } = useReadContract({
    address: VESTING_STREAM_ADDRESS, abi: VESTING_STREAM_ABI, functionName: 'claimableAmount',
    args: [streamId], chainId: ARC_CHAIN_ID,
    query: { enabled: !data.cancelled && isBeneficiary },
  })

  const { writeContract: writeClaim,  data: claimHash,  isPending: isClaiming   } = useWriteContract()
  const { writeContract: writeCancel, data: cancelHash, isPending: isCancelling } = useWriteContract()
  const { isSuccess: claimConfirmed  } = useWaitForTransactionReceipt({ hash: claimHash  })
  const { isSuccess: cancelConfirmed } = useWaitForTransactionReceipt({ hash: cancelHash })

  if (claimConfirmed)  { onRefresh(); void refetchClaimable(); toast.success('Claimed!') }
  if (cancelConfirmed) { onRefresh(); toast.success('Cancelled — funds in pending withdrawal') }

  const handleClaim  = () => writeClaim({  address: VESTING_STREAM_ADDRESS, abi: VESTING_STREAM_ABI, functionName: 'claim',  args: [streamId], chainId: ARC_CHAIN_ID })
  const handleCancel = () => writeCancel({ address: VESTING_STREAM_ADDRESS, abi: VESTING_STREAM_ABI, functionName: 'cancel', args: [streamId], chainId: ARC_CHAIN_ID })

  const isCompleted = !data.cancelled && data.claimedAmount >= data.totalAmount
  const statusVariant: 'default' | 'success' | 'danger' = data.cancelled ? 'danger' : (pct >= 100 || isCompleted) ? 'success' : 'default'
  const statusLabel = data.cancelled ? 'Cancelled' : isCompleted ? 'Completed' : pct >= 100 ? 'Fully vested' : 'Streaming'
  const barColor    = data.cancelled ? 'var(--danger)' : (pct >= 100 || isCompleted) ? 'var(--success)' : 'var(--accent)'

  return (
    <Card className="overflow-hidden">
      {/* Header */}
      <button
        onClick={() => setExpanded(x => !x)}
        className="w-full px-5 py-4 flex items-center justify-between gap-3 text-left transition-colors hover:bg-white/[0.03]"
      >
        <div className="flex items-center gap-3 min-w-0">
          <span className="font-mono text-sm font-semibold shrink-0" style={{ color: 'var(--accent)' }}>
            #{streamId.toString()}
          </span>
          <Badge variant={statusVariant}>{statusLabel}</Badge>
          <span className="text-xs truncate" style={{ color: 'var(--subtle)' }}>
            {isBeneficiary && isGrantor ? 'Both roles' : isBeneficiary ? 'You receive' : 'You sent'}
          </span>
        </div>
        <div className="flex items-center gap-3 shrink-0">
          <span className="text-sm font-semibold tabular-nums" style={{ color: 'var(--ink)' }}>
            {formatUsdc(data.totalAmount)} <span style={{ color: 'var(--subtle)' }}>USDC</span>
          </span>
          {expanded ? <ChevronUp size={15} style={{ color: 'var(--subtle)' }} /> : <ChevronDown size={15} style={{ color: 'var(--subtle)' }} />}
        </div>
      </button>

      {/* Progress bar */}
      <div className="px-5 pb-4">
        <div className="h-1.5 rounded-full overflow-hidden" style={{ background: 'var(--surface-strong)' }}>
          <div className="h-full rounded-full transition-all" style={{ width: `${pct}%`, background: barColor }} />
        </div>
        <div className="flex justify-between mt-1.5 text-xs" style={{ color: 'var(--subtle)' }}>
          <span>{formatDate(data.startTime)}</span>
          <span className="tabular-nums font-medium" style={{ color: 'var(--muted)' }}>{pct.toFixed(0)}% vested</span>
          <span>{formatDate(data.endTime)}</span>
        </div>
      </div>

      {/* Expanded */}
      {expanded && (
        <div className="border-t border-[var(--border)] px-5 py-4 flex flex-col gap-4">
          {/* Detail table */}
          <div className="rounded-xl overflow-hidden" style={{ background: 'var(--surface-muted)', border: '1px solid var(--border)' }}>
            {([
              ['Grantor',    <span className="font-mono text-xs">{shortAddr(data.grantor)}</span>],
              ['Beneficiary',<span className="font-mono text-xs">{shortAddr(data.beneficiary)}</span>],
              ['Total',      <span className="tabular-nums">{formatUsdc(data.totalAmount)} USDC</span>],
              ['Claimed',    <span className="tabular-nums">{formatUsdc(data.claimedAmount)} USDC</span>],
              ['Duration',   formatDuration(data.endTime - data.startTime)],
              ...(!data.cancelled && isBeneficiary && claimable !== undefined
                  ? [['Claimable now', <span className="tabular-nums font-semibold" style={{ color: 'var(--success)' }}>{formatUsdc(claimable)} USDC</span>]]
                  : []),
            ] as [string, React.ReactNode][]).map(([k, v], i) => (
              <div key={i} className="flex items-center justify-between px-4 py-2.5 text-sm border-b border-[var(--border)] last:border-0">
                <span style={{ color: 'var(--subtle)' }}>{k}</span>
                <span style={{ color: 'var(--ink-2)' }}>{v}</span>
              </div>
            ))}
          </div>

          {/* Actions */}
          <div className="flex gap-2">
            {isBeneficiary && !data.cancelled && (
              <PrimaryButton
                onClick={handleClaim}
                loading={isClaiming}
                disabled={claimable === 0n}
                className="flex-1"
              >
                {isClaiming ? 'Claiming…' : `Claim ${claimable !== undefined ? formatUsdc(claimable) : '—'} USDC`}
              </PrimaryButton>
            )}
            {isGrantor && !data.cancelled && (
              isCompleted ? (
                <div className="flex items-center gap-1.5 px-4 py-2.5 rounded-xl text-sm font-medium"
                     style={{ color: 'var(--success)', border: '1px solid rgba(94,207,138,0.25)', background: 'var(--success-muted)' }}>
                  <CheckCircle2 size={14} />
                  Closed — fully claimed
                </div>
              ) : (
                <button
                  onClick={handleCancel} disabled={isCancelling}
                  className="flex items-center gap-1.5 px-4 py-2.5 rounded-xl text-sm font-medium transition-all hover:bg-[var(--danger-muted)] disabled:opacity-50"
                  style={{ color: 'var(--danger)', border: '1px solid rgba(232,109,122,0.25)' }}
                >
                  <XCircle size={14} />
                  {isCancelling ? 'Cancelling…' : 'Cancel'}
                </button>
              )
            )}
          </div>

          {(claimHash ?? cancelHash) && (
            <a href={explorerTx((claimHash ?? cancelHash)!)} target="_blank" rel="noreferrer"
               className="flex items-center gap-1 text-xs" style={{ color: 'var(--accent)' }}>
              <ExternalLink size={11} /> View last tx
            </a>
          )}
        </div>
      )}
    </Card>
  )
}
