/**
 * Read-only network fee estimate for a contract call, shown before the user signs.
 * Arc gas is paid in USDC using the 18-decimal native balance, so the result is formatted with 18 decimals
 * and is never mixed with 6-decimal token amounts.
 */
import { useQuery } from '@tanstack/react-query'
import { usePublicClient } from 'wagmi'
import type { Abi, Address } from 'viem'
import { ARC_CHAIN_ID } from '../constants'

export interface FeeCall {
  address: Address
  abi: Abi
  functionName: string
  args: readonly unknown[]
  account: Address
}

export function useFeeEstimate(call: FeeCall | undefined) {
  const client = usePublicClient({ chainId: ARC_CHAIN_ID })
  return useQuery({
    queryKey: ['fee-estimate', call?.address, call?.functionName, call?.account, JSON.stringify(call?.args, (_k, v: unknown) => (typeof v === 'bigint' ? v.toString() : v))],
    enabled: !!client && !!call,
    retry: false,
    staleTime: 30_000,
    queryFn: async () => {
      if (!client || !call) return null
      const [gas, gasPrice] = await Promise.all([
        client.estimateContractGas({ address: call.address, abi: call.abi, functionName: call.functionName, args: call.args, account: call.account }),
        client.getGasPrice(),
      ])
      return gas * gasPrice // wei of native USDC (18 decimals)
    },
  })
}
