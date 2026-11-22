/**
 * Transactions made from this browser, kept in localStorage per wallet. Each entry is written only after
 * the transaction is confirmed on-chain. Nothing here is invented; it is a record of confirmed hashes.
 */
import { useEffect, useSyncExternalStore } from 'react'

export type TxKind =
  | 'Batch payout' | 'Vesting' | 'Group expense' | 'Approval' | 'Invoice' | 'Escrow' | 'Swap' | 'Bridge' | 'Other'

export type TxScope = 'business' | 'personal'
export type TxStatus = 'confirmed' | 'pending' | 'failed'

/** Business or Personal, decided by what kind of transaction it is. */
export function scopeOf(kind: TxKind): TxScope {
  return kind === 'Group expense' || kind === 'Swap' || kind === 'Bridge' ? 'personal' : 'business'
}

export interface TxLogEntry {
  hash: `0x${string}`
  kind: TxKind
  /** Short description such as "Created stream" or "Approved proposal 3". */
  detail: string
  /** Unix seconds when we saw it confirmed. */
  ts: number
  /** USDC amount in 6-decimal units, as a decimal string, when the page knows it. */
  amountRaw?: string
  /** Token symbol, for example USDC, EURC or cirBTC. */
  token?: string
  /** Decimals of `amountRaw`. Defaults to 6 (USDC and EURC). */
  decimals?: number
  /** Chain the hash belongs to. Defaults to Arc Mainnet. */
  chainId?: number
  /** Bridges only: the hash of the mint on the destination chain, and its chain. */
  counterHash?: `0x${string}`
  counterChainId?: number
  /** Human label such as "Base to Arc", and ready-made explorer links for chains the app does not model by chain id (Solana). */
  network?: string
  url?: string
  counterUrl?: string
  /** Defaults to confirmed. A bridge that has burned but not minted yet is pending. */
  status?: TxStatus
}

const keyOf = (address: string) => `racconpay:txlog:v1:${address.toLowerCase()}`
const listeners = new Set<() => void>()
let version = 0
const cache = new Map<string, { raw: string | null; parsed: TxLogEntry[] }>()

export function readTxLog(address: string | undefined): TxLogEntry[] {
  if (!address) return []
  let raw: string | null = null
  try { raw = localStorage.getItem(keyOf(address)) } catch { return [] }
  const hit = cache.get(address)
  if (hit && hit.raw === raw) return hit.parsed
  let parsed: TxLogEntry[] = []
  try { parsed = raw ? (JSON.parse(raw) as TxLogEntry[]) : [] } catch { parsed = [] }
  cache.set(address, { raw, parsed })
  return parsed
}

export function recordTx(address: string | undefined, input: Omit<TxLogEntry, 'ts'> & { ts?: number }): void {
  if (!address) return
  const entry: TxLogEntry = { ...input, ts: input.ts ?? Math.floor(Date.now() / 1000) }
  const list = readTxLog(address)
  const same = list.find(e => e.hash.toLowerCase() === entry.hash.toLowerCase())
  // A bridge entry may move from pending to confirmed once the destination mint lands. Nothing else is rewritten.
  if (same && same.status === entry.status && same.counterHash === entry.counterHash) return
  const next = [entry, ...list.filter(e => e !== same)].slice(0, 500)
  try { localStorage.setItem(keyOf(address), JSON.stringify(next)) } catch { return }
  version += 1
  listeners.forEach(l => l())
}

export function clearTxLog(address: string | undefined): void {
  if (!address) return
  try { localStorage.removeItem(keyOf(address)) } catch { return }
  version += 1
  listeners.forEach(l => l())
}

const subscribe = (cb: () => void) => { listeners.add(cb); return () => { listeners.delete(cb) } }

/** Live view of the log for a wallet. */
export function useTxLog(address: string | undefined): TxLogEntry[] {
  useSyncExternalStore(subscribe, () => version, () => 0)
  return readTxLog(address)
}

/**
 * Call next to an existing useWaitForTransactionReceipt result. Records the hash once it is confirmed.
 * It only observes; it never sends or changes a transaction.
 */
export function useRecordTx(params: {
  address: string | undefined
  hash: `0x${string}` | undefined
  confirmed: boolean
  kind: TxKind
  detail: string
  amountRaw?: bigint
  token?: 'USDC' | 'EURC'
  chainId?: number
}): void {
  const { address, hash, confirmed, kind, detail, amountRaw, token, chainId } = params
  useEffect(() => {
    if (!confirmed || !hash || !address) return
    recordTx(address, { hash, kind, detail, amountRaw: amountRaw?.toString(), token, chainId })
  }, [confirmed, hash, address, kind, detail, amountRaw, token, chainId])
}
