/**
 * Find CCTP transfers that burned but were never saved in this browser: for example after a reload before the burn was
 * confirmed, in another browser, or after clearing site data. The burn is on the chain, so it can be found again from
 * the wallet address (recent history) or from the burn transaction hash. Found transfers that Circle has not minted yet
 * are added to the "Transfers in progress" list, where they can be finished.
 */
import { createPublicClient, http, parseAbiItem, parseEventLogs, type PublicClient } from 'viem'
import { endpointById, type BridgeToken, type EndpointId } from './chains'
import { addPending, readPending, type PendingTransfer } from './pending'
import { lookupBurn } from './useIris'
import { throttled } from '../stats/scan'
import { formatToken } from '../utils'

const TOKEN_MESSENGER_V2 = '0x28b5a0e9C621a5BadaA536219b3a228C8168cf5d' as const
const BURN_EVENT = parseAbiItem('event DepositForBurn(address indexed burnToken, uint256 amount, address indexed depositor, bytes32 mintRecipient, uint32 destinationDomain, bytes32 destinationTokenMessenger, bytes32 destinationCaller, uint256 maxFee, uint32 indexed minFinalityThreshold, bytes hookData)')

/** EVM chains a burn can be found on, with a public RPC and the approximate seconds per block. */
const SOURCES: { id: EndpointId; rpc: string; blockSeconds: number }[] = [
  { id: 'arc', rpc: 'https://rpc.mainnet.arc.io', blockSeconds: 0.5 },
  { id: 'base', rpc: 'https://base-rpc.publicnode.com', blockSeconds: 2 },
  { id: 'ethereum', rpc: 'https://ethereum-rpc.publicnode.com', blockSeconds: 12 },
  { id: 'avalanche', rpc: 'https://avalanche-c-chain-rpc.publicnode.com', blockSeconds: 2 },
]
/** CCTP destination domain to endpoint. Solana is left out: its recipient is not an EVM address. */
const DOMAIN_TO_ID: Record<number, EndpointId> = { 0: 'ethereum', 1: 'avalanche', 6: 'base', 26: 'arc' }
/** Circle's forwarding service marks its transfers with this prefix in the burn's hook data. */
const FORWARD_PREFIX = '0x636374702d666f72776172640000'
const ZERO32 = `0x${'0'.repeat(64)}`
const CHUNK = 4_999n

const clients = new Map<EndpointId, PublicClient>()
function clientFor(id: EndpointId): PublicClient {
  let c = clients.get(id)
  if (!c) {
    const src = SOURCES.find(s => s.id === id)
    if (!src) throw new Error('This chain is not supported for recovery.')
    c = createPublicClient({ transport: http(src.rpc) })
    clients.set(id, c)
  }
  return c
}

interface BurnArgs {
  burnToken?: `0x${string}`; amount?: bigint; depositor?: `0x${string}`; mintRecipient?: `0x${string}`
  destinationDomain?: number; destinationCaller?: `0x${string}`; minFinalityThreshold?: number; hookData?: `0x${string}`
}

/** Turn a burn event into a saved transfer, or null when this wallet could not finish it (or it is not USDC or EURC). */
function toPending(account: string, srcId: EndpointId, hash: string, createdAt: number, a: BurnArgs): PendingTransfer | null {
  const dstId = a.destinationDomain === undefined ? undefined : DOMAIN_TO_ID[a.destinationDomain]
  if (!dstId || a.amount === undefined || !a.mintRecipient || !a.burnToken) return null
  const src = endpointById(srcId)
  const token: BridgeToken | undefined = (['USDC', 'EURC'] as const).find(t => src.tokenAddress?.[t]?.toLowerCase() === a.burnToken!.toLowerCase())
  if (!token) return null
  const forwarded = (a.hookData ?? '0x').toLowerCase().startsWith(FORWARD_PREFIX)
  // A burn locked to another caller can only be minted by that caller.
  if (!forwarded && a.destinationCaller && a.destinationCaller !== ZERO32) return null
  const recipient = `0x${a.mintRecipient.slice(-40)}`
  return {
    burnTx: hash, account, fromId: srcId, toId: dstId, token, amount: formatToken(a.amount, 6),
    speed: a.minFinalityThreshold === 1000 ? 'FAST' : 'SLOW',
    mode: forwarded ? 'forwarder' : srcId !== 'arc' && dstId === 'arc' ? 'evm' : 'wallet',
    recipient, sourceAddress: account, createdAt,
  }
}

export interface FindResult {
  /** Transfers newly added to the in-progress list. */
  added: number
  /** Burns found for this wallet that Circle has already minted. */
  alreadyMinted: number
  /** Chains that could not be read. */
  failed: string[]
}

/** Scan each chain's recent blocks for burns sent by this wallet. */
export async function findRecentBurns(account: string, hours: number, onChain?: (label: string) => void): Promise<FindResult> {
  const out: FindResult = { added: 0, alreadyMinted: 0, failed: [] }
  const known = new Set(readPending(account).map(p => p.burnTx.toLowerCase()))
  for (const s of SOURCES) {
    const label = endpointById(s.id).label
    onChain?.(label)
    try {
      const client = clientFor(s.id)
      const head = await throttled(() => client.getBlockNumber())
      const span = BigInt(Math.ceil((hours * 3600) / s.blockSeconds))
      const start = head > span ? head - span : 0n
      for (let from = start; from <= head; from += CHUNK + 1n) {
        const to = from + CHUNK > head ? head : from + CHUNK
        const logs = await throttled(() => client.getLogs({
          address: TOKEN_MESSENGER_V2, event: BURN_EVENT, args: { depositor: account as `0x${string}` }, fromBlock: from, toBlock: to,
        }))
        for (const l of logs) {
          if (!l.transactionHash || known.has(l.transactionHash.toLowerCase())) continue
          const p = toPending(account, s.id, l.transactionHash, Date.now(), l.args)
          if (!p) continue
          const iris = await lookupBurn(s.id, l.transactionHash)
          if (iris?.destinationMintTxHash) { out.alreadyMinted += 1; continue }
          addPending(p); known.add(l.transactionHash.toLowerCase()); out.added += 1
        }
      }
    } catch { out.failed.push(label) }
  }
  return out
}

/** Look up one burn from its transaction hash on a chosen source chain. */
export async function findBurnByHash(account: string, srcId: EndpointId, hash: string): Promise<'added' | 'minted' | 'known' | 'other-wallet' | 'not-found'> {
  if (readPending(account).some(p => p.burnTx.toLowerCase() === hash.toLowerCase())) return 'known'
  const client = clientFor(srcId)
  const receipt = await throttled(() => client.getTransactionReceipt({ hash: hash as `0x${string}` })).catch(() => null)
  if (!receipt) return 'not-found'
  const burns = parseEventLogs({ abi: [BURN_EVENT], logs: receipt.logs }).filter(l => l.address.toLowerCase() === TOKEN_MESSENGER_V2.toLowerCase())
  const burn = burns[0]
  if (!burn) return 'not-found'
  if (burn.args.depositor?.toLowerCase() !== account.toLowerCase()) return 'other-wallet'
  const p = toPending(account, srcId, hash, Date.now(), burn.args)
  if (!p) return 'not-found'
  const iris = await lookupBurn(srcId, hash)
  if (iris?.destinationMintTxHash) return 'minted'
  addPending(p)
  return 'added'
}
