/** Across route, to or from Arc, USDC on EVM chains. Only rendered when the live check found Arc in Across's chain list. */
import { useReadContract } from 'wagmi'
import { erc20Abi } from 'viem'
import { ConnectKitButton } from 'connectkit'
import { Loader2, Waypoints } from 'lucide-react'
import { Card, PrimaryButton, GhostButton, AlertBox } from '../ui'
import { Row, Timeline, type TimelineStep } from './parts'
import DirectionPicker from './DirectionPicker'
import type { Direction } from '../../bridge/chains'
import { useAcross } from '../../bridge/useAcross'
import { formatToken, parseToken, shortAddr } from '../../utils'

export default function AcrossPanel({ direction, onDirection }: { direction: Direction; onDirection: (d: Direction) => void }) {
  const a = useAcross(direction)
  const { review, busy, from, to } = a

  const tokenAddress = from.tokenAddress?.USDC
  const { data: balance } = useReadContract({
    address: tokenAddress, abi: erc20Abi, functionName: 'balanceOf',
    args: a.address ? [a.address] : undefined, chainId: from.chainId,
    query: { enabled: !!a.address && !!tokenAddress && !!from.chainId && a.supported },
  })

  let amountRaw = 0n
  try { amountRaw = a.amount ? parseToken(a.amount, 6) : 0n } catch { amountRaw = 0n }
  const insufficient = balance !== undefined && amountRaw > balance
  const canReview = !!a.address && a.supported && amountRaw > 0n && !insufficient && a.recipientValid && !busy

  // Progress. The transfer is complete only when Across reports the fill on the destination chain.
  const sent = !!a.depositHash
  const steps: TimelineStep[] = [
    { label: `Deposit on ${from.label} (source)`, state: sent ? 'done' : busy === 'send' ? 'active' : 'waiting', hash: a.depositHash, url: a.depositHash ? from.explorerTx(a.depositHash) : undefined },
    {
      label: `Fill on ${to.label} (destination)`,
      state: a.fill?.status === 'filled' ? 'done' : a.fill?.status === 'problem' ? 'failed' : sent ? 'active' : 'waiting',
      hash: a.fill?.status === 'filled' ? a.fill.fillHash : undefined,
      url: a.fill?.status === 'filled' && a.fill.fillHash ? to.explorerTx(a.fill.fillHash) : undefined,
    },
  ]

  return (
    <Card className="p-4 sm:p-5 flex flex-col gap-4 max-w-2xl mx-auto w-full">
      {!a.address ? (
        <div className="flex flex-col items-center gap-3 py-4 text-center">
          <p className="text-sm" style={{ color: 'var(--muted)' }}>Connect a wallet to get a quote.</p>
          <ConnectKitButton />
        </div>
      ) : (
        <>
          <DirectionPicker direction={direction} onChange={onDirection} disabled={busy === 'send'} hide={['solana']} />

          <div className="rounded-xl p-4 flex flex-col gap-2" style={{ background: 'var(--surface-muted)', border: '1px solid var(--border)' }}>
            <div className="flex items-center justify-between text-xs gap-2" style={{ color: 'var(--muted)' }}>
              <label htmlFor="across-amount" className="font-medium">Amount (USDC)</label>
              {balance !== undefined && (
                <span className="tabular-nums">
                  Balance {formatToken(balance, 6)}
                  {balance > 0n && (
                    <button type="button" onClick={() => a.setAmount(formatToken(balance, 6))}
                      className="ml-2 px-2 min-h-[32px] rounded font-semibold hover:bg-[var(--accent-muted)]" style={{ color: 'var(--accent)' }}>Max</button>
                  )}
                </span>
              )}
            </div>
            <input
              id="across-amount" inputMode="decimal" value={a.amount} placeholder="0.00"
              onChange={e => a.setAmount(e.target.value.replace(/[^0-9.]/g, ''))}
              className="w-full bg-transparent outline-none font-semibold text-2xl tabular-nums"
              style={{ color: 'var(--ink)' }}
            />
          </div>

          <label className="flex flex-col gap-1.5">
            <span className="text-xs font-medium" style={{ color: 'var(--ink-2)' }}>Receive on {to.label} (address)</span>
            <input
              value={a.recipientInput} placeholder={a.address} spellCheck={false}
              onChange={e => a.setRecipientInput(e.target.value)}
              aria-invalid={!!a.recipientInput && !a.recipientValid}
              className="w-full rounded-lg px-3.5 py-3 text-sm outline-none font-mono min-h-[44px] focus:border-[var(--accent)] focus:ring-2 focus:ring-[var(--accent-glow)]"
              style={{ background: 'var(--surface)', color: 'var(--ink)', border: `1px solid ${a.recipientInput && !a.recipientValid ? 'var(--danger)' : 'var(--border-strong)'}` }}
            />
            <span className="text-xs" style={{ color: a.recipientInput && !a.recipientValid ? 'var(--danger)' : 'var(--muted)' }}>
              {a.recipientInput && !a.recipientValid ? `This is not a valid ${to.label} address.` : 'Defaults to your connected wallet. A wrong address cannot be recovered.'}
            </span>
          </label>

          {insufficient && <AlertBox variant="danger">Amount is more than your USDC balance on {from.label}.</AlertBox>}
          {a.error && <AlertBox variant="danger">{a.error}</AlertBox>}

          {review && (
            <div className="rounded-xl p-4 flex flex-col gap-2.5" style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
              <Row label="Route">{review.from.label} to {review.to.label}</Row>
              <Row label="Recipient">{shortAddr(review.recipient)}</Row>
              <Row label="You send">{review.amount} USDC</Row>
              <Row label="You receive (estimate)">{a.formatOut(review.expectedOutput)} USDC</Row>
              <Row label="Minimum received">{a.formatOut(review.minOutput)} USDC</Row>
              {review.fillSeconds !== undefined && review.fillSeconds > 0 && <Row label="Estimated fill">about {review.fillSeconds}s</Row>}
              <p className="text-xs" style={{ color: 'var(--muted)' }}>
                {review.approvals.length > 0 ? 'Your wallet will ask for an approval, then the deposit.' : 'Your wallet will ask you to confirm the deposit.'}
                {' '}Quotes and fees come from Across. The transfer is complete only when the fill on {review.to.label} is confirmed below.
              </p>
            </div>
          )}

          {busy === 'send' && (
            <p role="status" className="flex items-center gap-2 text-xs" style={{ color: 'var(--muted)' }}>
              <Loader2 size={14} className="animate-spin shrink-0" aria-hidden="true" /> Waiting for your wallet and the network. Keep this page open.
            </p>
          )}

          {(sent || busy === 'send') && (
            <div className="rounded-xl p-4" style={{ background: 'var(--surface-muted)', border: '1px solid var(--border)' }}>
              <Timeline steps={steps} />
              {a.fill?.status === 'filled' && <p className="text-sm font-medium mt-3" style={{ color: 'var(--success)' }}>Completed: the fill on {to.label} is confirmed.</p>}
              {a.fill?.status === 'waiting' && <p className="text-xs mt-3" style={{ color: 'var(--muted)' }}>Not completed yet. Waiting for Across to report the fill on {to.label}. Keep this page open.</p>}
              {a.fill?.status === 'problem' && <p className="text-sm mt-3" style={{ color: 'var(--danger)' }}>{a.fill.text}</p>}
            </div>
          )}

          {review ? (
            <div className="flex flex-col gap-2">
              <PrimaryButton onClick={() => void a.send()} loading={busy === 'send'}>
                <Waypoints size={14} /> Bridge {review.amount} USDC with Across
              </PrimaryButton>
              <GhostButton onClick={a.cancel} disabled={busy === 'send'} className="min-h-[44px]">Cancel</GhostButton>
            </div>
          ) : (
            <PrimaryButton onClick={() => void a.getReview()} disabled={!canReview} loading={busy === 'review'}>
              Get quote
            </PrimaryButton>
          )}
        </>
      )}
    </Card>
  )
}
