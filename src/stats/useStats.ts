/** React hooks over the stats scanners. Reads come straight from the Arc RPC and are cached in the browser. */
import { useEffect, useMemo, useState } from 'react'
import { type StatContract, STATS_CHAIN_ID } from './contracts'
import { getContractState, getHead, getVolumeState, readJson, subscribe, writeJson } from './store'
import { syncContracts } from './scan'
import { syncVolume } from './volume'
import { readTvl } from './tvl'

export interface ContractStats {
  transactions: number
  users: number
  tvlUsdc: bigint | null
  tvlEurc: bigint | null
  /** USDC and EURC paid into the contracts (only read when asked for). */
  volumeUsdc: bigint | null
  volumeEurc: bigint | null
  /** 0 to 1 share of blocks already scanned. */
  progress: number
  syncing: boolean
  error: boolean
}

function aggregate(contracts: StatContract[]) {
  const txs = new Set<string>()
  const users = new Set<string>()
  const own = new Set(contracts.map(c => c.address.toLowerCase()))
  let done = 0
  let total = 0
  const head = getHead(STATS_CHAIN_ID)
  for (const c of contracts) {
    const s = getContractState(STATS_CHAIN_ID, c.address)
    s.txs.forEach(t => txs.add(t))
    s.users.forEach(u => { if (!own.has(u)) users.add(u) })
    if (head) {
      total += Math.max(head - c.deployBlock + 1, 1)
      done += Math.max(Math.min(s.lastBlock, head) - c.deployBlock + 1, 0)
    }
  }
  return { transactions: txs.size, users: users.size, progress: total ? Math.min(done / total, 1) : 0 }
}

interface StoredTvl { usdc: string; eurc: string }

export function useContractStats(contracts: StatContract[], withVolume = false): ContractStats {
  const key = useMemo(() => contracts.map(c => c.address).join(','), [contracts])
  const [snap, setSnap] = useState(() => ({ ...aggregate(contracts), volume: getVolumeState(STATS_CHAIN_ID) }))
  const [tvl, setTvl] = useState<{ usdc: bigint; eurc: bigint } | null>(() => {
    const c = readJson<StoredTvl>(`tvl:${key}`)
    return c ? { usdc: BigInt(c.usdc), eurc: BigInt(c.eurc) } : null
  })
  const [syncing, setSyncing] = useState(true)
  const [error, setError] = useState(false)

  useEffect(() => {
    let alive = true
    const read = () => ({ ...aggregate(contracts), volume: getVolumeState(STATS_CHAIN_ID) })
    const unsub = subscribe(() => { if (alive) setSnap(read()) })

    Promise.all([
      syncContracts(STATS_CHAIN_ID, contracts),
      withVolume ? syncVolume(STATS_CHAIN_ID, contracts) : Promise.resolve(),
    ])
      .catch(() => { if (alive) setError(true) })
      .finally(() => { if (alive) { setSyncing(false); setSnap(read()) } })

    readTvl(STATS_CHAIN_ID, contracts)
      .then(v => {
        if (!alive) return
        setTvl(v)
        writeJson(`tvl:${key}`, { usdc: v.usdc.toString(), eurc: v.eurc.toString() } satisfies StoredTvl)
      })
      .catch(() => { if (alive) setError(true) })

    return () => { alive = false; unsub() }
    // `key` identifies the contract list, so a fresh array with the same addresses does not rescan.
    // oxlint-disable-next-line react-hooks/exhaustive-deps
  }, [key])

  return {
    transactions: snap.transactions, users: snap.users,
    tvlUsdc: tvl?.usdc ?? null, tvlEurc: tvl?.eurc ?? null,
    volumeUsdc: withVolume ? snap.volume.usdc : null, volumeEurc: withVolume ? snap.volume.eurc : null,
    progress: snap.progress, syncing, error,
  }
}
