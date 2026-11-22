/** Provider selector: each option shows an honest status, and unavailable ones explain why. */
import { useState } from 'react'
import { Check, Info, Loader2 } from 'lucide-react'
import { PROVIDERS, providerById, type ProviderId } from '../../bridge/providers'
import type { ProviderStates } from '../../bridge/probe'

interface Props {
  value: ProviderId
  onChange: (id: ProviderId) => void
  states: ProviderStates
}

export default function ProviderPicker({ value, onChange, states }: Props) {
  // Which unavailable provider's reason is open. Tapping an unavailable option never selects it.
  const [explain, setExplain] = useState<ProviderId | null>(null)
  const selected = providerById(value)
  const explained = explain ? states[explain] : undefined

  return (
    <div className="flex flex-col gap-3 max-w-md mx-auto w-full">
      <div role="radiogroup" aria-label="Bridge provider" className="grid grid-cols-2 sm:grid-cols-3 gap-2">
        {PROVIDERS.map(p => {
          const st = states[p.id]
          const usable = st.status === 'ready'
          const active = value === p.id
          return (
            <button
              key={p.id}
              type="button"
              role="radio"
              aria-checked={active}
              onClick={() => {
                if (usable) { onChange(p.id); setExplain(null) } else setExplain(e => (e === p.id ? null : p.id))
              }}
              className="flex flex-col items-start gap-1 rounded-2xl px-3.5 py-3 text-left min-h-[64px] transition-all"
              style={{
                background: active ? 'color-mix(in srgb, var(--accent) 12%, var(--surface))' : 'var(--surface)',
                border: `1px solid ${active ? 'var(--accent)' : 'var(--border)'}`,
                opacity: usable || st.status === 'checking' ? 1 : 0.75,
              }}
            >
              <span className="flex items-center gap-1.5 text-sm font-bold" style={{ color: 'var(--ink)' }}>
                {p.label}
                {active && <Check size={13} style={{ color: 'var(--accent)' }} />}
              </span>
              <span className="flex items-center gap-1 text-[11px] font-medium"
                style={{ color: usable ? 'var(--success)' : 'var(--subtle)' }}>
                {st.status === 'checking' && <Loader2 size={10} className="animate-spin" />}
                {st.status === 'ready' ? 'Ready' : st.status === 'checking' ? 'Checking' : 'Unavailable'}
              </span>
            </button>
          )
        })}
      </div>

      {explained?.reason && (
        <p className="flex items-start gap-2 rounded-xl px-3.5 py-3 text-xs leading-relaxed"
          style={{ background: 'var(--surface-muted)', border: '1px solid var(--border)', color: 'var(--muted)' }}>
          <Info size={13} className="mt-0.5 shrink-0" />
          {explained.reason}
        </p>
      )}

      <div className="rounded-xl px-3.5 py-3 text-xs leading-relaxed flex flex-col gap-1"
        style={{ background: 'var(--surface-muted)', border: '1px solid var(--border)', color: 'var(--muted)' }}>
        <span>{selected.blurb}</span>
        <span style={{ color: 'var(--subtle)' }}>{selected.hint} {selected.speed}</span>
      </div>
    </div>
  )
}
