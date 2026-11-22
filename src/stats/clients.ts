/** Read-only RPC clients for stats. They work without a connected wallet. */
import { createPublicClient, http } from 'viem'
import { arc, arcTestnet } from 'viem/chains'
import { ARC_CHAIN_ID, ARC_TESTNET_CHAIN_ID } from '../constants'

const MAINNET_RPC = 'https://rpc.mainnet.arc.io'
const TESTNET_RPC = 'https://rpc.testnet.arc.io'

const mainnetClient = createPublicClient({ chain: arc, transport: http(MAINNET_RPC, { batch: true, retryCount: 3 }) })
const testnetClient = createPublicClient({ chain: arcTestnet, transport: http(TESTNET_RPC, { batch: true, retryCount: 3 }) })

export type StatsClient = typeof mainnetClient | typeof testnetClient

let mainnetOverride: StatsClient | undefined

/** For scripts only: read mainnet through another endpoint (never ship a keyed URL to the browser). */
export function overrideMainnetRpc(url: string): void {
  mainnetOverride = createPublicClient({ chain: arc, transport: http(url, { batch: false, retryCount: 2 }) })
}

export function statsClient(chainId: number): StatsClient {
  if (chainId === ARC_CHAIN_ID) return mainnetOverride ?? mainnetClient
  if (chainId === ARC_TESTNET_CHAIN_ID) return testnetClient
  throw new Error(`No stats client for chain ${chainId}`)
}
