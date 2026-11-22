/**
 * Bridge routes to and from Arc Mainnet. Chain names are the strings App Kit expects, not numeric chain ids.
 * Which tokens actually work on a route is confirmed at runtime by the quote, never assumed here.
 * Token addresses come from Circle's USDC and EURC contract address pages.
 */
import { arc, avalanche, base, mainnet } from 'viem/chains'
import { TOKENS } from '../tokens'

export type BridgeToken = 'USDC' | 'EURC'

export type EndpointId = 'arc' | 'ethereum' | 'base' | 'avalanche' | 'solana'

/** One end of a transfer: Arc Mainnet or one of the four other mainnets. */
export interface BridgeEndpoint {
  id: EndpointId
  label: string
  kitChain: 'Arc' | 'Ethereum' | 'Base' | 'Avalanche' | 'Solana'
  family: 'evm' | 'solana'
  /** Wallet chain id for EVM sources. */
  chainId?: number
  explorerTx: (hash: string) => string
  /** Tokens offered in the picker. EURC is EVM only. */
  tokens: BridgeToken[]
  /** ERC-20 addresses for balance display on EVM sources. */
  tokenAddress?: Partial<Record<BridgeToken, `0x${string}`>>
}

/** A non-Arc endpoint. */
export type BridgeSource = BridgeEndpoint & { id: Exclude<EndpointId, 'arc'> }

export const ARC_DESTINATION = {
  label: 'Arc',
  kitChain: 'Arc' as const,
  chainId: arc.id,
  explorerTx: (hash: string) => `https://explorer.arc.io/tx/${hash}`,
}

export const BRIDGE_SOURCES: BridgeSource[] = [
  {
    id: 'ethereum', label: 'Ethereum', kitChain: 'Ethereum', family: 'evm', chainId: mainnet.id,
    explorerTx: h => `https://etherscan.io/tx/${h}`, tokens: ['USDC', 'EURC'],
    tokenAddress: { USDC: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48', EURC: '0x1aBaEA1f7C830bD89Acc67eC4af516284b1bC33c' },
  },
  {
    id: 'base', label: 'Base', kitChain: 'Base', family: 'evm', chainId: base.id,
    explorerTx: h => `https://basescan.org/tx/${h}`, tokens: ['USDC', 'EURC'],
    tokenAddress: { USDC: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913', EURC: '0x60a3E35Cc302bFA44Cb288Bc5a4F316Fdb1adb42' },
  },
  {
    // EURC on Avalanche exists, but Circle's EURC crosschain routes to Arc are Ethereum and Base; the quote decides.
    id: 'avalanche', label: 'Avalanche', kitChain: 'Avalanche', family: 'evm', chainId: avalanche.id,
    explorerTx: h => `https://snowtrace.io/tx/${h}`, tokens: ['USDC', 'EURC'],
    tokenAddress: { USDC: '0xB97EF9Ef8734C71904D8002F8b6Bc66Dd9c48a6E', EURC: '0xC891EB4cbdEFf6e073e859e987815Ed1505c2ACD' },
  },
  {
    id: 'solana', label: 'Solana', kitChain: 'Solana', family: 'solana',
    explorerTx: h => `https://explorer.solana.com/tx/${h}`, tokens: ['USDC'],
  },
]

export function sourceById(id: BridgeSource['id']): BridgeSource {
  const s = BRIDGE_SOURCES.find(b => b.id === id)
  if (!s) throw new Error(`Unknown bridge source ${id}`)
  return s
}

/** Arc Mainnet as an endpoint. Balances are read through the 6-decimal ERC-20 view, never the 18-decimal native view. */
export const ARC_ENDPOINT: BridgeEndpoint = {
  id: 'arc', label: 'Arc', kitChain: 'Arc', family: 'evm', chainId: arc.id,
  explorerTx: ARC_DESTINATION.explorerTx, tokens: ['USDC', 'EURC'],
  tokenAddress: { USDC: TOKENS.USDC.address[arc.id], EURC: TOKENS.EURC.address[arc.id] },
}

export const ENDPOINTS: BridgeEndpoint[] = [ARC_ENDPOINT, ...BRIDGE_SOURCES]

export function endpointById(id: EndpointId): BridgeEndpoint {
  const e = ENDPOINTS.find(x => x.id === id)
  if (!e) throw new Error(`Unknown bridge endpoint ${id}`)
  return e
}

export const isEndpointId = (v: string | null): v is EndpointId => !!v && ENDPOINTS.some(e => e.id === v)

/** A transfer always has Arc on exactly one side. */
export interface Direction { from: EndpointId; to: EndpointId }
export const DEFAULT_DIRECTION: Direction = { from: 'base', to: 'arc' }

export function normalizeDirection(from: string | null, to: string | null): Direction {
  const f = isEndpointId(from) ? from : undefined
  const t = isEndpointId(to) ? to : undefined
  if (f === 'arc' && t && t !== 'arc') return { from: f, to: t }
  if (t === 'arc' && f && f !== 'arc') return { from: f, to: t }
  if (f === 'arc') return { from: 'arc', to: 'base' }
  if (t === 'arc') return { from: 'base', to: 'arc' }
  if (f) return { from: f, to: 'arc' }
  if (t) return { from: 'arc', to: t }
  return DEFAULT_DIRECTION
}

export function withFrom(d: Direction, id: EndpointId): Direction {
  if (id === 'arc') return { from: 'arc', to: d.to === 'arc' ? d.from : d.to }
  return { from: id, to: 'arc' }
}

export function withTo(d: Direction, id: EndpointId): Direction {
  if (id === 'arc') return { from: d.from === 'arc' ? d.to : d.from, to: 'arc' }
  return { from: 'arc', to: id }
}

export const swapDirection = (d: Direction): Direction => ({ from: d.to, to: d.from })

/** Tokens both ends can carry. Solana carries USDC only. */
export function routeTokens(from: BridgeEndpoint, to: BridgeEndpoint): BridgeToken[] {
  return from.tokens.filter(t => to.tokens.includes(t))
}

/** Solana addresses are base58, 32 to 44 characters. */
export const isSolanaAddress = (v: string) => /^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(v)
