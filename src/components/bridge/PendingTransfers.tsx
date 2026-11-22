/** CCTP transfers that burned on the source chain and still need their destination mint, kept across page reloads. */
import { ExternalLink, Loader2 } from 'lucide-react'
import { Card, PrimaryButton } from '../ui'
import { endpointById } from '../../bridge/chains'
import type { PendingTransfer } from '../../bridge/pending'
import type { IrisState } from '../../bridge/useIris'

const fmtTime = (ms: number) => new Date(ms).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })

export default function PendingTransfers({ items, statuses, recovering, message, onFinish }: {
  items: PendingTransfer[]
  statuses: Record<string, IrisState>
  recovering: string | null
  message: { burnTx: string; text: string } | null
  onFinish: (t: PendingTransfer) => void
}) {
  if (items.length === 0) return null
  return (
    <Card className="p-4 sm:p-5 flex flex-col gap-3" >
      <div>
        <h2 className="text-sm font-semibold" style={{ color: 'var(--ink)' }}>Transfers in progress</h2>
        <p className="text-xs mt-1" style={{ color: 'var(--muted)' }}>
          These funds already left the source chain and are waiting to be minted on the destination. Finishing a transfer only asks Circle to confirm it and mints. It never sends the funds again.
        </p>
      </div>
      <ul className="flex flex-col gap-3">
        {items.map(t => {
          const from = endpointById(t.fromId)
          const to = endpointById(t.toId)
          const busy = recovering === t.burnTx
          const st = statuses[t.burnTx]
          const note = st === 'minted' ? `Done. This transfer has arrived on ${to.label}.`
            : st === 'ready' ? `Circle has confirmed the burn. It is ready to mint on ${to.label}.`
            : st === 'confirming' ? 'Waiting for Circle to confirm the burn. This usually takes a few minutes.'
            : 'Checking the status with Circle…'
          return (
            <li key={t.burnTx} className="rounded-xl p-3 flex flex-col gap-2" style={{ background: 'var(--surface-muted)', border: '1px solid var(--border)' }}>
              <div className="flex items-start justify-between gap-3 flex-wrap">
                <div className="min-w-0">
                  <p className="text-sm font-semibold tabular-nums" style={{ color: 'var(--ink)' }}>{t.amount} {t.token}: {from.label} to {to.label}</p>
                  <p className="text-xs" style={{ color: 'var(--muted)' }}>
                    Started {fmtTime(t.createdAt)} · burned on {from.label} ·{' '}
                    <a href={from.explorerTx(t.burnTx)} target="_blank" rel="noreferrer" className="inline-flex items-center gap-0.5 font-mono underline" style={{ color: 'var(--accent)' }}>
                      {t.burnTx.slice(0, 8)}…{t.burnTx.slice(-6)} <ExternalLink size={10} aria-hidden="true" />
                    </a>
                  </p>
                </div>
                <PrimaryButton onClick={() => onFinish(t)} loading={busy} disabled={recovering !== null} className="min-h-[44px]">
                  {busy ? 'Checking with Circle…' : 'Finish transfer'}
                </PrimaryButton>
              </div>
              {!busy && <p role="status" className="text-xs" style={{ color: 'var(--ink-2)' }}>{note}</p>}
              {busy && (
                <p role="status" className="text-xs flex items-center gap-1.5" style={{ color: 'var(--muted)' }}>
                  <Loader2 size={12} className="animate-spin" aria-hidden="true" /> Waiting for Circle's attestation. This can take a few minutes. Keep this page open.
                </p>
              )}
              {message?.burnTx === t.burnTx && !busy && (
                <p role="status" className="text-xs" style={{ color: 'var(--ink-2)' }}>{message.text}</p>
              )}
            </li>
          )
        })}
      </ul>
    </Card>
  )
}
