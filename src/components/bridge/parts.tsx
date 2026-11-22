/** Small shared pieces for the bridge provider panels. */

export function Chip({ active, onClick, children, label }: { active: boolean; onClick: () => void; children: React.ReactNode; label?: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      aria-label={label}
      className="px-3 rounded-xl text-sm font-semibold transition-all min-h-[44px] flex-1 min-w-0"
      style={{
        background: active ? 'var(--accent)' : 'var(--surface-strong)',
        color: active ? 'var(--on-accent)' : 'var(--muted)',
        border: active ? '1px solid var(--accent)' : '1px solid var(--border)',
      }}
    >
      {children}
    </button>
  )
}

export function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-3 text-sm">
      <span className="shrink-0" style={{ color: 'var(--muted)' }}>{label}</span>
      <span className="font-semibold tabular-nums text-right break-words min-w-0" style={{ color: 'var(--ink)' }}>{children}</span>
    </div>
  )
}

export type StepState = 'waiting' | 'active' | 'done' | 'failed'
export interface TimelineStep { label: string; state: StepState; hash?: string; url?: string }

const dot: Record<StepState, { color: string; text: string }> = {
  waiting: { color: 'var(--border-strong)', text: 'Waiting' },
  active:  { color: 'var(--accent)',        text: 'In progress' },
  done:    { color: 'var(--success)',       text: 'Done' },
  failed:  { color: 'var(--danger)',        text: 'Failed' },
}

/** Vertical progress list. A step is Done only when the chain or provider reported it, never assumed. */
export function Timeline({ steps }: { steps: TimelineStep[] }) {
  return (
    <ol className="flex flex-col" aria-label="Transfer progress">
      {steps.map((st, i) => (
        <li key={i} className="flex gap-3 pb-3 last:pb-0">
          <div className="flex flex-col items-center">
            <span className="w-3 h-3 rounded-full mt-1 shrink-0" style={{ background: st.state === 'waiting' ? 'transparent' : dot[st.state].color, border: `2px solid ${dot[st.state].color}` }} aria-hidden="true" />
            {i < steps.length - 1 && <span className="w-px flex-1 mt-1" style={{ background: 'var(--border)' }} aria-hidden="true" />}
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-medium" style={{ color: st.state === 'waiting' ? 'var(--muted)' : 'var(--ink)' }}>
              {st.label} <span className="sr-only">: {dot[st.state].text}</span>
            </p>
            <p className="text-xs" style={{ color: st.state === 'failed' ? 'var(--danger)' : 'var(--muted)' }} aria-hidden="true">{dot[st.state].text}</p>
            {st.hash && (
              <a href={st.url} target="_blank" rel="noreferrer" className="font-mono text-xs hover:underline break-all" style={{ color: 'var(--accent)' }}>
                {st.hash.slice(0, 10)}…{st.hash.slice(-6)}
              </a>
            )}
          </div>
        </li>
      ))}
    </ol>
  )
}
