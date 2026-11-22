/** From and To sections with a swap button. Arc is always on exactly one side. */
import { ArrowDown, ArrowUpDown } from 'lucide-react'
import { Chip } from './parts'
import { ENDPOINTS, swapDirection, withFrom, withTo, type Direction } from '../../bridge/chains'

function Side({ label, value, onPick, disabled, hide }: {
  label: string
  hide?: string[]
  value: Direction['from']
  onPick: (id: Direction['from']) => void
  disabled?: boolean
}) {
  return (
    <fieldset className="flex flex-col gap-2 rounded-2xl p-3"
      style={{ background: 'var(--surface-muted)', border: '1px solid var(--border)' }} disabled={disabled}>
      <legend className="sr-only">{label}</legend>
      <span className="text-xs font-semibold uppercase tracking-[0.1em]" style={{ color: 'var(--subtle)' }}>{label}</span>
      <div className="grid grid-cols-2 gap-2">
        {ENDPOINTS.filter(e => !hide?.includes(e.id)).map(e => (
          <Chip key={e.id} active={value === e.id} onClick={() => onPick(e.id)} label={`${label} ${e.label}`}>{e.label}</Chip>
        ))}
      </div>
    </fieldset>
  )
}

export default function DirectionPicker({ direction, onChange, disabled, hide }: {
  /** Endpoint ids to leave out, for providers that do not support them. */
  hide?: string[]
  direction: Direction
  onChange: (d: Direction) => void
  disabled?: boolean
}) {
  return (
    <div className="flex flex-col">
      <Side label="From" value={direction.from} onPick={id => onChange(withFrom(direction, id))} disabled={disabled} hide={hide} />
      <div className="flex justify-center -my-3 z-10">
        <button
          type="button"
          onClick={() => onChange(swapDirection(direction))}
          disabled={disabled}
          aria-label="Swap direction"
          title="Swap direction"
          className="w-11 h-11 rounded-full flex items-center justify-center transition-transform hover:rotate-180 disabled:opacity-40"
          style={{ background: 'var(--surface-strong)', border: '1px solid var(--border-strong)', color: 'var(--ink-2)' }}
        >
          <ArrowUpDown size={16} className="hidden sm:block" />
          <ArrowDown size={16} className="sm:hidden" />
        </button>
      </div>
      <Side label="To" value={direction.to} onPick={id => onChange(withTo(direction, id))} disabled={disabled} hide={hide} />
    </div>
  )
}
