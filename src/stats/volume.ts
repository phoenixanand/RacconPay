/**
 * Volume = USDC and EURC paid into the RacconPay contracts: every token Transfer whose recipient is one of the
 * contracts and whose sender is not (money moving between our own contracts is not counted twice). Batch payouts,
 * vesting deposits, escrow funding, bill settlements and approval-request payouts all enter a contract once.
 * Payments that fail on-chain and are refunded to the payer are still counted, so it can read a little high.
 */
import { parseAbiItem } from 'viem'
import { statsClient, type StatsClient } from './clients'
import { TOKENS } from '../tokens'
import type { StatContract } from './contracts'
import { getHead, getVolumeState, notify, persistVolumeState, setHead } from './store'
import { isRateLimit, scanConfig, throttled } from './scan'

const TRANSFER = parseAbiItem('event Transfer(address indexed from, address indexed to, uint256 value)')
const CHUNK = 4_999
const MIN_SPLIT = 250n

interface TransferLog { address: `0x${string}`; args: { from?: `0x${string}`; to?: `0x${string}`; value?: bigint } }

async function transfersInRange(client: StatsClient, tokens: `0x${string}`[], to: `0x${string}`[], from: bigint, end: bigint): Promise<TransferLog[]> {
  try {
    return await throttled(() => client.getLogs({ address: tokens, event: TRANSFER, args: { to }, fromBlock: from, toBlock: end }))
  } catch (e) {
    if (isRateLimit(e) || end - from <= MIN_SPLIT) throw e
    const mid = (from + end) / 2n
    const [a, b] = await Promise.all([
      transfersInRange(client, tokens, to, from, mid),
      transfersInRange(client, tokens, to, mid + 1n, end),
    ])
    return [...a, ...b]
  }
}

let inflight: Promise<void> | undefined

/** Read new blocks since the cached volume. Safe to call repeatedly; one run at a time. */
export function syncVolume(chainId: number, contracts: StatContract[]): Promise<void> {
  if (inflight) return inflight
  inflight = run(chainId, contracts).finally(() => { inflight = undefined })
  return inflight
}

async function run(chainId: number, contracts: StatContract[]): Promise<void> {
  const usdc = TOKENS.USDC.address[chainId]
  const eurc = TOKENS.EURC.address[chainId]
  if (!usdc || !eurc) throw new Error('Stablecoins are not configured for this chain')
  const client = statsClient(chainId)
  const own = new Set(contracts.map(c => c.address.toLowerCase()))
  const to = contracts.map(c => c.address)
  const startBlock = Math.min(...contracts.map(c => c.deployBlock))

  const head = getHead(chainId) ?? Number(await throttled(() => client.getBlockNumber()))
  setHead(chainId, head)
  const state = getVolumeState(chainId)
  let from = Math.max(state.lastBlock + 1, startBlock)

  while (from <= head) {
    const ranges: [number, number][] = []
    for (let i = 0; i < scanConfig.parallel; i++) {
      const start = from + i * (CHUNK + 1)
      if (start > head) break
      ranges.push([start, Math.min(start + CHUNK, head)])
    }
    const results = await Promise.all(ranges.map(([a, b]) => transfersInRange(client, [usdc, eurc], to, BigInt(a), BigInt(b))))
    for (const logs of results) {
      for (const l of logs) {
        const sender = l.args.from?.toLowerCase()
        const value = l.args.value
        if (!sender || value === undefined || own.has(sender)) continue
        if (l.address.toLowerCase() === usdc.toLowerCase()) state.usdc += value
        else state.eurc += value
      }
    }
    state.lastBlock = ranges[ranges.length - 1][1]
    from = state.lastBlock + 1
    persistVolumeState(chainId)
    notify()
  }
}
