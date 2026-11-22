/**
 * Gateway route: deposit USDC into a unified balance on the From chain, then spend it to the To chain.
 * One side is always Arc. Both actions only run from the user's click.
 */
import { ConnectKitButton } from 'connectkit'
import { ExternalLink, Loader2, RefreshCw, Waypoints, CheckCircle2 } from 'lucide-react'
import { Card, PrimaryButton, GhostButton, AlertBox, Divider } from '../ui'
import { Row } from './parts'
import DirectionPicker from './DirectionPicker'
import type { Direction } from '../../bridge/chains'
import { useGateway } from '../../bridge/useGateway'
import { formatToken, shortAddr } from '../../utils'

const chainLabel = (kit: string) => kit.replace(/_/g, ' ')

export default function GatewayPanel({ direction, onDirection }: { direction: Direction; onDirection: (d: Direction) => void }) {
  const g = useGateway(direction)
  const { source, dest, review, busy } = g
  const needsSolana = g.needsSolanaWallet && !g.solAddress
  const canAct = !!g.address && g.amountRaw > 0n && !needsSolana && !busy
  const canSpend = canAct && g.recipientValid && g.amountRaw <= g.sourceBalance

  return (
    <Card className="p-4 sm:p-5 flex flex-col gap-4 max-w-2xl mx-auto w-full">
        {!g.address ? (
        <div className="flex flex-col items-center gap-3 py-4 text-center">
          <p className="text-sm" style={{ color: 'var(--muted)' }}>Connect a wallet to use your unified balance.</p>
          <ConnectKitButton />
        </div>
      ) : (
        <>
          {/* Balance */}
          <div className="rounded-2xl p-4 flex flex-col gap-2" style={{ background: 'var(--surface-muted)', border: '1px solid var(--border)' }}>
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs font-semibold uppercase tracking-[0.1em]" style={{ color: 'var(--subtle)' }}>Unified balance</span>
              <button type="button" onClick={() => void g.refreshBalances()} aria-label="Refresh balance"
                className="w-9 h-9 flex items-center justify-center rounded-lg" style={{ color: 'var(--muted)' }}>
                <RefreshCw size={14} className={g.loadingBalances ? 'animate-spin' : ''} />
              </button>
            </div>
            <p className="font-display font-bold text-2xl tabular-nums" style={{ color: 'var(--ink)' }}>
              {g.balances ? `${formatToken(g.balances.total, 6)} USDC` : g.loadingBalances ? 'Loading…' : '-'}
            </p>
            {g.balances && g.balances.pending > 0n && (
              <p className="text-xs" style={{ color: 'var(--warning)' }}>
                {formatToken(g.balances.pending, 6)} USDC pending confirmation
              </p>
            )}
            {g.balances?.byChain.map(c => (
              <Row key={c.chain} label={chainLabel(c.chain)}>{formatToken(c.confirmed, 6)} USDC</Row>
            ))}
            {g.balances && g.balances.byChain.length === 0 && (
              <p className="text-xs" style={{ color: 'var(--subtle)' }}>Nothing deposited yet. Add USDC below to start.</p>
            )}
          </div>

          <DirectionPicker direction={direction} onChange={onDirection} disabled={!!busy} />

          {g.needsSolanaWallet && (
            <div className="rounded-2xl p-3 flex items-center justify-between gap-3 flex-wrap"
              style={{ background: 'var(--surface-muted)', border: '1px solid var(--border)' }}>
              <span className="text-sm min-w-0 break-all" style={{ color: 'var(--muted)' }}>
                {g.solAddress ? `Solana wallet ${g.solAddress.slice(0, 4)}…${g.solAddress.slice(-4)}` : 'Solana wallet not connected'}
              </span>
              {!g.solAddress && <GhostButton onClick={() => void g.connectSolana()} className="min-h-[44px]">Connect Phantom</GhostButton>}
            </div>
          )}

          {/* Amount */}
          <div className="rounded-2xl p-4 flex flex-col gap-2" style={{ background: 'var(--surface-muted)', border: '1px solid var(--border)' }}>
            <div className="flex items-center justify-between text-xs" style={{ color: 'var(--subtle)' }}>
              <span className="font-semibold uppercase tracking-[0.1em]">Amount (USDC)</span>
              <span className="tabular-nums">On {source.label}: {formatToken(g.sourceBalance, 6)}</span>
            </div>
            <input
              inputMode="decimal" value={g.amount} placeholder="0.00" aria-label="Amount of USDC"
              onChange={e => g.setAmount(e.target.value.replace(/[^0-9.]/g, ''))}
              className="w-full bg-transparent outline-none font-display font-bold text-2xl tabular-nums"
              style={{ color: 'var(--ink)' }}
            />
          </div>

          <label className="flex flex-col gap-1.5">
            <span className="text-xs font-semibold uppercase tracking-[0.1em]" style={{ color: 'var(--subtle)' }}>
              {dest.family === 'solana' ? 'Receive on Solana (address)' : `Receive on ${dest.label} (address)`}
            </span>
            <input
              value={g.recipientInput} placeholder={dest.family === 'solana' ? (g.solAddress ?? 'Solana address') : g.address} spellCheck={false}
              onChange={e => g.setRecipientInput(e.target.value)}
              className="w-full rounded-xl px-3.5 py-3 text-sm outline-none font-mono min-h-[44px]"
              style={{ background: 'var(--surface-muted)', color: 'var(--ink)', border: '1px solid var(--border)' }}
            />
          </label>

          {g.error && <AlertBox variant="danger">{g.error}</AlertBox>}

          {review && (
            <div className="rounded-2xl p-4 flex flex-col gap-2.5" style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
              <Row label="Spend from">{review.source.label} balance</Row>
              <Row label="To">{review.dest.label}</Row>
              <Row label="Recipient">{shortAddr(review.recipient)}</Row>
              <Row label="You send">{review.amount} USDC</Row>
              {review.fees.map((f, i) => (
                <Row key={i} label={`Fee: ${f.type}`}>{f.amount} {f.token}</Row>
              ))}
              <Divider />
              <p className="text-xs" style={{ color: 'var(--subtle)' }}>
                You sign once on {review.source.label}. Circle mints on {review.dest.label} for you, so you do not need to switch networks or hold gas there.
                Fees come out of your unified balance.
              </p>
            </div>
          )}

          {busy && (
            <div className="rounded-xl px-4 py-3 text-sm flex items-center gap-2"
              style={{ background: 'var(--surface-muted)', border: '1px solid var(--border)', color: 'var(--muted)' }}>
              <Loader2 size={14} className="animate-spin shrink-0" />
              {busy === 'deposit' ? 'Waiting for your wallet and the deposit confirmation.' : busy === 'spend' ? 'Waiting for your wallet and the transfer.' : 'Getting a quote.'}
            </div>
          )}

          {g.done && (
            <div className="rounded-xl px-4 py-3 text-sm flex flex-col gap-1"
              style={{ background: 'var(--success-muted)', border: '1px solid color-mix(in srgb, var(--success) 25%, transparent)', color: 'var(--success)' }}>
              <span className="font-semibold flex items-center gap-1.5">
                <CheckCircle2 size={14} />
                {g.done.kind === 'deposit' ? `Deposited ${g.done.amount} USDC from ${g.done.chain}` : `Sent ${g.done.amount} USDC to ${g.done.chain}`}
              </span>
              {g.done.explorerUrl && (
                <a href={g.done.explorerUrl} target="_blank" rel="noreferrer" className="flex items-center gap-1 text-xs" style={{ color: 'var(--accent)' }}>
                  <ExternalLink size={11} /> View transaction
                </a>
              )}
              {g.done.kind === 'deposit' && (
                <span className="text-xs">It shows as confirmed in your balance once the source chain finalizes it.</span>
              )}
            </div>
          )}

          {/* Actions */}
          {review ? (
            <div className="flex flex-col gap-2">
              <PrimaryButton onClick={() => void g.spend()} loading={busy === 'spend'}>
                <Waypoints size={14} /> Send {review.amount} USDC to {review.dest.label}
              </PrimaryButton>
              <GhostButton onClick={g.cancelReview} disabled={busy === 'spend'} className="min-h-[44px]">Cancel</GhostButton>
            </div>
          ) : (
            <div className="flex flex-col gap-2">
              <PrimaryButton onClick={() => void g.getReview()} disabled={!canSpend} loading={busy === 'review'}>
                Review transfer to {dest.label}
              </PrimaryButton>
              <GhostButton onClick={() => void g.deposit()} disabled={!canAct} className="min-h-[44px]">
                {busy === 'deposit' ? 'Depositing…' : `Deposit ${g.amount || ''} USDC from ${source.label}`.replace('  ', ' ')}
              </GhostButton>
            </div>
          )}
        </>
      )}
    </Card>
  )
}
