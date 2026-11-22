/**
 * Browser cache for stats scans. Each scanned contract keeps the last block it has read plus the
 * transaction hashes (8-byte prefixes) and wallet addresses seen, so a reload only scans new blocks.
 * Bump CACHE_VERSION whenever the scan rules or contract list change.
 */
import snapshotJson from './snapshot.json'

const CACHE_VERSION = 'v1'

export interface ContractState {
  lastBlock: number
  txs: Set<string>
  users: Set<string>
}

interface Stored { lastBlock: number; txs: string[]; users: string[] }

/** Running total of USDC and EURC paid into the RacconPay contracts (6-decimal raw units). */
export interface VolumeState { lastBlock: number; usdc: bigint; eurc: bigint }
interface StoredVolume { lastBlock: number; usdc: string; eurc: string }

const mem = new Map<string, ContractState>()
const heads = new Map<number, number>()
const listeners = new Set<() => void>()
let notifyTimer: ReturnType<typeof setTimeout> | undefined

const keyOf = (chainId: number, address: string) => `racconpay:stats:${CACHE_VERSION}:${chainId}:${address.toLowerCase()}`

interface Snapshot { version: string; chainId: number; head: number; contracts: Record<string, Stored>; volume?: StoredVolume }
const snapshot: Snapshot = snapshotJson

const toState = (s: Stored): ContractState => ({ lastBlock: Number(s.lastBlock) || 0, txs: new Set(s.txs), users: new Set(s.users) })

/**
 * A scan resumes from whichever is further along: this browser's cache or the snapshot shipped with the app.
 * The snapshot (see scripts/stats-snapshot.ts) means a first visit only reads the blocks added since it was taken.
 */
export function getContractState(chainId: number, address: string): ContractState {
  const key = keyOf(chainId, address)
  const cached = mem.get(key)
  if (cached) return cached
  let state: ContractState = { lastBlock: 0, txs: new Set(), users: new Set() }
  const shipped = snapshot.chainId === chainId && snapshot.version === CACHE_VERSION ? snapshot.contracts[address.toLowerCase()] : undefined
  if (shipped) state = toState(shipped)
  try {
    const raw = localStorage.getItem(key)
    if (raw) {
      const local = toState(JSON.parse(raw) as Stored)
      if (local.lastBlock >= state.lastBlock) state = local
    }
  } catch { /* ignore a corrupt or unavailable cache */ }
  mem.set(key, state)
  return state
}

const volumeMem = new Map<number, VolumeState>()
const toVolume = (v: StoredVolume): VolumeState => ({ lastBlock: Number(v.lastBlock) || 0, usdc: BigInt(v.usdc), eurc: BigInt(v.eurc) })

/** Volume totals resume from whichever is further along: this browser's cache or the shipped snapshot. */
export function getVolumeState(chainId: number): VolumeState {
  const hit = volumeMem.get(chainId)
  if (hit) return hit
  let state: VolumeState = { lastBlock: 0, usdc: 0n, eurc: 0n }
  if (snapshot.chainId === chainId && snapshot.version === CACHE_VERSION && snapshot.volume) state = toVolume(snapshot.volume)
  try {
    const raw = localStorage.getItem(`racconpay:stats:${CACHE_VERSION}:volume:${chainId}`)
    if (raw) {
      const local = toVolume(JSON.parse(raw) as StoredVolume)
      if (local.lastBlock >= state.lastBlock) state = local
    }
  } catch { /* ignore a corrupt or unavailable cache */ }
  volumeMem.set(chainId, state)
  return state
}

export function persistVolumeState(chainId: number): void {
  const v = volumeMem.get(chainId)
  if (!v) return
  try {
    localStorage.setItem(`racconpay:stats:${CACHE_VERSION}:volume:${chainId}`,
      JSON.stringify({ lastBlock: v.lastBlock, usdc: v.usdc.toString(), eurc: v.eurc.toString() } satisfies StoredVolume))
  } catch { /* storage full or blocked */ }
}

export function snapshotHead(chainId: number): number | undefined {
  return snapshot.chainId === chainId && snapshot.head ? snapshot.head : undefined
}

/** Used by scripts/stats-snapshot.ts to write the snapshot file. */
export function exportSnapshot(chainId: number, head: number, addresses: string[], volume?: VolumeState): Snapshot {
  const contracts: Record<string, Stored> = {}
  for (const a of addresses) {
    const s = getContractState(chainId, a)
    contracts[a.toLowerCase()] = { lastBlock: s.lastBlock, txs: [...s.txs], users: [...s.users] }
  }
  return {
    version: CACHE_VERSION, chainId, head, contracts,
    ...(volume ? { volume: { lastBlock: volume.lastBlock, usdc: volume.usdc.toString(), eurc: volume.eurc.toString() } } : {}),
  }
}

export function persistContractState(chainId: number, address: string): void {
  const key = keyOf(chainId, address)
  const s = mem.get(key)
  if (!s) return
  try {
    localStorage.setItem(key, JSON.stringify({ lastBlock: s.lastBlock, txs: [...s.txs], users: [...s.users] } satisfies Stored))
  } catch { /* storage full or blocked: the in-memory copy still works for this session */ }
}

export function setHead(chainId: number, head: number): void { heads.set(chainId, head) }
export function getHead(chainId: number): number | undefined { return heads.get(chainId) }

/** Generic small JSON cache for values like TVL and bridge totals. */
export function readJson<T>(key: string): T | undefined {
  try {
    const raw = localStorage.getItem(`racconpay:${CACHE_VERSION}:${key}`)
    return raw ? (JSON.parse(raw) as T) : undefined
  } catch { return undefined }
}
export function writeJson(key: string, value: unknown): void {
  try { localStorage.setItem(`racconpay:${CACHE_VERSION}:${key}`, JSON.stringify(value)) } catch { /* ignore */ }
}

export function subscribe(fn: () => void): () => void {
  listeners.add(fn)
  return () => { listeners.delete(fn) }
}

/** Throttled: scans can finish hundreds of chunks per second. */
export function notify(): void {
  if (notifyTimer) return
  notifyTimer = setTimeout(() => {
    notifyTimer = undefined
    listeners.forEach(fn => fn())
  }, 600)
}
