/**
 * CCTP transfers that have burned on the source chain but have not been minted on the destination yet.
 * They are saved in this browser the moment the burn is confirmed, so a page reload (or closing the tab) does not
 * lose track of them. The Bridge page lists them and can finish them: the burn is already final, so finishing only
 * asks Circle for the attestation and mints on the destination. It never burns again.
 */
import { useSyncExternalStore } from 'react'
import type { EndpointId } from './chains'

export interface PendingTransfer {
  /** Source-chain burn transaction hash. Unique per transfer. */
  burnTx: string
  /** The connected EVM wallet when the transfer started. */
  account: string
  fromId: EndpointId
  toId: EndpointId
  token: 'USDC' | 'EURC'
  amount: string
  speed: 'FAST' | 'SLOW'
  /** 'forwarder' = Circle mints for you. 'wallet' and 'evm' = your wallet mints on the destination. */
  mode: 'evm' | 'forwarder' | 'wallet'
  recipient: string
  /** Address that sent the burn (an EVM address, or a Solana address for Solana sources). */
  sourceAddress: string
  createdAt: number
}

const keyOf = (account: string) => `racconpay:bridge:pending:v1:${account.toLowerCase()}`
const listeners = new Set<() => void>()
let version = 0
const cache = new Map<string, { raw: string | null; parsed: PendingTransfer[] }>()

export function readPending(account: string | undefined): PendingTransfer[] {
  if (!account) return []
  let raw: string | null = null
  try { raw = localStorage.getItem(keyOf(account)) } catch { return [] }
  const hit = cache.get(account)
  if (hit && hit.raw === raw) return hit.parsed
  let parsed: PendingTransfer[] = []
  try { parsed = raw ? (JSON.parse(raw) as PendingTransfer[]) : [] } catch { parsed = [] }
  cache.set(account, { raw, parsed })
  return parsed
}

function write(account: string, list: PendingTransfer[]): void {
  try { localStorage.setItem(keyOf(account), JSON.stringify(list)) } catch { /* storage unavailable: the in-page result still works */ }
  version += 1
  listeners.forEach(l => l())
}

export function addPending(t: PendingTransfer): void {
  const rest = readPending(t.account).filter(p => p.burnTx.toLowerCase() !== t.burnTx.toLowerCase())
  write(t.account, [t, ...rest])
}

export function removePending(account: string, burnTx: string): void {
  write(account, readPending(account).filter(p => p.burnTx.toLowerCase() !== burnTx.toLowerCase()))
}

const subscribe = (cb: () => void) => { listeners.add(cb); return () => { listeners.delete(cb) } }

/** Transfers still waiting for their destination mint, for the connected wallet. */
export function usePendingTransfers(account: string | undefined): PendingTransfer[] {
  useSyncExternalStore(subscribe, () => version, () => 0)
  return readPending(account)
}
