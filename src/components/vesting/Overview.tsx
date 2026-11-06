/**
 * Headline numbers for the streams the connected wallet pays or receives.
 * Every figure is read from the contracts (USDC, 6 decimals).
 */
import { Wallet, TrendingUp, CheckCircle2, Lock, PauseCircle, Activity, Inbox, Coins } from 'lucide-react'
import { StatCard } from '../ui'
import { formatUsdc } from '../../utils'
import { streamStatus, type ConsoleStream } from './consoleData'
import { useNow } from './shared'

export default function Overview({ streams, pendingApprovals }: { streams: ConsoleStream[]; pendingApprovals: number }) {
  const now = useNow(30_000)
  const live = streams.filter(s => !s.stream.cancelled)

  const sum = (f: (s: ConsoleStream) => bigint) => streams.reduce((a, s) => a + f(s), 0n)
  const committed = sum(s => (s.stream.cancelled ? 0n : s.stream.totalAmount))
  const vested = sum(s => (s.stream.cancelled ? 0n : (s.metrics?.vested ?? 0n)))
  const claimed = sum(s => (s.stream.cancelled ? 0n : s.stream.claimedAmount))
  const claimable = sum(s => (s.stream.cancelled ? 0n : (s.metrics?.claimable ?? 0n)))
  const yieldAvailable = sum(s => s.yieldInfo?.yieldEarned ?? 0n)
  const active = live.filter(s => streamStatus(s, now) === 'active').length
  const paused = live.filter(s => streamStatus(s, now) === 'paused').length
  const usdc = (v: bigint) => `${formatUsdc(v)} USDC`

  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
      <StatCard label="Total committed" value={usdc(committed)} icon={Wallet} accentColor="var(--vest-accent)" sub={`${live.length} open streams`} />
      <StatCard label="Vested to date" value={usdc(vested)} icon={TrendingUp} accentColor="var(--vest-accent)" />
      <StatCard label="Still locked" value={usdc(committed > vested ? committed - vested : 0n)} icon={Lock} accentColor="var(--accent)" />
      <StatCard label="Paid out (claimed)" value={usdc(claimed)} icon={CheckCircle2} accentColor="var(--success)" sub={`${usdc(claimable)} ready to claim`} />
      <StatCard label="Active streams" value={active} icon={Activity} accentColor="var(--vest-accent)" />
      <StatCard label="On pause now" value={paused} icon={PauseCircle} accentColor="var(--warning)" />
      <StatCard label="Awaiting approval" value={pendingApprovals} icon={Inbox} accentColor="var(--warning)" sub="leave requests" />
      <StatCard label="Yield available" value={usdc(yieldAvailable)} icon={Coins} accentColor="var(--success)" />
    </div>
  )
}
