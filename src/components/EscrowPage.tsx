/**
 * Milestone Escrow, lock USDC or EURC for a payee, release per milestone, optional arbiter.
 * Runs on Arc Mainnet.
 */
import { useState } from 'react'
import { useAccount } from 'wagmi'
import { Handshake, Plus } from 'lucide-react'
import { Card, GhostButton, PageHeader, AlertBox } from './ui'
import ChainGuard from './ChainGuard'
import CreateEscrow from './escrow/CreateEscrow'
import EscrowCard from './escrow/EscrowCard'
import EscrowCredits from './escrow/EscrowCredits'
import { useEscrows } from './escrow/useEscrows'
import { ARC_CHAIN_ID, ESCROW_ADDRESS, explorerAddr } from '../constants'

type Filter = 'all' | 'payer' | 'payee' | 'arbiter'

function EscrowBoard({ address }: { address: `0x${string}` }) {
  const { escrows, isLoading, refetch } = useEscrows(address)
  const [showCreate, setShowCreate] = useState(false)
  const [filter, setFilter] = useState<Filter>('all')

  const me = address.toLowerCase()
  const visible = escrows.filter(e =>
    filter === 'all'
    || (filter === 'payer' && e.payer.toLowerCase() === me)
    || (filter === 'payee' && e.payee.toLowerCase() === me)
    || (filter === 'arbiter' && e.arbiter.toLowerCase() === me),
  )

  return (
    <div className="flex flex-col gap-5">
      <EscrowCredits address={address} />

      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div className="flex gap-2 flex-wrap">
          {(['all', 'payer', 'payee', 'arbiter'] as const).map(f => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className="px-3 py-1 rounded-full text-xs font-semibold transition-all"
              style={{
                background: filter === f ? 'var(--accent)' : 'var(--surface-strong)',
                color:      filter === f ? '#fff' : 'var(--muted)',
              }}
            >
              {f === 'all' ? 'All' : f === 'payer' ? 'Pay' : f === 'payee' ? 'Paid' : 'Arbitrate'}
            </button>
          ))}
        </div>
        <GhostButton onClick={() => setShowCreate(v => !v)}>
          <Plus size={14} /> {showCreate ? 'Close' : 'New escrow'}
        </GhostButton>
      </div>

      {showCreate && <CreateEscrow onCreated={() => { refetch(); setShowCreate(false) }} />}

      {isLoading && (
        <div className="w-full rounded-2xl animate-pulse" style={{ height: 120, background: 'var(--surface)' }} />
      )}

      {!isLoading && visible.length === 0 && (
        <Card className="p-8 flex flex-col items-center gap-2 text-center">
          <Handshake size={28} style={{ color: 'var(--subtle)' }} />
          <p className="text-sm" style={{ color: 'var(--muted)' }}>
            {escrows.length === 0 ? 'No escrows yet. Create one to lock funds against milestones.' : 'No escrows match this filter.'}
          </p>
        </Card>
      )}

      {visible.map(e => <EscrowCard key={e.id.toString()} escrow={e} onChanged={refetch} />)}
    </div>
  )
}

export default function EscrowPage() {
  const { address } = useAccount()
  return (
    <div className="flex flex-col gap-6 animate-fade-up">
      <PageHeader
        icon={Handshake}
        title="Escrow"
        subtitle="Lock USDC or EURC against milestones. Release on approval, with an optional arbiter for disputes."
        accentColor="var(--split-accent)"
      />
      <AlertBox variant="info">
        Arc Mainnet uses real USDC and EURC and every transaction is final. This escrow contract has not had an
        independent audit, so start with a small test escrow. Contract:{' '}
        <a
          href={explorerAddr(ESCROW_ADDRESS)}
          target="_blank" rel="noreferrer" className="underline font-mono"
        >
          {ESCROW_ADDRESS.slice(0, 10)}…{ESCROW_ADDRESS.slice(-6)}
        </a>
      </AlertBox>
      <ChainGuard chainId={ARC_CHAIN_ID}>
        {address && <EscrowBoard address={address} />}
      </ChainGuard>
    </div>
  )
}
