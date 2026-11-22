/**
 * Activity rows for the Overview and Transaction History. Sources, all real:
 *  - on-chain batch receipts for the wallet (ReceiptNFT reads),
 *  - confirmed transactions recorded in this browser,
 *  - optionally the Arc explorer API, when the browser can reach it.
 */
import { useEffect, useMemo, useState } from 'react'
import { useReadContract, useReadContracts } from 'wagmi'
import {
  ARC_CHAIN_ID, RECEIPT_NFT_ADDRESS, BATCH_PAYOUT_ADDRESS, VESTING_STREAM_ADDRESS,
  VESTING_STREAM_V2_ADDRESS, VESTING_STREAM_V2_YIELD_ADDRESS, BILL_SPLITTER_ADDRESS, MULTISIG_ADDRESS, ESCROW_ADDRESS,
} from '../constants'
import { RECEIPT_NFT_ABI } from '../abis'
import { useTxLog, scopeOf, type TxKind, type TxScope } from './txlog'

export type ActivityStatus = 'confirmed' | 'pending' | 'failed'

export interface ActivityRow {
  id: string
  /** Unix seconds. */
  ts: number
  type: TxKind
  detail: string
  /** Token units, when known. Decimals default to 6 (USDC and EURC). */
  amountRaw?: bigint
  token?: string
  decimals?: number
  status: ActivityStatus
  scope: TxScope
  /** Chain the hash belongs to. Defaults to Arc Mainnet. */
  chainId?: number
  hash?: `0x${string}`
  /** Bridges: the destination-chain mint, once it has happened. */
  counterHash?: `0x${string}`
  counterChainId?: number
  network?: string
  url?: string
  counterUrl?: string
  source: 'receipt' | 'local' | 'explorer'
}

const ZERO = '0x0000000000000000000000000000000000000000' as const

/** Name shown to people. Group expenses are called Bill Split in the app. */
export function typeLabel(kind: TxKind): string {
  return kind === 'Group expense' ? 'Bill Split' : kind
}

/** The wallet's batch payouts, from ReceiptNFT. Capped at the newest 50. */
export function useReceiptActivity(address: `0x${string}` | undefined) {
  const { data: tokenIds, isLoading: idsLoading, isError: idsError, refetch } = useReadContract({
    address: RECEIPT_NFT_ADDRESS, abi: RECEIPT_NFT_ABI, functionName: 'receiptsOf',
    args: [address ?? ZERO], chainId: ARC_CHAIN_ID, query: { enabled: !!address },
  })
  const ids = useMemo(() => ((tokenIds as bigint[] | undefined) ?? []).slice(-50), [tokenIds])
  const { data, isLoading: recLoading } = useReadContracts({
    contracts: ids.map(id => ({
      address: RECEIPT_NFT_ADDRESS as `0x${string}`, abi: RECEIPT_NFT_ABI,
      functionName: 'getReceipt' as const, args: [id] as const, chainId: ARC_CHAIN_ID,
    })),
    query: { enabled: ids.length > 0 },
  })

  const rows = useMemo<ActivityRow[]>(() => {
    const out: ActivityRow[] = []
    data?.forEach((r, i) => {
      if (r.status !== 'success') return
      const rec = r.result as { batchTotal: bigint; recipientCount: bigint; timestamp: bigint }
      out.push({
        id: `receipt-${ids[i]}`, ts: Number(rec.timestamp), type: 'Batch payout',
        detail: `${rec.recipientCount.toString()} recipient${rec.recipientCount === 1n ? '' : 's'} · receipt #${ids[i]}`,
        amountRaw: rec.batchTotal, token: 'USDC', status: 'confirmed', scope: 'business', chainId: ARC_CHAIN_ID, source: 'receipt',
      })
    })
    return out
  }, [data, ids])

  const totalReceipts = ((tokenIds as bigint[] | undefined) ?? []).length
  const totalSent = rows.reduce((s, r) => s + (r.amountRaw ?? 0n), 0n)
  return { rows, totalReceipts, totalSent, isLoading: !!address && (idsLoading || (ids.length > 0 && recLoading)), isError: idsError, refetch }
}

/** Receipts plus browser-recorded transactions, newest first. A recorded hash never duplicates a receipt row. */
export function useActivity(address: `0x${string}` | undefined) {
  const receipts = useReceiptActivity(address)
  const log = useTxLog(address)
  const rows = useMemo<ActivityRow[]>(() => {
    const local: ActivityRow[] = log
      .filter(e => e.kind !== 'Batch payout') // batch payouts already appear as on-chain receipts
      .map(e => ({
        id: `local-${e.hash}`, ts: e.ts, type: e.kind, detail: e.detail,
        amountRaw: e.amountRaw ? BigInt(e.amountRaw) : undefined, token: e.token, decimals: e.decimals,
        status: e.status ?? ('confirmed' as const), scope: scopeOf(e.kind), chainId: e.chainId ?? ARC_CHAIN_ID,
        hash: e.hash, counterHash: e.counterHash, counterChainId: e.counterChainId,
        network: e.network, url: e.url, counterUrl: e.counterUrl, source: 'local' as const,
      }))
    const hashes = new Map(log.filter(e => e.kind === 'Batch payout').map(e => [e.ts, e.hash]))
    const rec = receipts.rows.map(r => {
      // Attach a hash when this browser recorded the batch within a minute of the receipt time.
      const near = [...hashes.entries()].find(([ts]) => Math.abs(ts - r.ts) <= 60)
      return near ? { ...r, hash: near[1] } : r
    })
    return [...rec, ...local].sort((a, b) => b.ts - a.ts)
  }, [receipts.rows, log])
  return { ...receipts, rows }
}

/* ── Arc explorer (optional) ──────────────────────────────────────── */
const EXPLORER_API = 'https://explorer.arc.io/api/v2'

const CONTRACT_KIND: Record<string, TxKind> = {
  [BATCH_PAYOUT_ADDRESS.toLowerCase()]: 'Batch payout',
  [VESTING_STREAM_ADDRESS.toLowerCase()]: 'Vesting',
  [VESTING_STREAM_V2_ADDRESS.toLowerCase()]: 'Vesting',
  [VESTING_STREAM_V2_YIELD_ADDRESS.toLowerCase()]: 'Vesting',
  [BILL_SPLITTER_ADDRESS.toLowerCase()]: 'Group expense',
  [MULTISIG_ADDRESS.toLowerCase()]: 'Approval',
  [ESCROW_ADDRESS.toLowerCase()]: 'Escrow',
}

interface ExplorerTx {
  hash: string
  method?: string | null
  status?: string | null
  result?: string | null
  timestamp?: string | null
  to?: { hash?: string } | null
}

/**
 * Transactions between the wallet and RacconPay contracts, from the Arc explorer API.
 * The explorer may refuse requests from a browser; that is reported as `unavailable`, never hidden.
 */
export function useExplorerActivity(address: `0x${string}` | undefined) {
  const [rows, setRows] = useState<ActivityRow[]>([])
  const [state, setState] = useState<'idle' | 'loading' | 'ready' | 'unavailable'>('idle')

  useEffect(() => {
    if (!address) return
    const ctl = new AbortController()
    const timer = setTimeout(() => ctl.abort(), 8000)
    const run = async () => {
      setState('loading')
      try {
        const res = await fetch(`${EXPLORER_API}/addresses/${address}/transactions?filter=from`, { signal: ctl.signal })
        if (!res.ok) throw new Error(`HTTP ${res.status}`)
        const json = (await res.json()) as { items?: ExplorerTx[] }
        const out: ActivityRow[] = []
        for (const t of json.items ?? []) {
          const kind = t.to?.hash ? CONTRACT_KIND[t.to.hash.toLowerCase()] : undefined
          if (!kind || !t.timestamp) continue
          out.push({
            id: `explorer-${t.hash}`, ts: Math.floor(new Date(t.timestamp).getTime() / 1000), type: kind,
            detail: t.method ? t.method : 'Contract call',
            status: t.status === 'ok' || t.result === 'success' ? 'confirmed' : 'failed',
            hash: t.hash as `0x${string}`, scope: scopeOf(kind), chainId: ARC_CHAIN_ID, source: 'explorer',
          })
        }
        setRows(out)
        setState('ready')
      } catch {
        setRows([])
        setState('unavailable')
      } finally {
        clearTimeout(timer)
      }
    }
    void run()
    return () => { clearTimeout(timer); ctl.abort() }
  }, [address])

  return { rows, state }
}

/** Everything the History page shows: receipts, browser records and explorer rows, de-duplicated by hash. */
export function useFullHistory(address: `0x${string}` | undefined) {
  const activity = useActivity(address)
  const explorer = useExplorerActivity(address)
  const rows = useMemo(() => {
    const byHash = new Map<string, ActivityRow>()
    const noHash: ActivityRow[] = []
    for (const r of [...explorer.rows, ...activity.rows]) {
      if (!r.hash) { noHash.push(r); continue }
      const k = r.hash.toLowerCase()
      const prev = byHash.get(k)
      // Prefer the row that knows the amount, then keep the explorer's status.
      byHash.set(k, prev ? { ...prev, ...r, status: prev.source === 'explorer' ? prev.status : r.status, amountRaw: r.amountRaw ?? prev.amountRaw } : r)
    }
    return [...byHash.values(), ...noHash].sort((a, b) => b.ts - a.ts)
  }, [explorer.rows, activity.rows])
  return { rows, explorerState: explorer.state, isLoading: activity.isLoading, isError: activity.isError, refetch: activity.refetch }
}
