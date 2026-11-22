/**
 * Personal overview: wallet balance, bill splits, swaps and bridges for the connected wallet.
 * Balances and bill counts are read from Arc Mainnet. Swaps and bridges come from transactions confirmed
 * in this browser (there is no per-wallet feed of older ones), and the page says so.
 */
import { Link } from 'react-router-dom'
import { Wallet, Users, Repeat, Waypoints, UserRound, ArrowRight } from 'lucide-react'
import { useAccount, useReadContract } from 'wagmi'
import { ConnectKitButton } from 'connectkit'
import { Card, PageHeader, StatCard, AlertBox } from './ui'
import ActivityTable, { PERSONAL_TYPES } from './ActivityTable'
import StablecoinBalances from './StablecoinBalances'
import { BillsSection } from './Portfolio'
import { EmptyState } from './kit/States'
import { useActivity } from '../lib/activity'
import { ARC_CHAIN_ID, BILL_SPLITTER_ADDRESS } from '../constants'
import { BILL_SPLITTER_ABI } from '../abis'
import { tokenAddress } from '../tokens'
import { formatToken } from '../utils'
import { erc20Abi } from 'viem'

const ZERO = '0x0000000000000000000000000000000000000000' as const

export default function PersonalOverviewPage() {
  const { address, isConnected } = useAccount()
  const usdc = tokenAddress('USDC', ARC_CHAIN_ID)
  const { data: balance } = useReadContract({
    address: usdc, abi: erc20Abi, functionName: 'balanceOf', args: [address ?? ZERO],
    chainId: ARC_CHAIN_ID, query: { enabled: !!address && !!usdc },
  })
  const { data: billIds } = useReadContract({
    address: BILL_SPLITTER_ADDRESS, abi: BILL_SPLITTER_ABI, functionName: 'billsOf', args: [address ?? ZERO],
    chainId: ARC_CHAIN_ID, query: { enabled: !!address },
  })
  const activity = useActivity(address)

  if (!isConnected || !address) {
    return (
      <div className="flex flex-col gap-5">
        <PageHeader icon={UserRound} title="Personal overview" subtitle="Your balance, bill splits, swaps and bridges." />
        <Card>
          <EmptyState icon={Wallet} title="Connect your wallet" body="Your personal overview is read for the connected wallet only." action={<ConnectKitButton />} />
        </Card>
      </div>
    )
  }

  const personal = activity.rows.filter(r => r.scope === 'personal')
  const swaps = personal.filter(r => r.type === 'Swap')
  const bridges = personal.filter(r => r.type === 'Bridge')
  const pendingBridges = bridges.filter(r => r.status === 'pending').length
  const bills = (billIds as bigint[] | undefined) ?? []

  return (
    <div className="flex flex-col gap-6">
      <PageHeader icon={UserRound} title="Personal overview" subtitle="Your balance, bill splits, swaps and bridges on Arc." />

      <section aria-label="Personal summary" className="grid grid-cols-1 min-[480px]:grid-cols-2 lg:grid-cols-4 gap-3">
        <StatCard label="USDC balance" value={balance === undefined ? '-' : formatToken(balance, 6)} icon={Wallet} />
        <StatCard label="Bill splits" value={billIds === undefined ? '-' : bills.length.toString()} icon={Users} />
        <StatCard label="Swaps" value={swaps.length.toString()} icon={Repeat} />
        <StatCard label="Bridges" value={bridges.length.toString()} sub={pendingBridges ? `${pendingBridges} not completed yet` : undefined} icon={Waypoints} />
      </section>

      <section aria-label="Quick actions">
        <h2 className="text-sm font-semibold mb-3" style={{ color: 'var(--ink)' }}>Quick actions</h2>
        <div className="grid grid-cols-1 min-[480px]:grid-cols-3 gap-3">
          {[
            { to: '/split', label: 'Split a bill', icon: Users },
            { to: '/swap', label: 'Swap tokens', icon: Repeat },
            { to: '/bridge', label: 'Bridge to or from Arc', icon: Waypoints },
          ].map(({ to, label, icon: Icon }) => (
            <Link key={to} to={to} className="glass card-hover rounded-xl p-4 min-h-[44px] flex items-center gap-3 text-sm font-medium" style={{ color: 'var(--ink)' }}>
              <span className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0" style={{ background: 'var(--accent-muted)' }}>
                <Icon size={16} style={{ color: 'var(--accent)' }} aria-hidden="true" />
              </span>
              <span className="flex-1">{label}</span>
              <ArrowRight size={14} style={{ color: 'var(--subtle)' }} aria-hidden="true" />
            </Link>
          ))}
        </div>
      </section>

      <section aria-label="Recent personal transactions" className="flex flex-col gap-3">
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-sm font-semibold" style={{ color: 'var(--ink)' }}>Recent personal transactions</h2>
          <Link to="/history?scope=personal" className="text-sm font-medium hover:underline" style={{ color: 'var(--accent)' }}>View all</Link>
        </div>
        <AlertBox variant="info">
          Swaps and bridges appear here once they are confirmed from this browser. Older ones made elsewhere are not listed.
        </AlertBox>
        <ActivityTable
          rows={personal} typeOptions={PERSONAL_TYPES} loading={activity.isLoading} error={activity.isError}
          onRetry={() => void activity.refetch()} pageSize={5} filters={false}
          emptyBody="Bill splits, swaps and bridges you make with this wallet appear here once they are confirmed."
        />
      </section>

      <StablecoinBalances address={address} />

      <section aria-label="Your bill splits" className="flex flex-col gap-3">
        <h2 className="text-sm font-semibold" style={{ color: 'var(--ink)' }}>Your bill splits</h2>
        <Card className="p-4"><BillsSection address={address} /></Card>
      </section>
    </div>
  )
}
