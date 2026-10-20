/**
 * Vesting Recipient Dashboard — shows only streams where the connected wallet
 * is the BENEFICIARY. Focused pull-to-claim view with live progress.
 */
import React, { useState, useEffect, useCallback } from 'react'
import { useAccount, useReadContract, useWriteContract, useWaitForTransactionReceipt } from 'wagmi'
import { Clock, TrendingUp, CheckCircle2, XCircle, Loader2, RefreshCw } from 'lucide-react'
import {
  Card, PageHeader, Badge, PrimaryButton, TxStatus, AlertBox, Divider, StatCard,
} from './ui'
import { VESTING_STREAM_ADDRESS, explorerTx } from '../constants'
import { VESTING_STREAM_ABI } from '../abis'
import { formatUsdc, shortAddr } from '../utils'

/* ── Types ─────────────────────────────────────────────── */
interface Stream {
  id: bigint
  grantor: string
  beneficiary: string
  totalAmount: bigint
  claimedAmount: bigint
  startTime: bigint
  endTime: bigint
  cancelled: boolean
}

/* ── Helpers ─────────────────────────────────────────────── */
function vestedNow(s: Stream): bigint {
  const now = BigInt(Math.floor(Date.now() / 1000))
  const eff = now > s.endTime ? s.endTime : now
  if (eff <= s.startTime) return 0n
  const elapsed = eff - s.startTime
  const dur = s.endTime - s.startTime
  if (dur === 0n) return s.totalAmount
  const v = (s.totalAmount * elapsed) / dur
  return v > s.totalAmount ? s.totalAmount : v
}

function progressPct(s: Stream): number {
  const vested = vestedNow(s)
  if (s.totalAmount === 0n) return 0
  return Math.min(100, Number((vested * 10000n) / s.totalAmount) / 100)
}

function claimablePct(s: Stream): number {
  const vested = vestedNow(s)
  const claimable = vested > s.claimedAmount ? vested - s.claimedAmount : 0n
  if (s.totalAmount === 0n) return 0
  return Math.min(100, Number((claimable * 10000n) / s.totalAmount) / 100)
}

function timeLeft(s: Stream): string {
  if (s.cancelled) return 'Cancelled'
  const now = Math.floor(Date.now() / 1000)
  const end = Number(s.endTime)
  if (now >= end) return 'Fully vested'
  const diff = end - now
  const days  = Math.floor(diff / 86400)
  const hours = Math.floor((diff % 86400) / 3600)
  if (days > 0) return `${days}d ${hours}h left`
  const mins = Math.floor((diff % 3600) / 60)
  return `${hours}h ${mins}m left`
}

function statusVariant(s: Stream): 'success' | 'danger' | 'default' {
  if (s.cancelled) return 'danger'
  const now = BigInt(Math.floor(Date.now() / 1000))
  if (now >= s.endTime) return 'success'
  return 'default'
}

function statusLabel(s: Stream): string {
  if (s.cancelled) return 'Cancelled'
  const now = BigInt(Math.floor(Date.now() / 1000))
  if (now >= s.endTime) return 'Fully vested'
  return 'Active'
}

/* ── Stream Card ─────────────────────────────────────────── */
function StreamCard({ stream, onClaimed }: { stream: Stream; onClaimed: () => void }) {
  const claimable = vestedNow(stream) - stream.claimedAmount
  const pct = progressPct(stream)
  const claimPct = claimablePct(stream)

  const { writeContract: claim, data: claimHash } = useWriteContract()
  const { isSuccess: claimConfirmed, isLoading: claimConfirming } = useWaitForTransactionReceipt({ hash: claimHash })

  useEffect(() => {
    if (claimConfirmed) onClaimed()
  }, [claimConfirmed, onClaimed])

  const handleClaim = () => {
    claim({
      address: VESTING_STREAM_ADDRESS,
      abi: VESTING_STREAM_ABI,
      functionName: 'claim',
      args: [stream.id],
    })
  }

  return (
    <Card className="p-5 flex flex-col gap-4">
      {/* Header */}
      <div className="flex items-start justify-between gap-2">
        <div className="flex flex-col gap-0.5">
          <div className="flex items-center gap-2">
            <span className="font-mono text-xs" style={{ color: 'var(--subtle)' }}>Stream #{stream.id.toString()}</span>
            <Badge variant={statusVariant(stream)}>{statusLabel(stream)}</Badge>
          </div>
          <p className="text-xs mt-0.5" style={{ color: 'var(--subtle)' }}>
            From <span className="font-mono">{shortAddr(stream.grantor)}</span>
          </p>
        </div>
        <div className="text-right">
          <div className="font-display font-bold text-xl tabular-nums" style={{ color: 'var(--vest-accent)' }}>
            {formatUsdc(stream.totalAmount)}
          </div>
          <div className="text-xs" style={{ color: 'var(--muted)' }}>USDC total</div>
        </div>
      </div>

      {/* Progress bar */}
      <div className="flex flex-col gap-1.5">
        <div className="flex items-center justify-between text-xs" style={{ color: 'var(--subtle)' }}>
          <span>Vested: <strong style={{ color: 'var(--ink-2)' }}>{pct.toFixed(1)}%</strong></span>
          <span>{timeLeft(stream)}</span>
        </div>
        <div className="relative h-2 rounded-full overflow-hidden" style={{ background: 'var(--surface-muted)' }}>
          <div
            className="absolute inset-y-0 left-0 rounded-full transition-all duration-500"
            style={{ width: `${pct}%`, background: 'var(--vest-accent)', opacity: 0.4 }}
          />
          <div
            className="absolute inset-y-0 left-0 rounded-full transition-all duration-500"
            style={{ width: `${claimPct}%`, background: 'var(--vest-accent)' }}
          />
        </div>
        <div className="flex items-center justify-between text-xs" style={{ color: 'var(--subtle)' }}>
          <span>Claimed: {formatUsdc(stream.claimedAmount)} USDC</span>
          <span style={{ color: claimable > 0n ? 'var(--vest-accent)' : 'var(--subtle)' }}>
            Claimable: {formatUsdc(claimable)} USDC
          </span>
        </div>
      </div>

      <Divider />

      {/* Detail row */}
      <div className="grid grid-cols-2 gap-2 text-xs">
        {([
          ['Start', new Date(Number(stream.startTime) * 1000).toLocaleDateString()],
          ['End',   new Date(Number(stream.endTime)   * 1000).toLocaleDateString()],
        ] as [string, string][]).map(([k, v]) => (
          <div key={k} className="flex flex-col gap-0.5">
            <span style={{ color: 'var(--subtle)' }}>{k}</span>
            <span style={{ color: 'var(--ink-2)' }}>{v}</span>
          </div>
        ))}
      </div>

      {/* Claim button */}
      {!stream.cancelled && claimable > 0n && (
        <>
          <PrimaryButton onClick={handleClaim} loading={claimConfirming}>
            Claim {formatUsdc(claimable)} USDC
          </PrimaryButton>
          <TxStatus
            isPending={!!claimHash && !claimConfirming && !claimConfirmed}
            isConfirming={claimConfirming}
            isSuccess={claimConfirmed}
            hash={claimHash}
            explorerUrl={explorerTx}
            successMsg="Claimed successfully!"
          />
        </>
      )}
      {stream.cancelled && (
        <AlertBox variant="warning">This stream was cancelled. Claim any vested balance from the main Vesting page.</AlertBox>
      )}
      {!stream.cancelled && claimable === 0n && (
        <p className="text-xs text-center py-1" style={{ color: 'var(--subtle)' }}>
          {vestedNow(stream) >= stream.totalAmount ? '✓ Fully claimed' : 'Nothing claimable yet — check back later'}
        </p>
      )}
    </Card>
  )
}

/* ── Main page ───────────────────────────────────────────── */
export default function VestingRecipient() {
  const { address } = useAccount()
  const [streams, setStreams] = useState<Stream[]>([])
  const [loading, setLoading] = useState(false)
  const [tick, setTick] = useState(0)

  const { refetch: fetchIds } = useReadContract({
    address: VESTING_STREAM_ADDRESS,
    abi: VESTING_STREAM_ABI,
    functionName: 'streamsOf',
    args: address ? [address] : undefined,
    query: { enabled: false },
  })

  const { refetch: fetchStream } = useReadContract({
    address: VESTING_STREAM_ADDRESS,
    abi: VESTING_STREAM_ABI,
    functionName: 'getStream',
    args: [0n],
    query: { enabled: false },
  })

  const load = useCallback(async () => {
    if (!address) return
    setLoading(true)
    try {
      const { data: ids } = await fetchIds()
      if (!ids || (ids as bigint[]).length === 0) { setStreams([]); setLoading(false); return }

      const allIds = ids as bigint[]
      const loaded: Stream[] = []
      for (const id of allIds) {
        const { data: s } = await (fetchStream as unknown as (opts: { args: [bigint] }) => Promise<{ data: unknown }>)({ args: [id] })
        if (s) {
          const raw = s as [string, string, bigint, bigint, bigint, bigint, boolean]
          const stream: Stream = {
            id,
            grantor:       raw[0],
            beneficiary:   raw[1],
            totalAmount:   raw[2],
            claimedAmount: raw[3],
            startTime:     raw[4],
            endTime:       raw[5],
            cancelled:     raw[6],
          }
          if (stream.beneficiary.toLowerCase() === address.toLowerCase()) {
            loaded.push(stream)
          }
        }
      }
      setStreams(loaded)
    } finally {
      setLoading(false)
    }
  }, [address, fetchIds, fetchStream])

  // oxlint-disable-next-line react/set-state-in-effect
  useEffect(() => { void load() }, [load, tick])

  // Stats
  const totalReceiving = streams.reduce((a, s) => a + s.totalAmount, 0n)
  const totalClaimed   = streams.reduce((a, s) => a + s.claimedAmount, 0n)
  const totalClaimable = streams.reduce((a, s) => {
    const c = vestedNow(s) - s.claimedAmount
    return a + (c > 0n ? c : 0n)
  }, 0n)
  const activeCount = streams.filter(s => !s.cancelled && vestedNow(s) < s.totalAmount).length

  return (
    <div className="flex flex-col gap-6 animate-fade-up">
      <div className="flex items-start justify-between gap-3">
        <PageHeader
          icon={TrendingUp}
          title="My Vesting Streams"
          subtitle="Streams where you are the beneficiary — claim your vested USDC."
          accentColor="var(--vest-accent)"
        />
        <button
          onClick={() => setTick(t => t + 1)}
          className="mt-1 p-2 rounded-xl transition-all hover:scale-110"
          style={{ color: 'var(--muted)', border: '1px solid var(--border-strong)', background: 'var(--surface-strong)' }}
          title="Refresh"
        >
          <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
        </button>
      </div>

      {!address && <AlertBox variant="info">Connect your wallet to see your vesting streams.</AlertBox>}

      {address && !loading && streams.length > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <StatCard label="Active streams"   value={activeCount}                          icon={Clock}        accentColor="var(--vest-accent)" />
          <StatCard label="Total receiving"  value={`${formatUsdc(totalReceiving)} USDC`} icon={TrendingUp}   accentColor="var(--vest-accent)" />
          <StatCard label="Already claimed"  value={`${formatUsdc(totalClaimed)} USDC`}   icon={CheckCircle2} accentColor="var(--success)"     />
          <StatCard
            label="Claimable now"
            value={<span style={{ color: totalClaimable > 0n ? 'var(--vest-accent)' : undefined }}>{formatUsdc(totalClaimable)} USDC</span>}
            icon={TrendingUp}
            accentColor="var(--vest-accent)"
          />
        </div>
      )}

      {loading && (
        <div className="flex items-center justify-center gap-2 py-12" style={{ color: 'var(--muted)' }}>
          <Loader2 size={20} className="animate-spin" />
          <span className="text-sm">Loading streams…</span>
        </div>
      )}

      {!loading && address && streams.length === 0 && (
        <div className="flex flex-col items-center gap-2 py-16 text-center">
          <XCircle size={32} style={{ color: 'var(--subtle)' }} />
          <p className="text-sm" style={{ color: 'var(--muted)' }}>No vesting streams found for your wallet</p>
          <p className="text-xs" style={{ color: 'var(--subtle)' }}>Ask a grantor to create a stream to your address</p>
        </div>
      )}

      {!loading && streams.length > 0 && (
        <div className="flex flex-col gap-3">
          {streams.map(s => (
            <StreamCard key={s.id.toString()} stream={s} onClaimed={() => setTick(t => t + 1)} />
          ))}
        </div>
      )}
    </div>
  )
}
