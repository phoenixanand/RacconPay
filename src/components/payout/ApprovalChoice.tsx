/**
 * Choose how a payout is released: send it now, or require approval from two co-signers first.
 * The approval count is fixed at two co-signers; the contract does not support 1 or 3+.
 */
import { AlertCircle } from 'lucide-react'
import { isAddress } from 'viem'
import { Card } from '../ui'

export type PayoutMode = 'now' | 'approval'

export interface CoSignerCheck { valid: boolean; msg1: string; msg2: string }

/** Validation for the two co-signers. Mirrors the contract: valid, different from each other, not the proposer. */
export function checkCoSigners(c1: string, c2: string, me: string | undefined): CoSignerCheck {
  const lc = (s: string) => s.toLowerCase()
  const msg1 = !c1 ? '' : !isAddress(c1) ? 'Not a valid wallet address' : lc(c1) === lc(me ?? '') ? 'Cannot be your own address' : ''
  const msg2 = !c2 ? '' : !isAddress(c2) ? 'Not a valid wallet address'
    : lc(c2) === lc(c1) ? 'Must differ from co-signer 1' : lc(c2) === lc(me ?? '') ? 'Cannot be your own address' : ''
  return { valid: isAddress(c1) && isAddress(c2) && !msg1 && !msg2, msg1, msg2 }
}

const fieldClass = 'w-full min-h-[44px] rounded-lg px-3 py-2.5 text-sm outline-none transition-colors placeholder:text-[var(--subtle)] focus:border-[var(--accent)] focus:ring-2 focus:ring-[var(--accent-glow)] font-mono text-xs'
const fieldStyle = (bad: boolean) => ({ background: 'var(--surface)', color: 'var(--ink)', border: `1px solid ${bad ? 'var(--danger)' : 'var(--border-strong)'}` })

export default function ApprovalChoice({
  mode, onMode, coSigner1, coSigner2, description, onCoSigner1, onCoSigner2, onDescription, me, tooMany, disabled,
}: {
  mode: PayoutMode; onMode: (m: PayoutMode) => void
  coSigner1: string; coSigner2: string; description: string
  onCoSigner1: (v: string) => void; onCoSigner2: (v: string) => void; onDescription: (v: string) => void
  me: string | undefined
  /** True when the list has more than 100 recipients, which an approval request cannot hold. */
  tooMany: boolean
  disabled?: boolean
}) {
  const check = checkCoSigners(coSigner1, coSigner2, me)
  const options: { id: PayoutMode; title: string; body: string }[] = [
    { id: 'now', title: 'Send now', body: 'Your wallet pays the whole list straight away. No approval needed.' },
    { id: 'approval', title: 'Require approval', body: 'Two co-signers must approve before anything is paid. Good for large amounts.' },
  ]
  return (
    <Card className="p-4 flex flex-col gap-4">
      <h2 className="text-sm font-semibold" style={{ color: 'var(--ink)' }}>2. How should this be released?</h2>
      <div role="radiogroup" aria-label="Release method" className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {options.map(o => {
          const on = mode === o.id
          return (
            <button
              key={o.id} type="button" role="radio" aria-checked={on} disabled={disabled} onClick={() => onMode(o.id)}
              className="text-left rounded-lg p-3.5 flex flex-col gap-1 min-h-[44px] disabled:opacity-60"
              style={{ background: on ? 'var(--accent-muted)' : 'var(--surface)', border: `1px solid ${on ? 'var(--accent)' : 'var(--border-strong)'}` }}
            >
              <span className="text-sm font-semibold" style={{ color: on ? 'var(--accent)' : 'var(--ink)' }}>{o.title}</span>
              <span className="text-xs" style={{ color: 'var(--muted)' }}>{o.body}</span>
            </button>
          )
        })}
      </div>

      {mode === 'approval' && (
        <div className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <label htmlFor="approval-desc" className="text-xs font-medium" style={{ color: 'var(--ink-2)' }}>Description</label>
            <input id="approval-desc" className={`${fieldClass} font-sans`} style={fieldStyle(false)} placeholder="e.g. October payroll"
              value={description} onChange={e => onDescription(e.target.value)} disabled={disabled} />
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {([['cosigner-1', 'Co-signer 1', coSigner1, onCoSigner1, check.msg1], ['cosigner-2', 'Co-signer 2', coSigner2, onCoSigner2, check.msg2]] as const).map(([id, label, value, onChange, msg]) => (
              <div key={id} className="flex flex-col gap-1.5">
                <label htmlFor={id} className="text-xs font-medium" style={{ color: 'var(--ink-2)' }}>{label}</label>
                <input id={id} className={fieldClass} style={fieldStyle(!!msg)} placeholder="0x…" value={value} spellCheck={false}
                  onChange={e => onChange(e.target.value.trim())} aria-invalid={!!msg} disabled={disabled} />
                {msg && <p role="alert" className="text-xs flex items-center gap-1" style={{ color: 'var(--danger)' }}><AlertCircle size={12} aria-hidden="true" /> {msg}</p>}
              </div>
            ))}
          </div>
          {tooMany && (
            <p role="alert" className="text-xs flex items-start gap-1.5" style={{ color: 'var(--danger)' }}>
              <AlertCircle size={13} className="mt-0.5 shrink-0" aria-hidden="true" />
              An approval request holds up to 100 recipients. Split the file into smaller lists, or choose Send now.
            </p>
          )}
          <ul className="text-xs flex flex-col gap-1 list-disc pl-4" style={{ color: 'var(--muted)' }}>
            <li>Both co-signers must approve, and either one can reject. Requests expire after 7 days.</li>
            <li>Approval is a process check: when it is approved, your wallet pays the list. It does not lock your funds before then.</li>
            <li>The number of approvals is fixed at two.</li>
          </ul>
        </div>
      )}
    </Card>
  )
}
