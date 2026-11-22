/** Horizontal step indicator for multi-step payment flows. Presentation only. */
import { Check } from 'lucide-react'

export function Stepper({ steps, current, failed = false }: { steps: string[]; current: number; failed?: boolean }) {
  return (
    <ol className="flex items-center gap-1 overflow-x-auto no-scrollbar" aria-label="Progress">
      {steps.map((label, i) => {
        const done = i < current
        const active = i === current
        const bad = active && failed
        const color = bad ? 'var(--danger)' : done || active ? 'var(--accent)' : 'var(--subtle)'
        return (
          <li key={label} className="flex items-center gap-1 shrink-0" aria-current={active ? 'step' : undefined}>
            <span
              className="w-6 h-6 rounded-full flex items-center justify-center text-xs font-semibold tabular-nums"
              style={{
                background: done ? 'var(--accent)' : active ? 'var(--accent-muted)' : 'var(--surface-muted)',
                color: done ? 'var(--on-accent)' : color,
                border: `1px solid ${active || done ? color : 'var(--border)'}`,
              }}
            >
              {done ? <Check size={13} aria-hidden="true" /> : i + 1}
            </span>
            <span className="text-xs font-medium pr-1" style={{ color: active ? 'var(--ink)' : 'var(--muted)' }}>{label}</span>
            {i < steps.length - 1 && <span className="w-4 h-px" style={{ background: 'var(--border-strong)' }} aria-hidden="true" />}
          </li>
        )
      })}
    </ol>
  )
}
