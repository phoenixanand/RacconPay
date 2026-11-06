/**
 * Loads every V2-style stream a wallet is part of on one vesting contract,
 * plus that wallet's pending (post-cancel) withdrawal balance.
 */
import { useReadContract, useReadContracts } from 'wagmi'
import { VESTING_STREAM_V2_YIELD_ABI as VESTING_ABI } from '../../abisV2Yield'
import type { StreamV2 } from './shared'

export interface StreamItem {
  id: bigint
  stream: StreamV2
  contract: `0x${string}`
  hasYield: boolean
}

export function useContractStreams(
  contract: `0x${string}` | undefined,
  chainId: number,
  wallet: `0x${string}`,
  hasYield: boolean,
) {
  const enabled = !!contract
  const common = { address: contract ?? '0x0000000000000000000000000000000000000000', abi: VESTING_ABI, chainId } as const

  const ids = useReadContract({ ...common, functionName: 'streamsOf', args: [wallet], query: { enabled } })
  const pending = useReadContract({ ...common, functionName: 'pendingWithdrawals', args: [wallet], query: { enabled } })
  const idList = (ids.data ?? [])

  const streams = useReadContracts({
    contracts: idList.map(id => ({ ...common, functionName: 'getStream' as const, args: [id] as const })),
    query: { enabled: enabled && idList.length > 0 },
  })

  const items: StreamItem[] = idList
    .map((id, i) => ({ id, stream: streams.data?.[i]?.result }))
    .filter((s): s is { id: bigint; stream: StreamV2 } => !!s.stream)
    .map(s => ({ ...s, contract: contract as `0x${string}`, hasYield }))

  const refetch = () => { void ids.refetch(); void pending.refetch(); void streams.refetch() }
  return { items, pending: pending.data ?? 0n, loading: enabled && ids.isLoading, refetch }
}
