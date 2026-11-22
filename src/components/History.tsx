/** Transaction History: every confirmed transaction this wallet can be linked to, split into Business and Personal. */
import { History as HistoryIcon, Wallet } from 'lucide-react'
import { useSearchParams } from 'react-router-dom'
import { useAccount } from 'wagmi'
import { ConnectKitButton } from 'connectkit'
import { Card, PageHeader, AlertBox } from './ui'
import ActivityTable, { BUSINESS_TYPES, PERSONAL_TYPES } from './ActivityTable'
import { EmptyState } from './kit/States'
import { useFullHistory } from '../lib/activity'

type Scope = 'all' | 'business' | 'personal'
const SCOPES: { id: Scope; label: string }[] = [
  { id: 'all', label: 'All' },
  { id: 'business', label: 'Business' },
  { id: 'personal', label: 'Personal' },
]

export default function HistoryPage() {
  const { address } = useAccount()
  const h = useFullHistory(address)
  const [params, setParams] = useSearchParams()
  const raw = params.get('scope')
  const scope: Scope = raw === 'business' || raw === 'personal' ? raw : 'all'
  const setScope = (s: Scope) => setParams(s === 'all' ? {} : { scope: s }, { replace: true })

  const rows = scope === 'all' ? h.rows : h.rows.filter(r => r.scope === scope)
  const typeOptions = scope === 'business' ? BUSINESS_TYPES : scope === 'personal' ? PERSONAL_TYPES : [...BUSINESS_TYPES, ...PERSONAL_TYPES, 'Other']

  return (
    <div className="flex flex-col gap-5">
      <PageHeader icon={HistoryIcon} title="Transaction history" subtitle="Business and personal transactions for this wallet, with links to the block explorers." />

      {!address ? (
        <Card>
          <EmptyState icon={Wallet} title="Connect a wallet to see your history" body="History is read for the connected wallet only." action={<ConnectKitButton />} />
        </Card>
      ) : (
        <>
          <div role="tablist" aria-label="Transaction scope" className="flex items-center gap-1 overflow-x-auto no-scrollbar" style={{ borderBottom: '1px solid var(--border)' }}>
            {SCOPES.map(s => (
              <button key={s.id} role="tab" aria-selected={scope === s.id} onClick={() => setScope(s.id)}
                className="px-4 min-h-[44px] text-sm font-medium whitespace-nowrap -mb-px transition-colors"
                style={{ color: scope === s.id ? 'var(--accent)' : 'var(--muted)', borderBottom: `2px solid ${scope === s.id ? 'var(--accent)' : 'transparent'}` }}>
                {s.label}
              </button>
            ))}
          </div>

          {h.explorerState === 'unavailable' && (
            <AlertBox variant="info">
              The Arc explorer did not answer this browser, so contract calls made elsewhere may be missing. Batch payouts come from on-chain receipts, and swaps, bridges and other transactions made here are kept on this device.
            </AlertBox>
          )}
          {h.explorerState === 'loading' && <p role="status" className="text-xs" style={{ color: 'var(--muted)' }}>Checking the Arc explorer for more transactions…</p>}
          <ActivityTable rows={rows} typeOptions={typeOptions} loading={h.isLoading} error={h.isError} onRetry={() => void h.refetch()} pageSize={10} caption="Transaction history" />
        </>
      )}
    </div>
  )
}
