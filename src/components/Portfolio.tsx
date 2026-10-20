/**
 * RacconPay — Dashboard page
 * Four tabs: Overview · My Streams · Receipts
 * All data from on-chain reads — nothing simulated.
 */
import React, { useState, useEffect, useCallback } from 'react'
import { useAccount, useReadContract, useReadContracts, useWriteContract, useWaitForTransactionReceipt } from 'wagmi'
import { Link, useSearchParams } from 'react-router-dom'
import {
  Wallet, TrendingUp, ShieldCheck, Users, Layers, Send,
  ArrowUpRight, ArrowDownRight, Clock, AlertCircle,
  CheckCircle2, XCircle, Loader2, RefreshCw, ExternalLink, Shield,
  PieChart, FileText,
} from 'lucide-react'
import InvoiceDashboard from './InvoiceDashboard'
import {
  Card, Label, StatCard, GlowCard, Badge,
  PrimaryButton, TxStatus, AlertBox, Divider,
} from './ui'
import { formatUsdc, shortAddr, shortHash } from '../utils'
import {
  ARC_CHAIN_ID,
  USDC_ADDRESS,
  VESTING_STREAM_ADDRESS,
  BILL_SPLITTER_ADDRESS,
  MULTISIG_ADDRESS,
  RECEIPT_NFT_ADDRESS,
  BATCH_PAYOUT_ADDRESS,
  explorerAddr,
  explorerTx,
} from '../constants'
import {
  ERC20_ABI,
  VESTING_STREAM_ABI,
  BILL_SPLITTER_ABI,
  MULTISIG_ABI,
  RECEIPT_NFT_ABI,
} from '../abis'

/* ─────────────────────────────────────────────────────────────────
   SHARED HELPERS
───────────────────────────────────────────────────────────────── */
function fmt(v: bigint | undefined) {
  return v !== undefined ? formatUsdc(v) : '—'
}

function Shimmer({ h = 80 }: { h?: number }) {
  return (
    <div
      className="w-full rounded-2xl animate-pulse"
      style={{ height: h, background: 'var(--surface)' }}
    />
  )
}

/* ── Row inside a card ────────────────────────────────────────── */
function Row({
  label, value, sub, accent, arrow,
}: {
  label: string; value: string; sub?: string; accent?: string; arrow?: 'up' | 'down'
}) {
  return (
    <div className="flex items-center justify-between py-2.5 border-b last:border-b-0"
      style={{ borderColor: 'var(--border)' }}>
      <div className="flex flex-col gap-0.5">
        <span className="text-xs font-medium" style={{ color: 'var(--ink)' }}>{label}</span>
        {sub && <span className="text-[10px]" style={{ color: 'var(--subtle)' }}>{sub}</span>}
      </div>
      <div className="flex items-center gap-1.5">
        {arrow === 'up'   && <ArrowUpRight   size={12} style={{ color: 'var(--success)' }} />}
        {arrow === 'down' && <ArrowDownRight  size={12} style={{ color: 'var(--error)'   }} />}
        <span className="text-sm font-semibold tabular-nums" style={{ color: accent ?? 'var(--ink)' }}>
          {value}
        </span>
      </div>
    </div>
  )
}

/* ── Section wrapper ──────────────────────────────────────────── */
function Section({
  icon: Icon, title, accent, children,
}: {
  icon: React.ElementType; title: string; accent: string; children: React.ReactNode
}) {
  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center gap-2.5">
        <span
          className="flex items-center justify-center w-8 h-8 rounded-xl"
          style={{ background: `color-mix(in srgb, ${accent} 14%, transparent)` }}
        >
          <Icon size={15} style={{ color: accent }} />
        </span>
        <h2 className="text-sm font-semibold" style={{ color: 'var(--ink)' }}>{title}</h2>
      </div>
      {children}
    </div>
  )
}

/* ─────────────────────────────────────────────────────────────────
   OVERVIEW TAB — sub-sections
───────────────────────────────────────────────────────────────── */
function VestingSection({ address }: { address: `0x${string}` }) {
  const { data: streamIds } = useReadContract({
    address: VESTING_STREAM_ADDRESS, abi: VESTING_STREAM_ABI,
    functionName: 'streamsOf', args: [address], chainId: ARC_CHAIN_ID,
  })
  const { data: pendingWithdrawal } = useReadContract({
    address: VESTING_STREAM_ADDRESS, abi: VESTING_STREAM_ABI,
    functionName: 'pendingWithdrawals', args: [address], chainId: ARC_CHAIN_ID,
  })
  const ids = (streamIds as bigint[] | undefined) ?? []

  const streamQueries = useReadContracts({
    contracts: ids.map(id => ({
      address: VESTING_STREAM_ADDRESS as `0x${string}`,
      abi: VESTING_STREAM_ABI, functionName: 'getStream' as const,
      args: [id] as const, chainId: ARC_CHAIN_ID,
    })),
    query: { enabled: ids.length > 0 },
  })
  const claimableQueries = useReadContracts({
    contracts: ids.map(id => ({
      address: VESTING_STREAM_ADDRESS as `0x${string}`,
      abi: VESTING_STREAM_ABI, functionName: 'claimableAmount' as const,
      args: [id] as const, chainId: ARC_CHAIN_ID,
    })),
    query: { enabled: ids.length > 0 },
  })

  if (!streamIds) return <Shimmer />
  if (ids.length === 0) {
    return (
      <GlowCard accentColor="var(--vest-accent)" className="p-4">
        <p className="text-xs text-center py-2" style={{ color: 'var(--subtle)' }}>
          No vesting streams. <Link to="/vesting" className="underline" style={{ color: 'var(--vest-accent)' }}>Create one →</Link>
        </p>
      </GlowCard>
    )
  }

  let sentLocked = 0n, receivingTotal = 0n, totalClaimable = 0n
  let activeAsSender = 0, activeAsReceiver = 0

  ids.forEach((_, i) => {
    const streamResult = streamQueries.data?.[i]
    const claimResult  = claimableQueries.data?.[i]
    if (!streamResult || streamResult.status !== 'success') return
    const s = streamResult.result
    if (s.cancelled) return
    const remaining = s.totalAmount - s.claimedAmount
    if (s.grantor.toLowerCase() === address.toLowerCase()) {
      sentLocked += remaining; activeAsSender++
    }
    if (s.beneficiary.toLowerCase() === address.toLowerCase()) {
      receivingTotal += remaining; activeAsReceiver++
      if (claimResult?.status === 'success') totalClaimable += claimResult.result
    }
  })

  const pending = (pendingWithdrawal) ?? 0n

  return (
    <GlowCard accentColor="var(--vest-accent)" className="p-4">
      {activeAsSender > 0 && (
        <Row label={`Locked in ${activeAsSender} stream${activeAsSender !== 1 ? 's' : ''} (sent)`}
          value={`${fmt(sentLocked)} USDC`} accent="var(--vest-accent)" arrow="up" />
      )}
      {activeAsReceiver > 0 && (
        <Row label={`Receiving from ${activeAsReceiver} stream${activeAsReceiver !== 1 ? 's' : ''}`}
          value={`${fmt(receivingTotal)} USDC`}
          sub={totalClaimable > 0n ? `${fmt(totalClaimable)} claimable now` : undefined}
          accent="var(--success)" arrow="down" />
      )}
      {pending > 0n && (
        <Row label="Pending withdrawal (cancelled streams)" value={`${fmt(pending)} USDC`} accent="var(--warning)" />
      )}
      {activeAsSender === 0 && activeAsReceiver === 0 && (
        <p className="text-xs text-center py-2" style={{ color: 'var(--subtle)' }}>All streams settled.</p>
      )}
    </GlowCard>
  )
}

function MultiSigSection({ address }: { address: `0x${string}` }) {
  const { data: countData } = useReadContract({
    address: MULTISIG_ADDRESS, abi: MULTISIG_ABI,
    functionName: 'proposalCount', chainId: ARC_CHAIN_ID,
  })
  const count = Number((countData) ?? 0n)

  const proposalQueries = useReadContracts({
    contracts: Array.from({ length: Math.min(count, 50) }, (_, i) => ({
      address: MULTISIG_ADDRESS as `0x${string}`, abi: MULTISIG_ABI,
      functionName: 'getProposal' as const, args: [BigInt(i + 1)] as const, chainId: ARC_CHAIN_ID,
    })),
    query: { enabled: count > 0 },
  })

  if (!countData) return <Shimmer />
  if (count === 0) {
    return (
      <GlowCard accentColor="var(--pay-accent)" className="p-4">
        <p className="text-xs text-center py-2" style={{ color: 'var(--subtle)' }}>
          No proposals. <Link to="/multisig" className="underline" style={{ color: 'var(--pay-accent)' }}>Create one →</Link>
        </p>
      </GlowCard>
    )
  }

  type ProposalTuple = [
    proposer: `0x${string}`, coSigner1: `0x${string}`, coSigner2: `0x${string}`,
    approved1: boolean, approved2: boolean, totalAmount: bigint,
    recipientCount: bigint, status: number, description: string,
    createdAt: bigint, expired: boolean,
  ]

  let pendingAsProp = 0, pendingAsCoSign = 0, pendingValue = 0n, awaitingMyApproval = 0

  proposalQueries.data?.forEach((r) => {
    if (r.status !== 'success') return
    const p = r.result as ProposalTuple
    const [proposer, cs1, cs2, app1, app2, totalAmount, , status, , , expired] = p
    if (status === 2 || expired) return
    if (status !== 0) return
    const meL = address.toLowerCase()
    const isProp = proposer.toLowerCase() === meL
    const isCS1  = cs1.toLowerCase() === meL
    const isCS2  = cs2.toLowerCase() === meL
    if (isProp) { pendingAsProp++; pendingValue += totalAmount }
    if (isCS1 || isCS2) { pendingAsCoSign++ }
    if ((isCS1 && !app1) || (isCS2 && !app2)) awaitingMyApproval++
  })

  const total = pendingAsProp + pendingAsCoSign
  if (total === 0) {
    return (
      <GlowCard accentColor="var(--pay-accent)" className="p-4">
        <p className="text-xs text-center py-2" style={{ color: 'var(--subtle)' }}>No active proposals involving your address.</p>
      </GlowCard>
    )
  }

  return (
    <GlowCard accentColor="var(--pay-accent)" className="p-4">
      {pendingAsProp > 0 && (
        <Row label={`${pendingAsProp} proposal${pendingAsProp !== 1 ? 's' : ''} you created`}
          value={`${fmt(pendingValue)} USDC`} accent="var(--pay-accent)" />
      )}
      {pendingAsCoSign > 0 && (
        <Row label={`${pendingAsCoSign} proposal${pendingAsCoSign !== 1 ? 's' : ''} awaiting your co-sign`}
          value={awaitingMyApproval > 0 ? `${awaitingMyApproval} need approval` : 'Signed'}
          accent={awaitingMyApproval > 0 ? 'var(--warning)' : 'var(--success)'} />
      )}
    </GlowCard>
  )
}

function BillsSection({ address }: { address: `0x${string}` }) {
  const { data: billIds } = useReadContract({
    address: BILL_SPLITTER_ADDRESS, abi: BILL_SPLITTER_ABI,
    functionName: 'billsOf', args: [address], chainId: ARC_CHAIN_ID,
  })
  const ids = (billIds as bigint[] | undefined) ?? []

  const statusQueries = useReadContracts({
    contracts: ids.map(id => ({
      address: BILL_SPLITTER_ADDRESS as `0x${string}`, abi: BILL_SPLITTER_ABI,
      functionName: 'getSettlementStatus' as const, args: [id] as const, chainId: ARC_CHAIN_ID,
    })),
    query: { enabled: ids.length > 0 },
  })
  const billQueries = useReadContracts({
    contracts: ids.map(id => ({
      address: BILL_SPLITTER_ADDRESS as `0x${string}`, abi: BILL_SPLITTER_ABI,
      functionName: 'getBill' as const, args: [id] as const, chainId: ARC_CHAIN_ID,
    })),
    query: { enabled: ids.length > 0 },
  })
  const claimQueries = useReadContracts({
    contracts: ids.map(id => ({
      address: BILL_SPLITTER_ADDRESS as `0x${string}`, abi: BILL_SPLITTER_ABI,
      functionName: 'claimsOf' as const, args: [id, address] as const, chainId: ARC_CHAIN_ID,
    })),
    query: { enabled: ids.length > 0 },
  })

  if (!billIds) return <Shimmer />
  if (ids.length === 0) {
    return (
      <GlowCard accentColor="var(--split-accent)" className="p-4">
        <p className="text-xs text-center py-2" style={{ color: 'var(--subtle)' }}>
          No bills. <Link to="/split" className="underline" style={{ color: 'var(--split-accent)' }}>Create one →</Link>
        </p>
      </GlowCard>
    )
  }

  let totalOwed = 0n, totalOwedToYou = 0n, pendingClaims = 0n, openBills = 0, settledBills = 0

  ids.forEach((_, i) => {
    const billResult   = billQueries.data?.[i]
    const statusResult = statusQueries.data?.[i]
    const claimResult  = claimQueries.data?.[i]
    if (!billResult || billResult.status !== 'success') return
    if (!statusResult || statusResult.status !== 'success') return
    const [,, finalized] = billResult.result as [string, `0x${string}`[], boolean]
    const [sMembers, balances, settled] = statusResult.result as [`0x${string}`[], bigint[], boolean[]]
    const claim = (claimResult?.status === 'success' ? claimResult.result : 0n)
    if (finalized) { settledBills++; return }
    openBills++
    const idx = sMembers.findIndex(m => m.toLowerCase() === address.toLowerCase())
    if (idx >= 0 && !settled[idx]) {
      const bal = balances[idx] ?? 0n
      if (bal < 0n) totalOwed += -bal          // negative = owes
      if (bal > 0n) totalOwedToYou += bal      // positive = owed to you
    }
    if (claim > 0n) pendingClaims += claim
  })

  return (
    <GlowCard accentColor="var(--split-accent)" className="p-4">
      <Row label={`${openBills} open bill${openBills !== 1 ? 's' : ''}, ${settledBills} settled`}
        value="" sub={`${ids.length} total`} />
      {totalOwed > 0n && (
        <Row label="You owe (remaining)" value={`${fmt(totalOwed)} USDC`} accent="var(--error)" arrow="up" />
      )}
      {totalOwedToYou > 0n && (
        <Row label="Owed to you" value={`${fmt(totalOwedToYou)} USDC`} accent="var(--success)" arrow="down" />
      )}
      {pendingClaims > 0n && (
        <Row label="Pending claim (ready to withdraw)" value={`${fmt(pendingClaims)} USDC`} accent="var(--warning)" />
      )}
      {totalOwed === 0n && totalOwedToYou === 0n && pendingClaims === 0n && (
        <p className="text-xs text-center pt-1" style={{ color: 'var(--subtle)' }}>All square.</p>
      )}
    </GlowCard>
  )
}

function ReceiptsSummarySection({ address }: { address: `0x${string}` }) {
  const { data: tokenIds } = useReadContract({
    address: RECEIPT_NFT_ADDRESS, abi: RECEIPT_NFT_ABI,
    functionName: 'receiptsOf', args: [address], chainId: ARC_CHAIN_ID,
  })
  const ids = (tokenIds as bigint[] | undefined) ?? []

  const receiptQueries = useReadContracts({
    contracts: ids.slice(0, 50).map(id => ({
      address: RECEIPT_NFT_ADDRESS as `0x${string}`, abi: RECEIPT_NFT_ABI,
      functionName: 'getReceipt' as const, args: [id] as const, chainId: ARC_CHAIN_ID,
    })),
    query: { enabled: ids.length > 0 },
  })

  if (!tokenIds) return <Shimmer />
  if (ids.length === 0) {
    return (
      <GlowCard accentColor="var(--receipt-accent)" className="p-4">
        <p className="text-xs text-center py-2" style={{ color: 'var(--subtle)' }}>
          No receipts yet. <Link to="/pay" className="underline" style={{ color: 'var(--receipt-accent)' }}>Send a batch →</Link>
        </p>
      </GlowCard>
    )
  }

  let totalDisbursed = 0n, totalRecipients = 0n
  receiptQueries.data?.forEach(r => {
    if (r.status !== 'success') return
    const rec = r.result as { batchTotal: bigint; recipientCount: bigint; timestamp: bigint }
    totalDisbursed  += rec.batchTotal
    totalRecipients += rec.recipientCount
  })

  const latest = receiptQueries.data?.[receiptQueries.data.length - 1]
  const latestTs = latest?.status === 'success'
    ? new Date(Number((latest.result as { timestamp: bigint }).timestamp) * 1000).toLocaleDateString()
    : null

  return (
    <GlowCard accentColor="var(--receipt-accent)" className="p-4">
      <Row label="Total batches sent" value={`${ids.length}`}
        sub={latestTs ? `Latest: ${latestTs}` : undefined} accent="var(--receipt-accent)" />
      <Row label="Total USDC disbursed" value={`${fmt(totalDisbursed)} USDC`} accent="var(--ink)" />
      <Row label="Total recipients paid" value={`${totalRecipients.toString()}`} accent="var(--muted)" />
    </GlowCard>
  )
}

/* ─────────────────────────────────────────────────────────────────
   MY STREAMS TAB  (full claim UI, was /my-streams)
───────────────────────────────────────────────────────────────── */
interface Stream {
  id: bigint; grantor: string; beneficiary: string
  totalAmount: bigint; claimedAmount: bigint
  startTime: bigint; endTime: bigint; cancelled: boolean
}

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

function StreamCard({ stream, onClaimed }: { stream: Stream; onClaimed: () => void }) {
  const claimable = vestedNow(stream) - stream.claimedAmount
  const pct = progressPct(stream)
  const claimPct = claimablePct(stream)

  const { writeContract: claim, data: claimHash } = useWriteContract()
  const { isSuccess: claimConfirmed, isLoading: claimConfirming } = useWaitForTransactionReceipt({ hash: claimHash })

  useEffect(() => { if (claimConfirmed) onClaimed() }, [claimConfirmed, onClaimed])

  return (
    <Card className="p-5 flex flex-col gap-4">
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

      <div className="flex flex-col gap-1.5">
        <div className="flex items-center justify-between text-xs" style={{ color: 'var(--subtle)' }}>
          <span>Vested: <strong style={{ color: 'var(--ink-2)' }}>{pct.toFixed(1)}%</strong></span>
          <span>{timeLeft(stream)}</span>
        </div>
        <div className="relative h-2 rounded-full overflow-hidden" style={{ background: 'var(--surface-muted)' }}>
          <div className="absolute inset-y-0 left-0 rounded-full transition-all duration-500"
            style={{ width: `${pct}%`, background: 'var(--vest-accent)', opacity: 0.4 }} />
          <div className="absolute inset-y-0 left-0 rounded-full transition-all duration-500"
            style={{ width: `${claimPct}%`, background: 'var(--vest-accent)' }} />
        </div>
        <div className="flex items-center justify-between text-xs" style={{ color: 'var(--subtle)' }}>
          <span>Claimed: {formatUsdc(stream.claimedAmount)} USDC</span>
          <span style={{ color: claimable > 0n ? 'var(--vest-accent)' : 'var(--subtle)' }}>
            Claimable: {formatUsdc(claimable)} USDC
          </span>
        </div>
      </div>

      <Divider />

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

      {!stream.cancelled && claimable > 0n && (
        <>
          <PrimaryButton
            onClick={() => claim({ address: VESTING_STREAM_ADDRESS, abi: VESTING_STREAM_ABI, functionName: 'claim', args: [stream.id] })}
            loading={claimConfirming}
          >
            Claim {formatUsdc(claimable)} USDC
          </PrimaryButton>
          <TxStatus
            isPending={!!claimHash && !claimConfirming && !claimConfirmed}
            isConfirming={claimConfirming} isSuccess={claimConfirmed}
            hash={claimHash} explorerUrl={explorerTx} successMsg="Claimed successfully!"
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

function MyStreamsTab({ address }: { address: `0x${string}` }) {
  const [streams, setStreams] = useState<Stream[]>([])
  const [loading, setLoading] = useState(false)
  const [tick, setTick]       = useState(0)

  const { refetch: fetchIds } = useReadContract({
    address: VESTING_STREAM_ADDRESS, abi: VESTING_STREAM_ABI,
    functionName: 'streamsOf', args: [address], query: { enabled: false },
  })
  const { refetch: fetchStream } = useReadContract({
    address: VESTING_STREAM_ADDRESS, abi: VESTING_STREAM_ABI,
    functionName: 'getStream', args: [0n], query: { enabled: false },
  })

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const { data: ids } = await fetchIds()
      if (!ids || (ids as bigint[]).length === 0) { setStreams([]); return }
      const loaded: Stream[] = []
      for (const id of ids as bigint[]) {
        const { data: s } = await (fetchStream as unknown as (opts: { args: [bigint] }) => Promise<{ data: unknown }>)({ args: [id] })
        if (s) {
          const raw = s as [string, string, bigint, bigint, bigint, bigint, boolean]
          const stream: Stream = {
            id, grantor: raw[0], beneficiary: raw[1], totalAmount: raw[2],
            claimedAmount: raw[3], startTime: raw[4], endTime: raw[5], cancelled: raw[6],
          }
          if (stream.beneficiary.toLowerCase() === address.toLowerCase()) loaded.push(stream)
        }
      }
      setStreams(loaded)
    } finally { setLoading(false) }
  }, [address, fetchIds, fetchStream])

  // oxlint-disable-next-line react/set-state-in-effect
  useEffect(() => { void load() }, [load, tick])

  const totalReceiving = streams.reduce((a, s) => a + s.totalAmount,   0n)
  const totalClaimed   = streams.reduce((a, s) => a + s.claimedAmount, 0n)
  const totalClaimable = streams.reduce((a, s) => {
    const c = vestedNow(s) - s.claimedAmount; return a + (c > 0n ? c : 0n)
  }, 0n)
  const activeCount = streams.filter(s => !s.cancelled && vestedNow(s) < s.totalAmount).length

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <p className="text-sm" style={{ color: 'var(--muted)' }}>
          Streams where you are the beneficiary — claim your vested USDC.
        </p>
        <button
          onClick={() => setTick(t => t + 1)}
          className="p-2 rounded-xl transition-all hover:scale-110"
          style={{ color: 'var(--muted)', border: '1px solid var(--border-strong)', background: 'var(--surface-strong)' }}
          title="Refresh"
        >
          <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
        </button>
      </div>

      {!loading && streams.length > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <StatCard label="Active streams"   value={activeCount}                            icon={Clock}        accentColor="var(--vest-accent)" />
          <StatCard label="Total receiving"  value={`${formatUsdc(totalReceiving)} USDC`}   icon={TrendingUp}   accentColor="var(--vest-accent)" />
          <StatCard label="Already claimed"  value={`${formatUsdc(totalClaimed)} USDC`}     icon={CheckCircle2} accentColor="var(--success)"     />
          <StatCard
            label="Claimable now"
            value={<span style={{ color: totalClaimable > 0n ? 'var(--vest-accent)' : undefined }}>{formatUsdc(totalClaimable)} USDC</span>}
            icon={TrendingUp} accentColor="var(--vest-accent)"
          />
        </div>
      )}

      {loading && (
        <div className="flex items-center justify-center gap-2 py-12" style={{ color: 'var(--muted)' }}>
          <Loader2 size={20} className="animate-spin" />
          <span className="text-sm">Loading streams…</span>
        </div>
      )}

      {!loading && streams.length === 0 && (
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

/* ─────────────────────────────────────────────────────────────────
   RECEIPTS TAB  (full NFT grid, was /receipts)
───────────────────────────────────────────────────────────────── */
function ReceiptsTab({ address }: { address: `0x${string}` }) {
  const { data: tokenIds, isLoading: idsLoading } = useReadContract({
    address: RECEIPT_NFT_ADDRESS, abi: RECEIPT_NFT_ABI,
    functionName: 'receiptsOf', args: [address], chainId: ARC_CHAIN_ID,
    query: { enabled: !!address },
  })
  const { data: receipts, isLoading: receiptsLoading } = useReadContracts({
    contracts: (tokenIds ?? []).map(id => ({
      address: RECEIPT_NFT_ADDRESS as `0x${string}`, abi: RECEIPT_NFT_ABI,
      functionName: 'getReceipt' as const, args: [id] as const, chainId: ARC_CHAIN_ID,
    })),
    query: { enabled: (tokenIds?.length ?? 0) > 0 },
  })

  const loading = idsLoading || receiptsLoading

  if (loading) {
    return (
      <div className="flex flex-col gap-3">
        {[1, 2, 3].map(i => (
          <div key={i} className="h-28 rounded-2xl animate-pulse" style={{ background: 'var(--surface)' }} />
        ))}
      </div>
    )
  }

  if (!tokenIds || tokenIds.length === 0) {
    return (
      <Card className="flex flex-col items-center gap-4 py-16 text-center">
        <div className="w-14 h-14 rounded-2xl flex items-center justify-center"
          style={{ background: 'var(--surface-strong)', border: '1px solid var(--border-strong)' }}>
          <Layers size={24} style={{ color: 'var(--subtle)' }} />
        </div>
        <div>
          <p className="font-semibold text-sm" style={{ color: 'var(--ink)' }}>No receipts yet</p>
          <p className="text-sm mt-1" style={{ color: 'var(--muted)' }}>Send a batch payout to mint your first receipt.</p>
        </div>
      </Card>
    )
  }

  return (
    <div className="grid md:grid-cols-2 gap-4">
      {tokenIds.map((id, i) => {
        const result = receipts?.[i]
        if (!result || result.status !== 'success') return null
        const d = result.result
        const date = new Date(Number(d.timestamp) * 1000).toLocaleString()

        return (
          <Card key={id.toString()} className="p-5 flex flex-col gap-4">
            <div className="flex items-start justify-between">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-lg flex items-center justify-center"
                  style={{ background: 'var(--accent-glow)', border: '1px solid var(--border-strong)' }}>
                  <Layers size={14} style={{ color: 'var(--accent)' }} />
                </div>
                <span className="font-mono text-xs" style={{ color: 'var(--subtle)' }}>
                  Receipt #{id.toString()}
                </span>
              </div>
              <a href={explorerAddr(RECEIPT_NFT_ADDRESS)} target="_blank" rel="noreferrer"
                className="p-1.5 rounded-lg transition-colors hover:bg-white/5"
                style={{ color: 'var(--subtle)' }}>
                <ExternalLink size={14} />
              </a>
            </div>

            <div>
              <Label>Batch total</Label>
              <div className="font-display font-bold text-2xl tabular-nums mt-0.5"
                style={{ color: 'var(--ink)', letterSpacing: '-0.03em' }}>
                {formatUsdc(d.batchTotal)}
                <span className="text-base font-normal ml-1.5" style={{ color: 'var(--subtle)' }}>USDC</span>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Recipients</Label>
                <p className="text-sm font-semibold mt-0.5 tabular-nums" style={{ color: 'var(--ink-2)' }}>
                  {d.recipientCount.toString()}
                </p>
              </div>
              <div>
                <Label>Date</Label>
                <p className="text-sm mt-0.5" style={{ color: 'var(--ink-2)' }}>{date}</p>
              </div>
              <div className="col-span-2">
                <Label>List Hash</Label>
                <p className="font-mono text-xs mt-0.5 break-all" style={{ color: 'var(--muted)' }}>
                  {shortHash(d.listHash)}
                </p>
              </div>
            </div>

            <div className="flex items-center gap-1.5">
              <Shield size={12} style={{ color: 'var(--subtle)' }} />
              <Badge variant="default">Soul-bound · Non-transferable</Badge>
            </div>
          </Card>
        )
      })}
    </div>
  )
}

/* ─────────────────────────────────────────────────────────────────
   TAB BAR
───────────────────────────────────────────────────────────────── */
type Tab = 'overview' | 'streams' | 'receipts' | 'invoices'

const TABS: { id: Tab; label: string; icon: React.ElementType; accent: string }[] = [
  { id: 'overview',  label: 'Overview',   icon: PieChart,    accent: 'var(--accent)'          },
  { id: 'streams',   label: 'My Streams', icon: TrendingUp,  accent: 'var(--vest-accent)'     },
  { id: 'receipts',  label: 'Receipts',   icon: Layers,      accent: 'var(--receipt-accent)'  },
  { id: 'invoices',  label: 'Invoices',   icon: FileText,    accent: 'var(--receipt-accent)'  },
]

function TabBar({ active, onChange }: { active: Tab; onChange: (t: Tab) => void }) {
  return (
    <div
      className="flex items-center gap-1 p-1 rounded-2xl w-fit"
      style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}
    >
      {TABS.map(({ id, label, icon: Icon, accent }) => {
        const isActive = active === id
        return (
          <button
            key={id}
            onClick={() => onChange(id)}
            className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium transition-all duration-150"
            style={{
              color:      isActive ? accent           : 'var(--muted)',
              background: isActive ? `color-mix(in srgb, ${accent} 12%, var(--bg))` : 'transparent',
              border:     isActive ? `1px solid color-mix(in srgb, ${accent} 25%, transparent)` : '1px solid transparent',
            }}
          >
            <Icon size={14} />
            {label}
          </button>
        )
      })}
    </div>
  )
}

/* ─────────────────────────────────────────────────────────────────
   MAIN PORTFOLIO PAGE
───────────────────────────────────────────────────────────────── */
export default function DashboardPage() {
  const { address, isConnected } = useAccount()
  const [searchParams, setSearchParams] = useSearchParams()

  // Allow ?tab=streams or ?tab=receipts deep-links (from redirects)
  const tabParam = searchParams.get('tab') as Tab | null
  const [activeTab, setActiveTab] = useState<Tab>(
    tabParam === 'streams' || tabParam === 'receipts' || tabParam === 'invoices' ? tabParam : 'overview'
  )

  function handleTabChange(t: Tab) {
    setActiveTab(t)
    if (t === 'overview') {
      searchParams.delete('tab')
    } else {
      searchParams.set('tab', t)
    }
    setSearchParams(searchParams, { replace: true })
  }

  /* ── Summary reads for the hero bar (Overview tab only) ── */
  const { data: usdcBalance, refetch: refetchBalance } = useReadContract({
    address: USDC_ADDRESS, abi: ERC20_ABI, functionName: 'balanceOf',
    args: [address ?? '0x0000000000000000000000000000000000000000'],
    chainId: ARC_CHAIN_ID, query: { enabled: isConnected && !!address, refetchInterval: 30_000 },
  })
  const { data: receiptIds } = useReadContract({
    address: RECEIPT_NFT_ADDRESS, abi: RECEIPT_NFT_ABI, functionName: 'receiptsOf',
    args: [address ?? '0x0000000000000000000000000000000000000000'],
    chainId: ARC_CHAIN_ID, query: { enabled: isConnected && !!address },
  })
  const { data: streamIds } = useReadContract({
    address: VESTING_STREAM_ADDRESS, abi: VESTING_STREAM_ABI, functionName: 'streamsOf',
    args: [address ?? '0x0000000000000000000000000000000000000000'],
    chainId: ARC_CHAIN_ID, query: { enabled: isConnected && !!address },
  })
  const { data: billIds } = useReadContract({
    address: BILL_SPLITTER_ADDRESS, abi: BILL_SPLITTER_ABI, functionName: 'billsOf',
    args: [address ?? '0x0000000000000000000000000000000000000000'],
    chainId: ARC_CHAIN_ID, query: { enabled: isConnected && !!address },
  })
  const { data: proposalCount } = useReadContract({
    address: MULTISIG_ADDRESS, abi: MULTISIG_ABI, functionName: 'proposalCount',
    chainId: ARC_CHAIN_ID, query: { enabled: isConnected },
  })

  if (!isConnected || !address) {
    return (
      <div className="flex flex-col items-center justify-center gap-5 py-24">
        <span className="flex items-center justify-center w-14 h-14 rounded-2xl"
          style={{ background: 'color-mix(in srgb, var(--accent) 10%, transparent)' }}>
          <Wallet size={24} style={{ color: 'var(--accent)' }} />
        </span>
        <div className="text-center">
          <p className="text-base font-semibold" style={{ color: 'var(--ink)' }}>Connect your wallet</p>
          <p className="text-sm mt-1" style={{ color: 'var(--muted)' }}>Your portfolio summary appears here once connected.</p>
        </div>
      </div>
    )
  }

  const balance   = (usdcBalance) ?? 0n
  const receipts  = (receiptIds as bigint[] | undefined) ?? []
  const streams   = (streamIds  as bigint[] | undefined) ?? []
  const bills     = (billIds    as bigint[] | undefined) ?? []
  const proposals = Number((proposalCount) ?? 0n)

  // Generate a deterministic avatar colour from the address
  const avatarHue = parseInt(address.slice(2, 6), 16) % 360
  const avatarBg  = `hsl(${avatarHue}, 55%, 52%)`

  return (
    <div className="flex flex-col gap-6">
      {/* ── Wallet identity card ─────────────────────────────── */}
      <div
        className="flex items-center gap-4 p-5 rounded-3xl"
        style={{
          background: 'var(--surface)',
          border: '1px solid var(--border)',
          boxShadow: '0 2px 12px rgba(0,0,0,0.04)',
        }}
      >
        {/* Avatar circle — deterministic colour from address */}
        <div
          className="w-14 h-14 rounded-2xl flex items-center justify-center shrink-0 font-display font-bold text-xl text-white select-none"
          style={{ background: avatarBg }}
        >
          {address.slice(2, 4).toUpperCase()}
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-[10px] font-bold uppercase tracking-[0.12em] mb-0.5" style={{ color: 'var(--subtle)' }}>
            Connected Wallet
          </p>
          <p className="font-mono text-sm font-semibold truncate" style={{ color: 'var(--ink)' }}>
            {address}
          </p>
          <div className="flex items-center gap-2 mt-1.5 flex-wrap">
            <span
              className="flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold"
              style={{ background: 'rgba(74,140,92,0.10)', color: 'var(--success)', border: '1px solid rgba(74,140,92,0.22)' }}
            >
              <span className="w-1.5 h-1.5 rounded-full" style={{ background: 'var(--success)' }} />
              Arc Mainnet
            </span>
            <a
              href={explorerAddr(address)}
              target="_blank" rel="noreferrer"
              className="flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium transition-opacity hover:opacity-70"
              style={{ background: 'var(--surface-strong)', color: 'var(--muted)', border: '1px solid var(--border-strong)' }}
            >
              View on Explorer <ExternalLink size={9} />
            </a>
          </div>
        </div>
        {/* USDC balance — large */}
        <div className="text-right shrink-0 hidden sm:block">
          <p className="text-[10px] font-bold uppercase tracking-[0.1em]" style={{ color: 'var(--subtle)' }}>Balance</p>
          <p className="font-display font-bold tabular-nums" style={{ fontSize: 28, color: 'var(--ink)', lineHeight: 1.1 }}>
            {fmt(balance)}
          </p>
          <div className="flex items-center justify-end gap-1.5 mt-0.5">
            <p className="text-xs" style={{ color: 'var(--muted)' }}>USDC</p>
            <button
              onClick={() => void refetchBalance()}
              className="flex items-center justify-center w-5 h-5 rounded-full transition-colors hover:opacity-70"
              style={{ color: 'var(--muted)' }}
              title="Refresh balance"
            >
              <RefreshCw size={11} />
            </button>
          </div>
        </div>
      </div>

      {/* ── Tab bar ─────────────────────────────────────────── */}
      <TabBar active={activeTab} onChange={handleTabChange} />

      {/* ═══════════════════════════════════════════════════════
          OVERVIEW TAB
          ═══════════════════════════════════════════════════════ */}
      {activeTab === 'overview' && (
        <div className="flex flex-col gap-6">

          {/* Activity chips */}
          <div
            className="relative overflow-hidden rounded-2xl p-4"
            style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}
          >
            <div className="flex flex-wrap gap-2">
              {[
                { icon: Layers,      label: `${receipts.length} receipt${receipts.length !== 1 ? 's' : ''}`,  accent: 'var(--receipt-accent)', tab: 'receipts' as Tab },
                { icon: TrendingUp,  label: `${streams.length} stream${streams.length !== 1 ? 's' : ''}`,     accent: 'var(--vest-accent)',    tab: 'streams'  as Tab },
                { icon: Users,       label: `${bills.length} bill${bills.length !== 1 ? 's' : ''}`,           accent: 'var(--split-accent)',   to: '/split'           },
                { icon: ShieldCheck, label: `${proposals} proposal${proposals !== 1 ? 's' : ''}`,             accent: 'var(--pay-accent)',     to: '/multisig'        },
              ].map(({ icon: Icon, label, accent, tab, to }) => (
                tab ? (
                  <button
                    key={label}
                    onClick={() => handleTabChange(tab)}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-medium transition-all hover:opacity-80"
                    style={{
                      background: `color-mix(in srgb, ${accent} 10%, var(--surface))`,
                      border: `1px solid color-mix(in srgb, ${accent} 22%, transparent)`,
                      color: accent,
                    }}
                  >
                    <Icon size={11} />{label}
                  </button>
                ) : (
                  <Link
                    key={label}
                    to={to}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-medium transition-all hover:opacity-80"
                    style={{
                      background: `color-mix(in srgb, ${accent} 10%, var(--surface))`,
                      border: `1px solid color-mix(in srgb, ${accent} 22%, transparent)`,
                      color: accent,
                    }}
                  >
                    <Icon size={11} />{label}
                  </Link>
                )
              ))}
            </div>
          </div>

          {/* Stat cards */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <StatCard label="Receipts"   value={receipts.length.toString()}  sub="Batches sent" icon={Layers}      accentColor="var(--receipt-accent)" />
            <StatCard label="Streams"    value={streams.length.toString()}   sub="Vesting"      icon={TrendingUp}  accentColor="var(--vest-accent)"    />
            <StatCard label="Bills"      value={bills.length.toString()}     sub="Split"        icon={Users}       accentColor="var(--split-accent)"   />
            <StatCard label="Proposals"  value={proposals.toString()}        sub="Multi-sig"    icon={ShieldCheck} accentColor="var(--pay-accent)"     />
          </div>

          {/* Detail sections */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <Section icon={TrendingUp}  title="Vesting Streams"     accent="var(--vest-accent)">
              <VestingSection address={address} />
            </Section>
            <Section icon={ShieldCheck} title="Multi-Sig Proposals" accent="var(--pay-accent)">
              <MultiSigSection address={address} />
            </Section>
            <Section icon={Users}       title="Bill Splitter"       accent="var(--split-accent)">
              <BillsSection address={address} />
            </Section>
            <Section icon={Send}        title="Batch Payouts"       accent="var(--receipt-accent)">
              <ReceiptsSummarySection address={address} />
            </Section>
          </div>

          {/* Contract addresses */}
          <details className="mt-2">
            <summary className="text-xs cursor-pointer flex items-center gap-1.5 select-none"
              style={{ color: 'var(--subtle)' }}>
              <AlertCircle size={11} />Contract addresses
            </summary>
            <div className="mt-3 rounded-2xl p-4 flex flex-col gap-2"
              style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
              {[
                { label: 'BatchPayout',       addr: BATCH_PAYOUT_ADDRESS   },
                { label: 'ReceiptNFT',        addr: RECEIPT_NFT_ADDRESS    },
                { label: 'VestingStream',     addr: VESTING_STREAM_ADDRESS },
                { label: 'BillSplitter V3',   addr: BILL_SPLITTER_ADDRESS  },
                { label: 'MultiSigPayout V2', addr: MULTISIG_ADDRESS       },
              ].map(({ label, addr }) => (
                <div key={addr} className="flex items-center justify-between gap-3">
                  <span className="text-[10px] font-semibold uppercase tracking-wide shrink-0"
                    style={{ color: 'var(--subtle)' }}>{label}</span>
                  <a href={`https://explorer.arc.io/address/${addr}`} target="_blank" rel="noopener noreferrer"
                    className="flex items-center gap-1 text-[10px] font-mono hover:underline"
                    style={{ color: 'var(--accent)' }}>
                    {addr.slice(0, 10)}…{addr.slice(-6)}
                    <Clock size={9} />
                  </a>
                </div>
              ))}
            </div>
          </details>
        </div>
      )}

      {/* ═══════════════════════════════════════════════════════
          MY STREAMS TAB
          ═══════════════════════════════════════════════════════ */}
      {activeTab === 'streams' && <MyStreamsTab address={address} />}

      {/* ═══════════════════════════════════════════════════════
          RECEIPTS TAB
          ═══════════════════════════════════════════════════════ */}
      {activeTab === 'receipts' && <ReceiptsTab address={address} />}

      {/* ═══════════════════════════════════════════════════════
          INVOICES TAB
          ═══════════════════════════════════════════════════════ */}
      {activeTab === 'invoices' && (
        <div className="flex flex-col gap-6">
          <InvoiceDashboard />
        </div>
      )}
    </div>
  )
}
