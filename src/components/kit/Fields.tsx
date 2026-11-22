/** Labelled native select and date input, styled to match Input. Native controls keep keyboard and mobile pickers working. */
import { useId } from 'react'
import { Label } from '../ui'

const fieldClass = `w-full min-h-[44px] rounded-lg px-3.5 py-2.5 text-sm outline-none transition-colors
  focus:border-[var(--accent)] focus:ring-2 focus:ring-[var(--accent-glow)]`
const fieldStyle = { background: 'var(--surface)', color: 'var(--ink)', border: '1px solid var(--border-strong)' }

export function Select({ label, value, onChange, options, className = '' }: {
  label?: string; value: string; onChange: (v: string) => void
  options: { value: string; label: string }[]; className?: string
}) {
  const id = useId()
  return (
    <div className="flex flex-col gap-1.5">
      {label && <Label htmlFor={id}>{label}</Label>}
      <select id={id} value={value} onChange={e => onChange(e.target.value)} className={`${fieldClass} ${className}`} style={fieldStyle}>
        {options.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
    </div>
  )
}

export function DateField({ label, value, onChange, min, max }: {
  label?: string; value: string; onChange: (v: string) => void; min?: string; max?: string
}) {
  const id = useId()
  return (
    <div className="flex flex-col gap-1.5">
      {label && <Label htmlFor={id}>{label}</Label>}
      <input id={id} type="date" value={value} min={min} max={max} onChange={e => onChange(e.target.value)} className={fieldClass} style={fieldStyle} />
    </div>
  )
}
