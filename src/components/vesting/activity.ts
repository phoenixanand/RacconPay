/**
 * Activity ledger: reads contract event logs for the wallet's streams and turns them into a CSV.
 * Scans forward from the contract's deployment block (never from block 0) in bounded ranges.
 */
import { parseEventLogs, type Hash, type PublicClient } from 'viem'
import { VESTING_STREAM_V2_YIELD_ABI } from '../../abisV2Yield'
import { formatUsdc } from '../../utils'
import { toCsv } from './exportCsv'

export interface ActivityTarget {
  contract: `0x${string}`
  /** Deployment transaction, used to find the first block to scan. */
  deployTx?: Hash
  streamIds: Set<bigint>
}

export interface ActivityProgress { scanned: bigint; total: bigint; found: number }

const USDC_KEYS = new Set(['totalAmount', 'amount', 'returnedToGrantor', 'paidToBeneficiary', 'assets', 'paid', 'owed'])
const TIME_KEYS = new Set(['start', 'end', 'startTime', 'endTime', 'newEffectiveEnd'])
const HIDE_KEYS = new Set(['streamId'])
const FALLBACK_LOOKBACK = 5_000n

function describe(args: Record<string, unknown> | undefined): string {
  if (!args) return ''
  return Object.entries(args)
    .filter(([k]) => !HIDE_KEYS.has(k) && !/^\d+$/.test(k))
    .map(([k, v]) => {
      if (typeof v === 'bigint' && USDC_KEYS.has(k)) return `${k}=${formatUsdc(v)} USDC`
      if (typeof v === 'bigint' && TIME_KEYS.has(k)) return `${k}=${new Date(Number(v) * 1000).toISOString()}`
      return `${k}=${String(v)}`
    })
    .join('; ')
}

/** getLogs over [from, to], halving the range when the RPC rejects it. */
async function logsInRange(client: PublicClient, address: `0x${string}`, from: bigint, to: bigint) {
  let span = to - from
  for (;;) {
    try {
      return await client.getLogs({ address, fromBlock: from, toBlock: from + span })
    } catch (e) {
      if (span <= 250n) throw e
      span = span / 2n
    }
  }
}

export async function buildActivityCsv(
  client: PublicClient,
  networkName: string,
  wallet: string,
  targets: ActivityTarget[],
  onProgress: (p: ActivityProgress) => void,
): Promise<string> {
  const head = await client.getBlockNumber()
  const events: { block: bigint; index: number; contract: string; name: string; streamId: string; details: string; tx: string }[] = []

  const starts = await Promise.all(targets.map(async t => {
    if (t.deployTx) {
      try { return (await client.getTransactionReceipt({ hash: t.deployTx })).blockNumber } catch { /* fall through */ }
    }
    return head > FALLBACK_LOOKBACK ? head - FALLBACK_LOOKBACK : 0n
  }))

  const total = targets.reduce((a, _t, i) => a + (head - starts[i] + 1n), 0n)
  let scanned = 0n

  for (const [i, t] of targets.entries()) {
    let from = starts[i]
    while (from <= head) {
      const to = from + 4_999n > head ? head : from + 4_999n
      const logs = await logsInRange(client, t.contract, from, to)
      const parsed = parseEventLogs({ abi: VESTING_STREAM_V2_YIELD_ABI, logs, strict: false })
      for (const l of parsed) {
        const args = l.args as Record<string, unknown> | undefined
        const sid = args?.streamId
        const isMine = typeof sid === 'bigint' ? t.streamIds.has(sid)
          : l.eventName === 'Withdrawn' && String(args?.recipient).toLowerCase() === wallet.toLowerCase()
        if (!isMine || l.blockNumber === null) continue
        events.push({
          block: l.blockNumber, index: l.logIndex ?? 0, contract: t.contract, name: String(l.eventName),
          streamId: typeof sid === 'bigint' ? sid.toString() : '', details: describe(args), tx: l.transactionHash ?? '',
        })
      }
      scanned += to - from + 1n
      onProgress({ scanned, total, found: events.length })
      from = to + 1n
    }
  }

  events.sort((a, b) => (a.block === b.block ? a.index - b.index : a.block < b.block ? -1 : 1))

  // Block timestamps, a few at a time.
  const times = new Map<bigint, string>()
  const blocks = [...new Set(events.map(e => e.block))]
  for (let i = 0; i < blocks.length; i += 10) {
    await Promise.all(blocks.slice(i, i + 10).map(async b => {
      try { times.set(b, new Date(Number((await client.getBlock({ blockNumber: b })).timestamp) * 1000).toISOString()) }
      catch { times.set(b, '') }
    }))
  }

  return toCsv(
    ['time_utc', 'block', 'network', 'contract', 'stream_id', 'event', 'details', 'tx_hash'],
    events.map(e => [times.get(e.block) ?? '', e.block, networkName, e.contract, e.streamId, e.name, e.details, e.tx]),
  )
}
