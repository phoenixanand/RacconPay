/**
 * Yield details for a stream on the yield-enabled V2 contract: where the money is,
 * how much yield the grantor can withdraw, and the exit actions.
 */
import { useReadContract } from 'wagmi'
import { TrendingUp, Loader2 } from 'lucide-react'

import { Label } from '../ui'
import { formatUsdc } from '../../utils'
import { VESTING_STREAM_V2_YIELD_ABI as VESTING_ABI } from '../../abisV2Yield'
import { useTx, type StreamV2 } from './shared'

export default function YieldPanel({ chainId, contractAddress, streamId, stream, isGrantor, isBeneficiary, onDone }: {
  chainId: number
  contractAddress: `0x${string}`
  streamId: bigint
  stream: StreamV2
  isGrantor: boolean
  isBeneficiary: boolean
  onDone: () => void
}) {
  const { data, refetch } = useReadContract({
    address: contractAddress, abi: VESTING_ABI, functionName: 'getYieldInfo', args: [streamId], chainId,
    query: { refetchInterval: 15_000 },
  })
  const done = () => { void refetch(); onDone() }
  const withdrawYield = useTx(chainId, 'Yield credited. Withdraw it from the banner above.', done)
  const stopYield = useTx(chainId, 'Funds moved out of the vault', done)
  const unwind = useTx(chainId, 'Unwind complete', done)

  if (!data) return null
  const [useYield, idle, shares, valueNow, yieldEarned, debt] = data
  if (!useYield) return null

  const base = { address: contractAddress, abi: VESTING_ABI, args: [streamId] as const, chainId }
  const inVault = valueNow > idle ? valueNow - idle : 0n
  const canUnwind = stream.cancelled && (shares > 0n || debt > 0n || idle > 0n)
  const btn = 'flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-semibold transition-all disabled:opacity-50'

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center gap-2">
        <TrendingUp size={14} style={{ color: 'var(--vest-accent)' }} />
        <Label>Yield</Label>
      </div>
      <div className="rounded-xl overflow-hidden" style={{ background: 'var(--surface-muted)', border: '1px solid var(--border)' }}>
        {([
          ['In the vault (current value)', `${formatUsdc(inVault)} USDC`],
          ['Held in the contract', `${formatUsdc(idle)} USDC`],
          ['Yield available to the payer', `${formatUsdc(yieldEarned)} USDC`],
          ...(debt > 0n ? [['Owed to the payee, waiting for the vault', `${formatUsdc(debt)} USDC`]] : []),
        ] as [string, string][]).map(([k, v]) => (
          <div key={k} className="flex items-center justify-between gap-3 px-4 py-2.5 text-sm border-b border-[var(--border)] last:border-0">
            <span style={{ color: 'var(--subtle)' }}>{k}</span>
            <span className="tabular-nums" style={{ color: 'var(--ink-2)' }}>{v}</span>
          </div>
        ))}
      </div>
      <p className="text-xs text-pretty" style={{ color: 'var(--subtle)' }}>
        Yield belongs to the payer. The payee is always paid their vested amount first. If the vault cannot pay out,
        claims can be delayed until it can.
      </p>
      <div className="flex flex-wrap gap-2">
        {isGrantor && !stream.cancelled && (
          <button className={btn} style={{ background: 'var(--success-muted)', color: 'var(--success)' }}
                  disabled={withdrawYield.busy || yieldEarned === 0n}
                  onClick={() => withdrawYield.send({ ...base, functionName: 'withdrawYield' })}>
            {withdrawYield.busy && <Loader2 size={12} className="animate-spin" />}
            {withdrawYield.busy ? 'Working…' : 'Withdraw yield'}
          </button>
        )}
        {(isGrantor || isBeneficiary) && !stream.cancelled && shares > 0n && (
          <button className={btn} style={{ border: '1px solid var(--border-strong)', color: 'var(--ink-2)' }}
                  disabled={stopYield.busy}
                  onClick={() => stopYield.send({ ...base, functionName: 'stopYield' })}>
            {stopYield.busy && <Loader2 size={12} className="animate-spin" />}
            {stopYield.busy ? 'Working…' : 'Stop yield (move funds out of the vault)'}
          </button>
        )}
        {canUnwind && (
          <button className={btn} style={{ background: 'var(--accent-muted)', color: 'var(--accent)' }}
                  disabled={unwind.busy}
                  onClick={() => unwind.send({ ...base, functionName: 'unwind' })}>
            {unwind.busy && <Loader2 size={12} className="animate-spin" />}
            {unwind.busy ? 'Working…' : 'Retry payout from the vault'}
          </button>
        )}
      </div>
    </div>
  )
}
