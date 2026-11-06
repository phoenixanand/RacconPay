/**
 * Vesting console for finance and HR teams: overview, inbox, streams table, new stream,
 * bulk CSV upload and address book. Runs on every network that has a V2 deployment
 * (Arc Testnet today; Arc Mainnet only once VITE_VESTING_V2_ADDRESS_MAINNET is set).
 */
import { useState } from 'react'
import { useAccount, usePublicClient } from 'wagmi'
import { FlaskConical, RefreshCw, FileClock, Loader2 } from 'lucide-react'
import { toast } from 'sonner'

import ChainGuard from './ChainGuard'
import { AlertBox, GhostButton } from './ui'
import CreateStreamV2 from './vesting/CreateStreamV2'
import BulkCreate from './vesting/BulkCreate'
import AddressBook from './vesting/AddressBook'
import Overview from './vesting/Overview'
import Inbox, { inRole, type Role } from './vesting/Inbox'
import StreamTable from './vesting/StreamTable'
import { useConsoleData } from './vesting/consoleData'
import { useLabels } from './vesting/labels'
import { buildActivityCsv, type ActivityProgress } from './vesting/activity'
import { downloadText } from './vesting/exportCsv'
import { friendlyError } from './vesting/shared'
import {
  ARC_CHAIN_ID, ARC_TESTNET_CHAIN_ID, chainLabel, vestingDeployTx, vestingV2Address, vestingYieldAddress,
} from '../constants'

type Tab = 'streams' | 'new' | 'bulk' | 'people'
const TABS: [Tab, string][] = [['streams', 'Streams'], ['new', 'New stream'], ['bulk', 'Bulk upload'], ['people', 'Address book']]
// Mainnet first when it has been deployed; testnet stays available as the pilot environment.
const NETWORKS = [ARC_CHAIN_ID, ARC_TESTNET_CHAIN_ID].filter(id => vestingV2Address(id))

const segmented = (active: boolean) => ({
  background: active ? 'var(--surface-strong)' : 'transparent',
  color: active ? 'var(--ink)' : 'var(--muted)',
  border: active ? '1px solid var(--border-strong)' : '1px solid transparent',
})

function Console({ wallet, chainId, plainAddress, yieldAddress }: {
  wallet: `0x${string}`
  chainId: number
  plainAddress: `0x${string}`
  yieldAddress?: `0x${string}`
}) {
  const [tab, setTab] = useState<Tab>('streams')
  const [role, setRole] = useState<Role>('paying')
  const [progress, setProgress] = useState<ActivityProgress | null>(null)
  const client = usePublicClient({ chainId })
  const { nameOf } = useLabels()
  const data = useConsoleData(wallet, chainId, plainAddress, yieldAddress)
  const networkName = chainLabel(chainId)

  const roleStreams = data.streams.filter(s => inRole(s, wallet, role))
  const approvals = data.pendingLeaves.filter(l => inRole(l.stream, wallet, role)).length

  async function exportActivity() {
    if (!client || progress) return
    setProgress({ scanned: 0n, total: 1n, found: 0 })
    try {
      const targets = [plainAddress, yieldAddress].filter((a): a is `0x${string}` => !!a).map(contract => ({
        contract,
        deployTx: vestingDeployTx(contract),
        streamIds: new Set(data.streams.filter(s => s.contract === contract).map(s => s.id)),
      }))
      const csv = await buildActivityCsv(client, networkName, wallet, targets, setProgress)
      downloadText(`racconpay-activity-${new Date().toISOString().slice(0, 10)}.csv`, csv)
    } catch (e) {
      toast.error(`Could not build the activity report: ${friendlyError(e)}`)
    } finally {
      setProgress(null)
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex gap-1 p-1 rounded-xl w-fit" style={{ background: 'var(--surface-muted)', border: '1px solid var(--border)' }}>
          {([['paying', 'I am paying'], ['receiving', 'I am receiving']] as [Role, string][]).map(([r, label]) => (
            <button key={r} onClick={() => setRole(r)} className="px-4 py-1.5 rounded-lg text-sm font-medium transition-all" style={segmented(role === r)}>
              {label}
            </button>
          ))}
        </div>
        <div className="flex gap-2">
          <GhostButton onClick={() => void exportActivity()} disabled={!!progress || data.streams.length === 0}>
            {progress ? <Loader2 size={13} className="animate-spin" /> : <FileClock size={13} />}
            {progress ? `Scanning ${Number((progress.scanned * 100n) / (progress.total || 1n))}%` : 'Activity report (CSV)'}
          </GhostButton>
          <GhostButton onClick={data.refetch}><RefreshCw size={13} /> Refresh</GhostButton>
        </div>
      </div>

      <Overview streams={roleStreams} pendingApprovals={approvals} />

      <Inbox wallet={wallet} role={role} chainId={chainId} streams={data.streams} pendingLeaves={data.pendingLeaves}
             pendingWithdrawals={data.pendingWithdrawals} plainAddress={plainAddress} yieldAddress={yieldAddress}
             nameOf={nameOf} onDone={data.refetch} />

      <div className="flex gap-1 p-1 rounded-xl w-fit max-w-full overflow-x-auto" style={{ background: 'var(--surface-muted)', border: '1px solid var(--border)' }}>
        {TABS.map(([t, label]) => (
          <button key={t} onClick={() => setTab(t)} className="px-4 py-1.5 rounded-lg text-sm font-medium transition-all whitespace-nowrap" style={segmented(tab === t)}>
            {label}
          </button>
        ))}
      </div>

      {tab === 'streams' && (data.loading ? (
        <div className="flex items-center justify-center gap-2 py-12" style={{ color: 'var(--muted)' }}>
          <Loader2 size={18} className="animate-spin" /> <span className="text-sm">Loading streams…</span>
        </div>
      ) : (
        <StreamTable streams={roleStreams} wallet={wallet} role={role} chainId={chainId} networkName={networkName}
                     nameOf={nameOf} onRefresh={data.refetch} />
      ))}
      {tab === 'new' && <CreateStreamV2 address={wallet} chainId={chainId} vestingAddress={plainAddress} yieldAddress={yieldAddress} />}
      {tab === 'bulk' && <BulkCreate address={wallet} chainId={chainId} vestingAddress={plainAddress} onCreated={data.refetch} />}
      {tab === 'people' && <AddressBook />}
    </div>
  )
}

export default function VestingV2() {
  const { address } = useAccount()
  const [chainId, setChainId] = useState<number>(NETWORKS[0] ?? ARC_TESTNET_CHAIN_ID)
  const plainAddress = vestingV2Address(chainId)

  if (!plainAddress) {
    return <AlertBox variant="info">The vesting console is not deployed on any network yet.</AlertBox>
  }

  return (
    <div className="flex flex-col gap-5">
      {chainId === ARC_TESTNET_CHAIN_ID && (
        <div className="flex items-start gap-2.5 rounded-xl px-4 py-3 text-sm"
             style={{ background: 'var(--accent-muted)', border: '1px solid var(--border-strong)', color: 'var(--ink-2)' }}>
          <FlaskConical size={15} className="shrink-0 mt-0.5" style={{ color: 'var(--accent)' }} />
          <span className="text-pretty">
            Pilot environment on Arc Testnet with test USDC. Leave, pauses and yield are not available on Arc Mainnet yet,
            and these contracts have not had an independent audit.
          </span>
        </div>
      )}

      {chainId === ARC_CHAIN_ID && (
        <AlertBox variant="warning">
          Arc Mainnet uses real USDC and every transaction is final. These contracts have not had an independent audit.
          Start with a small test stream before locking larger amounts.
        </AlertBox>
      )}

      {NETWORKS.length > 1 && (
        <div className="flex gap-1 p-1 rounded-xl w-fit" style={{ background: 'var(--surface-muted)', border: '1px solid var(--border)' }}>
          {NETWORKS.map(id => (
            <button key={id} onClick={() => setChainId(id)} className="px-3 py-1.5 rounded-lg text-xs font-medium transition-all" style={segmented(chainId === id)}>
              {chainLabel(id)}
            </button>
          ))}
        </div>
      )}

      <ChainGuard chainId={chainId}>
        {address && <Console key={chainId} wallet={address} chainId={chainId} plainAddress={plainAddress} yieldAddress={vestingYieldAddress(chainId)} />}
      </ChainGuard>
    </div>
  )
}
