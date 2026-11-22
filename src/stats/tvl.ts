/**
 * TVL = USDC + EURC held by the RacconPay contracts, plus the Aave V4 vault position of VestingStreamV2Yield.
 * Both balances are read through the 6-decimal ERC-20 view (never the 18-decimal native USDC view).
 * EURC is reported as its own unit, not converted to dollars.
 */
import { erc20Abi, parseAbi } from 'viem'
import { statsClient } from './clients'
import { TOKENS } from '../tokens'
import { YIELD_VAULT, type StatContract } from './contracts'
import { throttled } from './scan'

const vaultAbi = parseAbi([
  'function balanceOf(address) view returns (uint256)',
  'function convertToAssets(uint256 shares) view returns (uint256)',
])

export interface Tvl { usdc: bigint; eurc: bigint }

export async function readTvl(chainId: number, contracts: StatContract[]): Promise<Tvl> {
  const client = statsClient(chainId)
  const usdcAddr = TOKENS.USDC.address[chainId]
  const eurcAddr = TOKENS.EURC.address[chainId]
  if (!usdcAddr || !eurcAddr) throw new Error('Stablecoins are not configured for this chain')
  const holders = contracts.filter(c => c.holdsFunds)

  // One multicall for every balance (the RPC counts calls, so this keeps the home page well under its limit).
  const calls = holders.flatMap(h => [
    { address: usdcAddr, abi: erc20Abi, functionName: 'balanceOf' as const, args: [h.address] as const },
    { address: eurcAddr, abi: erc20Abi, functionName: 'balanceOf' as const, args: [h.address] as const },
  ])
  const results = await throttled(() => client.multicall({ contracts: calls, allowFailure: false }))

  let usdc = 0n
  let eurc = 0n
  results.forEach((v, i) => { if (i % 2 === 0) usdc += v; else eurc += v })

  if (holders.some(h => h.address === YIELD_VAULT.holder)) {
    const shares = await throttled(() => client.readContract({
      address: YIELD_VAULT.vault, abi: vaultAbi, functionName: 'balanceOf', args: [YIELD_VAULT.holder],
    }))
    if (shares > 0n) {
      usdc += await throttled(() => client.readContract({
        address: YIELD_VAULT.vault, abi: vaultAbi, functionName: 'convertToAssets', args: [shares],
      }))
    }
  }
  return { usdc, eurc }
}
