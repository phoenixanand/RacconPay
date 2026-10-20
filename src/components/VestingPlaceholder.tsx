/**
 * Vesting / Streaming page (coming next)
 */
import { Clock } from 'lucide-react'

export default function VestingPage() {
  return (
    <div className="flex flex-col items-center text-center py-20 gap-3">
      <Clock size={40} className="text-slate-300" />
      <h1 className="text-lg font-semibold text-[#1B3158]">Vesting &amp; Streaming</h1>
      <p className="text-sm text-slate-400 max-w-xs">
        Linear USDC vesting streams.
      </p>
    </div>
  )
}
