/** Ready-made stats strips for each page, built on StatsRow and the stats hooks. */
import { useMemo } from 'react'
import { useAccount } from 'wagmi'
import { ARC_MAINNET_CONTRACTS, BILL_SPLITTER_STATS_CONTRACTS } from '../stats/contracts'
import { useContractStats } from '../stats/useStats'
import { useSwapHistory } from '../stats/useSwapHistory'
import StatsRow, { formatAmount, formatCount } from './StatsRow'

function tvlText(usdc: bigint | null, eurc: bigint | null): { value: string | null; sub?: string } {
  if (usdc === null || eurc === null) return { value: null }
  return { value: `${formatAmount(usdc)} USDC`, sub: eurc > 0n ? `+ ${formatAmount(eurc)} EURC` : undefined }
}

/** Home page: all RacconPay contracts on Arc Mainnet. */
export function HomeStats({ className }: { className?: string }) {
  const contracts = useMemo(() => ARC_MAINNET_CONTRACTS, [])
  const s = useContractStats(contracts, true)
  const hasData = s.transactions > 0 || !s.syncing
  const volume = s.volumeUsdc === null || s.volumeEurc === null
    ? { value: null as string | null, sub: undefined as string | undefined }
    : { value: `${formatAmount(s.volumeUsdc)} USDC`, sub: s.volumeEurc > 0n ? `+ ${formatAmount(s.volumeEurc)} EURC` : undefined }
  return (
    <StatsRow
      className={className}
      syncing={s.syncing}
      progress={s.progress}
      error={s.error}
      cards={[
        { label: 'Transactions', value: hasData ? formatCount(s.transactions) : null, sub: s.syncing ? 'Counted so far' : undefined },
        { label: 'Users', value: hasData ? formatCount(s.users) : null, sub: s.syncing ? 'Counted so far' : undefined },
        { label: 'Volume', value: volume.value, sub: s.syncing ? 'Counted so far' : volume.sub },
      ]}
    />
  )
}

/** Bill Split page: the live BillSplitter contract. */
export function BillSplitStats() {
  const s = useContractStats(BILL_SPLITTER_STATS_CONTRACTS)
  const tvl = tvlText(s.tvlUsdc, s.tvlEurc)
  const hasData = s.transactions > 0 || !s.syncing
  return (
    <StatsRow
      title="Bill Splitter on Arc Mainnet"
      syncing={s.syncing}
      progress={s.progress}
      error={s.error}
      note="Read directly from the Bill Splitter contract. TVL is the USDC and EURC it currently holds for unsettled bills."
      cards={[
        { label: 'Transactions', value: hasData ? formatCount(s.transactions) : null, sub: s.syncing ? 'Counted so far' : 'Bill Splitter calls' },
        { label: 'Users', value: hasData ? formatCount(s.users) : null, sub: s.syncing ? 'Counted so far' : undefined },
        { label: 'TVL', value: tvl.value, sub: tvl.sub },
      ]}
    />
  )
}

/** Swap page: only this browser's own history, because swaps do not touch a RacconPay contract. */
export function SwapStats({ chainId }: { chainId: number }) {
  const { address } = useAccount()
  const h = useSwapHistory(chainId, address)
  const volume = Object.entries(h.volume).filter(([, v]) => Number(v) > 0)
  return (
    <StatsRow
      title="Your swaps on this wallet"
      cards={[
        { label: 'Swaps', value: address ? formatCount(h.count) : null, sub: address ? undefined : 'Connect a wallet' },
        {
          label: 'Volume paid in',
          value: address ? (volume.length ? volume.map(([sym, v]) => `${v} ${sym}`).join(' · ') : '0') : null,
        },
        {
          label: 'Last swap',
          value: address ? (h.lastAt ? new Date(h.lastAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : 'None yet') : null,
        },
      ]}
    />
  )
}
