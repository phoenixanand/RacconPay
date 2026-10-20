/**
 * Bill Splitter page (coming next)
 */
import { Users } from 'lucide-react'

export default function SplitPage() {
  return (
    <div className="flex flex-col items-center text-center py-20 gap-3">
      <Users size={40} className="text-slate-300" />
      <h1 className="text-lg font-semibold text-[#1B3158]">Bill Splitter</h1>
      <p className="text-sm text-slate-400 max-w-xs">
        Equal-split group expenses settled with USDC.
      </p>
    </div>
  )
}
