/**
 * Data layer for the vesting console: every stream the wallet is part of (plain + yield
 * contracts), live metrics from the contract, yield details, and pending leave requests.
 * All figures come from the chain; nothing is simulated.
 */
import { useReadContracts } from 'wagmi'
import { VESTING_STREAM_V2_YIELD_ABI as VESTING_ABI } from '../../abisV2Yield'
import { useContractStreams, type StreamItem } from './useStreams'
import { LEAVE_STATUS, type BreakV2, type LeaveRequestV2 } from './shared'

export interface StreamMetrics {
  vested: bigint
  claimable: bigint
  effectiveEnd: bigint
  breaks: BreakV2[]
  requestIds: readonly bigint[]
}

export interface YieldMetrics {
  useYield: boolean
  idle: bigint
  shares: bigint
  valueNow: bigint
  yieldEarned: bigint
  debt: bigint
}

export interface ConsoleStream extends StreamItem {
  key: string
  metrics?: StreamMetrics
  yieldInfo?: YieldMetrics
}

export interface PendingLeave { stream: ConsoleStream; requestId: bigint; req: LeaveRequestV2 }

export type StreamStatus = 'active' | 'paused' | 'vested' | 'completed' | 'cancelled'

export function streamStatus(s: ConsoleStream, now: bigint): StreamStatus {
  if (s.stream.cancelled) return 'cancelled'
  if (s.stream.claimedAmount >= s.stream.totalAmount) return 'completed'
  const m = s.metrics
  if (m && m.vested >= s.stream.totalAmount) return 'vested'
  if (m?.breaks.some(b => now >= b.start && now < b.end)) return 'paused'
  return 'active'
}

export const STATUS_LABEL: Record<StreamStatus, string> = {
  active: 'Active', paused: 'On pause', vested: 'Fully vested', completed: 'Completed', cancelled: 'Cancelled',
}

/** Vested share of a stream as a percentage (0-100). */
export function vestedPct(s: ConsoleStream): number {
  const total = s.stream.totalAmount
  if (total === 0n) return 0
  const vested = s.stream.cancelled ? s.stream.finalVested : (s.metrics?.vested ?? 0n)
  return Number((vested * 10000n) / total) / 100
}

const METRIC_FNS = ['vestedAmount', 'claimableAmount', 'effectiveEndTime', 'getBreaks', 'getLeaveRequestIds'] as const
const MAX_REQUEST_LOOKUPS = 200

export function useConsoleData(
  wallet: `0x${string}`,
  chainId: number,
  plainAddress: `0x${string}`,
  yieldAddress?: `0x${string}`,
) {
  const plain = useContractStreams(plainAddress, chainId, wallet, false)
  const yielding = useContractStreams(yieldAddress, chainId, wallet, true)
  const items = [...plain.items, ...yielding.items]

  // 1. Per-stream metrics (5 reads per stream, batched into one multicall).
  const metricsQ = useReadContracts({
    contracts: items.flatMap(it =>
      METRIC_FNS.map(functionName => ({ address: it.contract, abi: VESTING_ABI, functionName, args: [it.id], chainId }))),
    query: { enabled: items.length > 0, refetchInterval: 15_000 },
  })

  // 2. Yield details for yield-enabled streams.
  const yieldItems = items.filter(it => it.hasYield)
  const yieldQ = useReadContracts({
    contracts: yieldItems.map(it => ({
      address: it.contract, abi: VESTING_ABI, functionName: 'getYieldInfo' as const, args: [it.id] as const, chainId,
    })),
    query: { enabled: yieldItems.length > 0, refetchInterval: 15_000 },
  })

  const streams: ConsoleStream[] = items.map((it, i) => {
    const r = metricsQ.data
    const ok = r && r[i * 5]?.status === 'success'
    const metrics: StreamMetrics | undefined = ok ? {
      vested: r[i * 5].result as bigint,
      claimable: (r[i * 5 + 1]?.result as bigint | undefined) ?? 0n,
      effectiveEnd: (r[i * 5 + 2]?.result as bigint | undefined) ?? it.stream.endTime,
      breaks: [...((r[i * 5 + 3]?.result as readonly BreakV2[] | undefined) ?? [])],
      requestIds: (r[i * 5 + 4]?.result as readonly bigint[] | undefined) ?? [],
    } : undefined

    let yieldInfo: YieldMetrics | undefined
    if (it.hasYield) {
      const yi = yieldQ.data?.[yieldItems.indexOf(it)]?.result
      if (yi) yieldInfo = { useYield: yi[0], idle: yi[1], shares: yi[2], valueNow: yi[3], yieldEarned: yi[4], debt: yi[5] }
    }
    return { ...it, key: `${it.contract}-${it.id}`, metrics, yieldInfo }
  })

  // 3. Leave requests of every stream, so pending ones can be shown in the inbox.
  const lookups = streams
    .flatMap(s => (s.metrics?.requestIds ?? []).map(requestId => ({ stream: s, requestId })))
    .slice(-MAX_REQUEST_LOOKUPS)
  const requestsQ = useReadContracts({
    contracts: lookups.map(l => ({
      address: l.stream.contract, abi: VESTING_ABI, functionName: 'getLeaveRequest' as const, args: [l.requestId] as const, chainId,
    })),
    query: { enabled: lookups.length > 0, refetchInterval: 15_000 },
  })

  const pendingLeaves: PendingLeave[] = lookups
    .map((l, i) => ({ ...l, req: requestsQ.data?.[i]?.result }))
    .filter((l): l is PendingLeave => !!l.req && l.req.status === LEAVE_STATUS.Pending && !l.stream.stream.cancelled)

  const refetch = () => {
    plain.refetch(); yielding.refetch()
    void metricsQ.refetch(); void yieldQ.refetch(); void requestsQ.refetch()
  }

  return {
    streams,
    pendingLeaves,
    pendingWithdrawals: { plain: plain.pending, yielding: yielding.pending },
    loading: plain.loading || yielding.loading,
    refetch,
  }
}
