/**
 * Event scanner: walks each contract's logs forward from its deployment block in bounded ranges
 * (the Arc RPC rejects ranges much above 5,000 blocks), and records unique transactions and wallets.
 */
import type { Log } from 'viem'
import { statsClient, type StatsClient } from './clients'
import { getContractState, persistContractState, setHead, notify } from './store'
import type { StatContract } from './contracts'

const CHUNK = 4_999
const MIN_SPLIT = 250
/**
 * The public Arc RPC allows only a couple of calls per second (measured: about 2 per second holds, 4 per second
 * trips "rate limit exceeded"), so every call goes through one queue with a minimum gap and backs off when limited.
 */
export const scanConfig = {
  /** Minimum spacing between calls; 0 disables the shared queue (for a fast, private endpoint). */
  minGapMs: 450,
  /** Block ranges read at once per contract. */
  parallel: 1,
}
const MAX_RETRIES = 6

let queue: Promise<unknown> = Promise.resolve()
const sleep = (ms: number) => new Promise(r => setTimeout(r, ms))

export const isRateLimit = (e: unknown) => /rate limit|429|too many/i.test(e instanceof Error ? `${e.message} ${(e as { details?: string }).details ?? ''}` : String(e))

/** Run an RPC call in the shared queue: spaced calls, with exponential backoff while the RPC says "rate limit". */
export function throttled<T>(fn: () => Promise<T>): Promise<T> {
  const queued = scanConfig.minGapMs > 0
  const run = async (): Promise<T> => {
    for (let attempt = 0; ; attempt++) {
      try {
        const out = await fn()
        if (queued) await sleep(scanConfig.minGapMs)
        return out
      } catch (e) {
        if (!isRateLimit(e) || attempt >= MAX_RETRIES) throw e
        await sleep(1000 * 2 ** attempt)
      }
    }
  }
  if (!queued) return run()
  const next = queue.then(run, run)
  queue = next.catch(() => undefined)
  return next
}

/** getLogs over [from, to]. When the RPC rejects the range as too large, split it in half and read both halves. */
export async function logsInRange(client: StatsClient, address: `0x${string}`, from: bigint, to: bigint): Promise<Log[]> {
  try {
    return await throttled(() => client.getLogs({ address, fromBlock: from, toBlock: to }))
  } catch (e) {
    if (isRateLimit(e) || to - from <= BigInt(MIN_SPLIT)) throw e
    const mid = (from + to) / 2n
    const [a, b] = await Promise.all([
      logsInRange(client, address, from, mid),
      logsInRange(client, address, mid + 1n, to),
    ])
    return [...a, ...b]
  }
}

const ZERO = '0x0000000000000000000000000000000000000000'

/** Indexed address arguments appear as 32-byte topics padded with 12 zero bytes. Small numbers (ids) are skipped. */
export function addressesFromTopics(topics: readonly string[]): string[] {
  const out: string[] = []
  for (const t of topics.slice(1)) {
    if (t.length !== 66 || !t.startsWith('0x000000000000000000000000')) continue
    if (/^0+$/.test(t.slice(26, 42))) continue // upper address bytes zero: an id or amount, not a wallet
    const addr = `0x${t.slice(26)}`.toLowerCase()
    if (addr !== ZERO) out.push(addr)
  }
  return out
}

/** Scan one contract forward from its last cached block. Safe to call repeatedly. */
async function scanContract(chainId: number, c: StatContract, head: number): Promise<void> {
  const client = statsClient(chainId)
  const state = getContractState(chainId, c.address)
  let from = Math.max(state.lastBlock + 1, c.deployBlock)

  while (from <= head) {
    const ranges: [number, number][] = []
    for (let i = 0; i < scanConfig.parallel; i++) {
      const start = from + i * (CHUNK + 1)
      if (start > head) break
      ranges.push([start, Math.min(start + CHUNK, head)])
    }
    const results = await Promise.all(ranges.map(([a, b]) => logsInRange(client, c.address, BigInt(a), BigInt(b))))
    for (const logs of results) {
      for (const l of logs) {
        if (l.transactionHash) state.txs.add(l.transactionHash.slice(2, 18))
        for (const u of addressesFromTopics(l.topics)) state.users.add(u)
      }
    }
    // Only advance past ranges that were all read, so a failed range is retried next run.
    state.lastBlock = ranges[ranges.length - 1][1]
    from = state.lastBlock + 1
    persistContractState(chainId, c.address)
    notify()
  }
}

const inflight = new Map<string, Promise<void>>()

/** Sync contracts (deduplicated per contract). Calls are spaced by the shared queue, so contracts run one after another. */
export async function syncContracts(chainId: number, contracts: StatContract[]): Promise<void> {
  const client = statsClient(chainId)
  const head = Number(await throttled(() => client.getBlockNumber()))
  setHead(chainId, head)
  notify()

  for (const c of contracts) {
    const key = `${chainId}:${c.address.toLowerCase()}`
    let p = inflight.get(key)
    if (!p) {
      p = scanContract(chainId, c, head).finally(() => inflight.delete(key))
      inflight.set(key, p)
    }
    await p
  }
}
