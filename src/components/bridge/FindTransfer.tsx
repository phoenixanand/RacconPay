/** "Transfer missing?": look for a burned CCTP transfer that is not in the in-progress list, by wallet or by hash. */
import { useState } from 'react'
import { Search } from 'lucide-react'
import { GhostButton } from '../ui'
import { Select } from '../kit/Fields'
import type { EndpointId } from '../../bridge/chains'
import { findBurnByHash, findRecentBurns } from '../../bridge/recover'

const CHAINS: { value: EndpointId; label: string }[] = [
  { value: 'arc', label: 'Arc' }, { value: 'base', label: 'Base' },
  { value: 'ethereum', label: 'Ethereum' }, { value: 'avalanche', label: 'Avalanche' },
]

export default function FindTransfer({ account }: { account: string | undefined }) {
  const [busy, setBusy] = useState<string | null>(null)
  const [message, setMessage] = useState<string | null>(null)
  const [chain, setChain] = useState<EndpointId>('base')
  const [hash, setHash] = useState('')
  const validHash = /^0x[0-9a-fA-F]{64}$/.test(hash.trim())

  const scan = async () => {
    if (!account) return
    setBusy('Searching'); setMessage(null)
    try {
      const r = await findRecentBurns(account, 24, label => setBusy(`Searching ${label}`))
      const parts: string[] = []
      if (r.added > 0) parts.push(`Found ${r.added} transfer${r.added === 1 ? '' : 's'} waiting to be minted. They are listed above.`)
      if (r.alreadyMinted > 0) parts.push(`${r.alreadyMinted} other recent transfer${r.alreadyMinted === 1 ? ' was' : 's were'} already minted.`)
      if (r.added === 0 && r.alreadyMinted === 0) parts.push('No unfinished transfers from this wallet in the last 24 hours.')
      if (r.failed.length) parts.push(`Could not read: ${r.failed.join(', ')}. Try again.`)
      setMessage(parts.join(' '))
    } finally { setBusy(null) }
  }

  const lookup = async () => {
    if (!account || !validHash) return
    setBusy('Looking up'); setMessage(null)
    try {
      const r = await findBurnByHash(account, chain, hash.trim())
      setMessage(
        r === 'added' ? 'Found it. The transfer is listed above, ready to finish.'
        : r === 'known' ? 'That transfer is already in the list above.'
        : r === 'minted' ? 'That transfer has already been minted on the destination.'
        : r === 'other-wallet' ? 'That transfer was started by a different wallet. Connect that wallet to finish it.'
        : 'No USDC or EURC transfer burn found for that hash on the chosen chain, or it can only be minted by someone else.',
      )
    } catch { setMessage('Could not look that up right now. Try again in a moment.') } finally { setBusy(null) }
  }

  return (
    <details className="rounded-xl" style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
      <summary className="px-4 min-h-[44px] flex items-center gap-2 text-sm font-medium cursor-pointer" style={{ color: 'var(--ink-2)' }}>
        <Search size={14} aria-hidden="true" /> Sent funds but nothing arrived? Find the transfer
      </summary>
      <div className="px-4 pb-4 flex flex-col gap-4">
        <p className="text-xs" style={{ color: 'var(--muted)' }}>
          If you reloaded or closed the page during a bridge, the transfer may still be on the chain. Your funds are not lost: once they are burned on the source chain, they can still be minted on the destination. Standard transfers can take 15 minutes or more to be confirmed.
        </p>

        <div className="flex flex-col gap-2">
          <GhostButton onClick={() => void scan()} disabled={!account || !!busy} className="min-h-[44px] self-start">
            {busy?.startsWith('Searching') ? `${busy}…` : 'Find my transfers from the last 24 hours'}
          </GhostButton>
        </div>

        <div className="flex flex-col gap-2">
          <p className="text-xs font-medium" style={{ color: 'var(--ink-2)' }}>Or look up one transfer by its transaction hash</p>
          <div className="grid grid-cols-1 sm:grid-cols-[160px_minmax(0,1fr)_auto] gap-2 items-end">
            <Select label="Source chain" value={chain} onChange={v => setChain(v as EndpointId)} options={CHAINS} />
            <div className="flex flex-col gap-1.5">
              <label htmlFor="burn-hash" className="text-xs font-medium" style={{ color: 'var(--ink-2)' }}>Burn transaction hash</label>
              <input id="burn-hash" value={hash} onChange={e => { setHash(e.target.value); setMessage(null) }} placeholder="0x…" spellCheck={false}
                className="w-full min-h-[44px] rounded-lg px-3 text-sm font-mono outline-none focus:border-[var(--accent)] focus:ring-2 focus:ring-[var(--accent-glow)]"
                style={{ background: 'var(--surface)', color: 'var(--ink)', border: '1px solid var(--border-strong)' }} />
            </div>
            <GhostButton onClick={() => void lookup()} disabled={!account || !validHash || !!busy} className="min-h-[44px]">
              {busy === 'Looking up' ? 'Looking up…' : 'Look up'}
            </GhostButton>
          </div>
          {hash.trim() && !validHash && <p role="alert" className="text-xs" style={{ color: 'var(--danger)' }}>A transaction hash starts with 0x and has 64 characters after it.</p>}
        </div>

        {message && <p role="status" className="text-sm" style={{ color: 'var(--ink-2)' }}>{message}</p>}
        <p className="text-xs" style={{ color: 'var(--muted)' }}>Solana sources can't be searched from here. If you can't find a transfer, keep the burn hash from your wallet's history and contact support.</p>
      </div>
    </details>
  )
}
