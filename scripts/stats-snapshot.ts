/**
 * Refresh src/stats/snapshot.json: the RacconPay event history on Arc Mainnet up to the current block.
 *
 * The public Arc RPC allows only a couple of calls per second, so reading a contract's whole history takes a
 * long time. The snapshot ships with the app so a first visit only reads blocks added since it was taken.
 * It resumes from the existing snapshot, so re-running it later only scans the new blocks.
 *
 * Usage: bun run stats:snapshot
 */
import { writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { ARC_MAINNET_CONTRACTS, STATS_CHAIN_ID } from '../src/stats/contracts'
import { scanConfig, syncContracts } from '../src/stats/scan'
import { exportSnapshot, getContractState, getHead, getVolumeState } from '../src/stats/store'
import { syncVolume } from '../src/stats/volume'
import { overrideMainnetRpc, statsClient } from '../src/stats/clients'

const OUT = fileURLToPath(new URL('../src/stats/snapshot.json', import.meta.url))
/** Progress checkpoints go here so the dev server does not reload on every write. */
const PARTIAL = join(tmpdir(), 'racconpay-stats-snapshot.partial.json')
const addresses = ARC_MAINNET_CONTRACTS.map(c => c.address)

function save(path: string) {
  const head = getHead(STATS_CHAIN_ID) ?? 0
  writeFileSync(path, `${JSON.stringify(exportSnapshot(STATS_CHAIN_ID, head, addresses, getVolumeState(STATS_CHAIN_ID)))}\n`)
}

const timer = setInterval(() => {
  save(PARTIAL)
  const lines = ARC_MAINNET_CONTRACTS.map(c => {
    const s = getContractState(STATS_CHAIN_ID, c.address)
    return `${c.label}: block ${s.lastBlock} (${s.txs.size} txs, ${s.users.size} wallets)`
  })
  console.log(`[${new Date().toISOString()}] checkpoint\n  ${lines.join('\n  ')}`)
}, 30_000)

// Arc Studio sandboxes provide an RPC proxy that allows much faster reads than the public endpoint.
// Without it the script still works, just slowly (the public RPC allows about two calls per second).
const proxyChains = (process.env.RPC_PROXY_CHAINS ?? '').split(',')
if (process.env.RPC_PROXY_BASE_URL && proxyChains.includes('Arc')) {
  overrideMainnetRpc(`${process.env.RPC_PROXY_BASE_URL}/api/rpc/Arc?_rpc_token=${process.env.RPC_PROXY_TOKEN ?? ''}`)
  scanConfig.minGapMs = 0
  scanConfig.parallel = 8
  console.log('Using the sandbox RPC proxy.')
} else {
  console.log('Using the public Arc RPC (slow: expect more than an hour for a first snapshot).')
}

const head = Number(await statsClient(STATS_CHAIN_ID).getBlockNumber())
console.log(`Arc Mainnet head ${head}. Scanning ${ARC_MAINNET_CONTRACTS.length} contracts from their deployment blocks.`)
await syncContracts(STATS_CHAIN_ID, ARC_MAINNET_CONTRACTS)
console.log('Scanning USDC and EURC transfers into the contracts (volume).')
await syncVolume(STATS_CHAIN_ID, ARC_MAINNET_CONTRACTS)
clearInterval(timer)
save(OUT)
console.log('Snapshot complete.')
