/**
 * Banner showing USDC credited to the wallet by cancelled streams, with a Withdraw button.
 */
import { Loader2 } from 'lucide-react'
import { Label } from '../ui'
import { formatUsdc } from '../../utils'
import { VESTING_STREAM_V2_YIELD_ABI as VESTING_ABI } from '../../abisV2Yield'
import { useTx } from './shared'

export default function PendingBanner({ amount, contract, chainId, label, onDone }: {
  amount: bigint
  contract: `0x${string}`
  chainId: number
  label: string
  onDone: () => void
}) {
  const withdraw = useTx(chainId, 'Withdrawn', onDone)
  if (amount === 0n) return null
  return (
    <div className="flex items-center justify-between gap-4 rounded-2xl px-5 py-4"
         style={{ background: 'var(--warning-muted)', border: '1px solid rgba(245,192,90,0.25)' }}>
      <div>
        <Label>Ready to withdraw</Label>
        <p className="font-display font-bold text-xl tabular-nums mt-0.5" style={{ color: 'var(--warning)', letterSpacing: '-0.02em' }}>
          {formatUsdc(amount)} <span className="text-sm font-normal">USDC</span>
        </p>
        <p className="text-xs mt-0.5" style={{ color: 'var(--warning)' }}>{label}</p>
      </div>
      <button onClick={() => withdraw.send({ address: contract, abi: VESTING_ABI, functionName: 'withdraw', chainId })}
              disabled={withdraw.busy}
              className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold transition-all hover:scale-[1.02] disabled:opacity-50 shrink-0"
              style={{ background: 'var(--warning)', color: '#080f1a' }}>
        {withdraw.busy && <Loader2 size={13} className="animate-spin" />}
        {withdraw.busy ? 'Withdrawing…' : 'Withdraw'}
      </button>
    </div>
  )
}
