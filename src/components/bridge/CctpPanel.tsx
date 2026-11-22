/**
 * CCTP route: USDC and EURC to or from Arc Mainnet, with Ethereum, Base, Avalanche and Solana.
 * Circle CCTP through App Kit. Nothing is sent until the user clicks Bridge.
 */
import { useReadContract } from 'wagmi'
import { erc20Abi } from 'viem'
import { ConnectKitButton } from 'connectkit'
import { Loader2, RotateCcw, Waypoints } from 'lucide-react'
import { Chip, Row, Timeline, type StepState, type TimelineStep } from './parts'
import { Card, PrimaryButton, GhostButton, AlertBox, Divider } from '../ui'
import DirectionPicker from './DirectionPicker'
import type { Direction } from '../../bridge/chains'
import { useBridge } from '../../bridge/useBridge'
import { formatToken, parseToken, shortAddr } from '../../utils'

const TOKEN_DECIMALS = 6

export default function CctpPanel({ direction, onDirection }: { direction: Direction; onDirection: (d: Direction) => void }) {
  const b = useBridge(direction)
  const { from, to, token, review } = b

  const tokenAddress = from.tokenAddress?.[token]
  const { data: balance } = useReadContract({
    address: tokenAddress, abi: erc20Abi, functionName: 'balanceOf',
    args: b.address ? [b.address] : undefined, chainId: from.chainId,
    query: { enabled: !!b.address && !!tokenAddress && !!from.chainId },
  })

  let amountRaw = 0n
  try { amountRaw = b.amount ? parseToken(b.amount, TOKEN_DECIMALS) : 0n } catch { amountRaw = 0n }
  const insufficient = balance !== undefined && amountRaw > balance
  const needsSolana = b.needsSolanaWallet && !b.solAddress
  const busy = b.reviewing || b.bridging
  const canReview = !!b.address && amountRaw > 0n && !insufficient && b.recipientValid && !needsSolana && !busy
  // Completed only when the destination mint step has succeeded, not when the source burn did.
  const minted = !!b.result?.steps.some(st => /mint/i.test(st.name) && st.state === 'success')
  const finished = b.result?.state === 'success' && minted

  // Progress for the aside. Each stage is Done only when the SDK reported it.
  const stage = (re: RegExp, label: string, explorer: (h: string) => string): TimelineStep => {
    const fromResult = b.result?.steps.find(st => re.test(st.name))
    const fromEvent = b.events.find(e => re.test(e.name))
    const hash = fromResult?.txHash ?? fromEvent?.txHash
    const state: StepState = fromResult?.state === 'error' ? 'failed' : fromResult?.state === 'success' || (!fromResult && fromEvent) ? 'done' : 'waiting'
    return { label, state, hash, url: hash ? explorer(hash) : undefined }
  }
  const steps: TimelineStep[] = [
    stage(/approve/i, `Approve ${token} on ${from.label}`, from.explorerTx),
    stage(/burn/i, `Burn on ${from.label} (source)`, from.explorerTx),
    stage(/attest/i, 'Circle attestation', from.explorerTx),
    stage(/mint/i, `Mint on ${to.label} (destination)`, to.explorerTx),
  ]
  // The first stage that is not done is the one in progress while a transfer is running.
  if (b.bridging) { const i = steps.findIndex(st => st.state === 'waiting'); if (i >= 0) steps[i] = { ...steps[i], state: 'active' } }
  const anyFailed = b.result?.steps.some(st => st.state === 'error')
  const statusLabel = finished ? 'Completed' : anyFailed ? 'Not completed' : b.bridging ? 'In progress' : b.result ? 'Not completed' : review ? 'Ready to send' : 'Not started'
  const statusColor = finished ? 'var(--success)' : anyFailed || (b.result && !finished) ? 'var(--danger)' : b.bridging ? 'var(--accent)' : 'var(--muted)'

  return (
  <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_380px] gap-5 items-start">
  <Card className="p-4 sm:p-5 flex flex-col gap-4 w-full">
    {!b.address ? (
      <div className="flex flex-col items-center gap-3 py-4 text-center">
        <p className="text-sm" style={{ color: 'var(--muted)' }}>Connect a wallet to choose a route and bridge.</p>
        <ConnectKitButton />
      </div>
    ) : (
      <>
        <DirectionPicker direction={direction} onChange={onDirection} disabled={b.bridging || b.reviewing} />

        {b.needsSolanaWallet && (
          <div className="rounded-xl p-3 flex items-center justify-between gap-3 flex-wrap"
            style={{ background: 'var(--surface-muted)', border: '1px solid var(--border)' }}>
            <span className="text-sm min-w-0 break-all" style={{ color: 'var(--muted)' }}>
              {b.solAddress ? `Solana wallet ${b.solAddress.slice(0, 4)}…${b.solAddress.slice(-4)}` : 'Solana wallet not connected'}
            </span>
            {!b.solAddress && (
              <GhostButton onClick={() => void b.connectSolana()} className="min-h-[44px]">Connect Phantom</GhostButton>
            )}
          </div>
        )}

        <div className="rounded-xl p-4 flex flex-col gap-2" style={{ background: 'var(--surface-muted)', border: '1px solid var(--border)' }}>
          <div className="flex items-center justify-between text-xs gap-2" style={{ color: 'var(--muted)' }}>
            <label htmlFor="bridge-amount" className="font-medium">Amount</label>
            {from.family === 'evm' && balance !== undefined && (
              <span className="tabular-nums">
                Balance {formatToken(balance, TOKEN_DECIMALS)}
                {balance > 0n && (
                  <button type="button" onClick={() => b.setAmount(formatToken(balance, TOKEN_DECIMALS))}
                    className="ml-2 px-2 min-h-[32px] rounded font-semibold hover:bg-[var(--accent-muted)]" style={{ color: 'var(--accent)' }}>Max</button>
                )}
              </span>
            )}
          </div>
          <div className="flex items-center gap-3">
            <input
              id="bridge-amount" inputMode="decimal" value={b.amount} placeholder="0.00"
              onChange={e => b.setAmount(e.target.value.replace(/[^0-9.]/g, ''))}
              className="flex-1 min-w-0 bg-transparent outline-none font-semibold text-2xl tabular-nums"
              style={{ color: 'var(--ink)' }}
            />
            <div className="flex gap-1.5 shrink-0" role="group" aria-label="Token">
              {b.tokens.map(t => (
                <button key={t} type="button" onClick={() => b.setToken(t)} aria-pressed={token === t}
                  className="px-3 rounded-lg text-sm font-semibold min-h-[44px]"
                  style={{
                    background: token === t ? 'var(--accent)' : 'var(--surface)',
                    color: token === t ? 'var(--on-accent)' : 'var(--ink-2)',
                    border: `1px solid ${token === t ? 'var(--accent)' : 'var(--border-strong)'}`,
                  }}>{t}</button>
              ))}
            </div>
          </div>
        </div>

        <label className="flex flex-col gap-1.5">
          <span className="text-xs font-medium" style={{ color: 'var(--ink-2)' }}>
            {to.family === 'solana' ? 'Receive on Solana (address)' : `Receive on ${to.label} (address)`}
          </span>
          <input
            value={b.recipientInput} placeholder={to.family === 'solana' ? (b.solAddress ?? 'Solana address') : b.address} spellCheck={false}
            onChange={e => b.setRecipientInput(e.target.value)}
            aria-invalid={!!b.recipientInput && !b.recipientValid}
            className="w-full rounded-lg px-3.5 py-3 text-sm outline-none font-mono min-h-[44px] focus:border-[var(--accent)] focus:ring-2 focus:ring-[var(--accent-glow)]"
            style={{ background: 'var(--surface)', color: 'var(--ink)', border: `1px solid ${b.recipientInput && !b.recipientValid ? 'var(--danger)' : 'var(--border-strong)'}` }}
          />
          <span className="text-xs" style={{ color: b.recipientInput && !b.recipientValid ? 'var(--danger)' : 'var(--muted)' }}>
            {b.recipientInput && !b.recipientValid
              ? `This is not a valid ${to.family === 'solana' ? 'Solana' : to.label} address.`
              : to.family === 'solana' ? 'Defaults to your connected Solana wallet.' : 'Defaults to your connected wallet. Check it carefully: a wrong address cannot be recovered.'}
          </span>
        </label>

        <div className="flex items-center justify-between gap-3 flex-wrap">
          <span id="bridge-speed" className="text-xs font-medium" style={{ color: 'var(--ink-2)' }}>Speed</span>
          <div className="flex gap-2 flex-1 min-w-[180px] max-w-[260px]" role="group" aria-labelledby="bridge-speed">
            <Chip active={b.speed === 'FAST'} onClick={() => b.setSpeed('FAST')}>Fast</Chip>
            <Chip active={b.speed === 'SLOW'} onClick={() => b.setSpeed('SLOW')}>Standard</Chip>
          </div>
        </div>

        {insufficient && <AlertBox variant="danger">Amount is more than your {token} balance on {from.label}.</AlertBox>}
        {b.error && <AlertBox variant="danger">{b.error}</AlertBox>}

        {b.result && !finished ? (
          <PrimaryButton onClick={() => void b.resume()} loading={b.bridging}>
            <RotateCcw size={14} /> Resume transfer
          </PrimaryButton>
        ) : !review ? (
          <PrimaryButton onClick={() => void b.getReview()} disabled={!canReview} loading={b.reviewing}>
            Review transfer
          </PrimaryButton>
        ) : (
          <div className="flex flex-col gap-2">
            <PrimaryButton onClick={() => void b.execute()} loading={b.bridging} disabled={!!b.result}>
              <Waypoints size={14} /> Bridge {review.amount} {review.token}
            </PrimaryButton>
            <GhostButton onClick={b.reset} disabled={b.bridging} className="min-h-[44px]">Cancel</GhostButton>
          </div>
        )}
        {b.bridging && (
          <p role="status" className="flex items-center gap-2 text-xs" style={{ color: 'var(--muted)' }}>
            <Loader2 size={14} className="animate-spin shrink-0" aria-hidden="true" /> Waiting for your wallet and the network. Keep this page open.
          </p>
        )}
      </>
    )}
  </Card>

  {/* Transfer summary: route, fees and progress. Values come from the provider's quote and the SDK's step results. */}
  <aside aria-label="Transfer summary" className="lg:sticky lg:top-24 flex flex-col gap-4">
    <Card className="p-4 sm:p-5 flex flex-col gap-3">
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-sm font-semibold" style={{ color: 'var(--ink)' }}>Transfer summary</h2>
        <span role="status" className="text-xs font-semibold" style={{ color: statusColor }}>{statusLabel}</span>
      </div>
      <Row label="Route">{from.label} to {to.label}</Row>
      <Row label="Token">{token}</Row>
      {review ? (
        <>
          <Row label="Recipient">{shortAddr(review.recipient)}</Row>
          <Row label="You send">{review.amount} {review.token}</Row>
          <Row label="Speed">{review.speed === 'FAST' ? 'Fast' : 'Standard'}</Row>
          {review.estimate.fees.map((f, i) => (
            <Row key={i} label={f.type === 'kit' ? 'Kit fee' : f.type === 'provider' ? 'Protocol fee' : 'Forwarding fee'}>
              {f.amount ?? 'unavailable'} {f.amount ? f.token : ''}
            </Row>
          ))}
          {review.estimate.gasFees.map((g, i) => (
            <Row key={`g${i}`} label={`Gas: ${g.name}`}>{g.fees?.fee ? `${g.fees.fee} ${g.token}` : 'unavailable'}</Row>
          ))}
          <Divider />
          <p className="text-xs" style={{ color: 'var(--muted)' }}>
            {review.mode === 'forwarder'
              ? `You sign once on ${review.from.label}. Circle completes the mint on ${review.to.label} and charges the forwarding fee shown above, so you need no gas there.`
              : review.mode === 'wallet'
                ? `You sign on ${review.from.label}, then your wallet signs the mint on ${review.to.label} and pays its gas there.`
                : 'Your wallet signs the approval and burn here, then the mint on Arc. Fees are shown above before you confirm.'}
          </p>
        </>
      ) : (
        <p className="text-xs" style={{ color: 'var(--muted)' }}>Fees and the signing steps appear here after you review the transfer. Nothing is estimated before that.</p>
      )}
    </Card>

    <Card className="p-4 sm:p-5">
      <h2 className="text-sm font-semibold mb-3" style={{ color: 'var(--ink)' }}>Progress</h2>
      <Timeline steps={steps} />
      {finished && <p className="text-sm font-medium mt-3" style={{ color: 'var(--success)' }}>Completed: {b.result?.amount} {b.result?.token} received on {to.label}.</p>}
      {b.result && !finished && <p className="text-sm mt-3" style={{ color: 'var(--muted)' }}>Not completed yet. The destination mint has not been confirmed. Your funds are not lost: use Resume to continue from the failed step.</p>}
    </Card>

    <Card className="p-4 sm:p-5">
      <h2 className="text-sm font-semibold mb-2" style={{ color: 'var(--ink)' }}>Before you send</h2>
      <ul className="text-xs flex flex-col gap-1.5 list-disc pl-4" style={{ color: 'var(--muted)' }}>
        <li>Transfers are final. A wrong address or chain can mean permanent loss.</li>
        <li>Standard speed can take 15 minutes or more. Fast is usually quicker but can cost more.</li>
        <li>Keep this page open until the destination step shows Done.</li>
      </ul>
    </Card>
  </aside>
  </div>
  )
}
