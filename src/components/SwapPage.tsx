/**
 * Swap, USDC / EURC / cirBTC on Arc with Circle App Kit.
 * Arc Mainnet by default (real funds), Arc Testnet for practice.
 * Keyless, signed by the connected browser wallet. Nothing runs without an explicit click:
 * "Review quote" fetches an estimate, "Swap" executes exactly the reviewed request.
 */
import { useState } from 'react'
import { useAccount, useReadContract } from 'wagmi'
import { erc20Abi, type EIP1193Provider } from 'viem'
import { AppKit, type SwapEstimate } from '@circle-fin/app-kit'
import { createViemAdapterFromProvider } from '@circle-fin/adapter-viem-v2'
import { ArrowUpDown, ExternalLink, Repeat, AlertTriangle } from 'lucide-react'
import { toast } from 'sonner'
import { Card, PageHeader, PrimaryButton, GhostButton, AlertBox, Divider } from './ui'
import ChainGuard from './ChainGuard'
import { ARC_CHAIN_ID, ARC_TESTNET_CHAIN_ID, chainLabel, explorerTxFor } from '../constants'
import { SWAP_SYMBOLS, SWAP_TOKENS, swapTokenAddress, type SwapSymbol } from '../tokens'
import { formatToken, parseToken } from '../utils'
import { SwapStats } from './PageStats'
import { recordSwap } from '../stats/useSwapHistory'
import { recordTx } from '../lib/txlog'

const kit = new AppKit()
const SLIPPAGE_OPTIONS = [50, 100, 300] as const
/** Custom slippage bounds, in percent. Above HIGH_SLIPPAGE_PCT the page warns that the price can be much worse. */
const MIN_SLIPPAGE_PCT = 0.01
const MAX_SLIPPAGE_PCT = 50
const HIGH_SLIPPAGE_PCT = 5
/** Above this amount of USDC or EURC on mainnet, show an extra warning. */
const LARGE_AMOUNT = 100

const NETWORKS = [
  { chainId: ARC_CHAIN_ID, kitChain: 'Arc' },
  { chainId: ARC_TESTNET_CHAIN_ID, kitChain: 'Arc_Testnet' },
] as const
type Network = (typeof NETWORKS)[number]

interface ReviewedSwap {
  estimate: SwapEstimate
  tokenIn: SwapSymbol
  tokenOut: SwapSymbol
  amountIn: string
  slippageBps: number
  account: string
  chainId: number
}

interface SwapDone {
  txHash?: string
  amountOut?: string
  tokenOut: SwapSymbol
  status: string
  chainId: number
}

function errorMessage(e: unknown): string {
  const msg = e instanceof Error ? e.message : String(e)
  const lower = msg.toLowerCase()
  // App Kit errors carry a numeric code and a name. These are the swap-related ones.
  const code = (e as { code?: number }).code
  const name = (e as { name?: string }).name ?? ''
  if (code === 1003 || name === 'INPUT_UNSUPPORTED_ROUTE') return 'The swap provider has no route for this pair right now. Try another pair or amount.'
  if (code === 1007 || name === 'INPUT_INSUFFICIENT_SWAP_AMOUNT') return 'This amount is too small to swap. Try a larger amount.'
  if (code === 1013 || name === 'INPUT_AMOUNT_OUT_OF_RANGE') return "This amount is outside the swap provider's accepted range."
  if (code === 1009 || name === 'INPUT_SLIPPAGE_CONSTRAINT_NOT_MET') return 'The price moved beyond your slippage limit. Review the quote again or allow more slippage.'
  if (lower.includes('user rejected') || lower.includes('user denied')) return 'Request cancelled in your wallet.'
  if (lower.includes('insufficient')) return 'Insufficient balance for this swap.'
  return msg.length > 160 ? `${msg.slice(0, 160)}…` : msg
}

function TokenRow({
  label, token, decimals, balance, amount, onAmount, readOnly, onMax, onToken,
}: {
  label: string; token: SwapSymbol; decimals: number; balance?: bigint
  amount: string; onAmount?: (v: string) => void; readOnly?: boolean; onMax?: () => void
  onToken: (t: SwapSymbol) => void
}) {
  return (
    <div className="rounded-xl p-4 flex flex-col gap-2"
      style={{ background: 'var(--surface-muted)', border: '1px solid var(--border)' }}>
      <div className="flex items-center justify-between text-xs" style={{ color: 'var(--subtle)' }}>
        <span className="font-semibold uppercase tracking-[0.1em]">{label}</span>
        <span className="tabular-nums">
          Balance {balance !== undefined ? formatToken(balance, decimals) : '-'}
          {onMax && balance !== undefined && balance > 0n && (
            <button type="button" onClick={onMax} className="ml-2 px-2 min-h-[32px] rounded font-semibold hover:bg-[var(--accent-muted)]" style={{ color: 'var(--accent)' }}>Max</button>
          )}
        </span>
      </div>
      <div className="flex items-center gap-3">
        <input
          inputMode="decimal"
          value={amount}
          readOnly={readOnly}
          onChange={e => {
            // Keep to one dot and no more decimals than the token has (8 for cirBTC, 6 for USDC and EURC).
            const [whole, ...rest] = e.target.value.replace(/[^0-9.]/g, '').split('.')
            onAmount?.(rest.length ? `${whole}.${rest.join('').slice(0, decimals)}` : whole)
          }}
          placeholder="0.00"
          className="flex-1 min-w-0 bg-transparent outline-none font-semibold text-2xl tabular-nums"
          style={{ color: 'var(--ink)' }}
          aria-label={`${label} amount`}
        />
        <select
          value={token}
          onChange={e => onToken(e.target.value as SwapSymbol)}
          aria-label={`${label} token`}
          className="px-3 py-2 rounded-xl text-sm font-bold outline-none cursor-pointer min-h-[44px]"
          style={{ background: 'var(--surface-strong)', color: 'var(--ink)', border: '1px solid var(--border)' }}
        >
          {SWAP_SYMBOLS.map(s => <option key={s} value={s}>{s}</option>)}
        </select>
      </div>
    </div>
  )
}

/** Rate derived from the provider's own quote, never typed in. */
function rateText(amountIn: string, amountOut: string, tokenIn: string, tokenOut: string): string {
  const a = Number(amountIn), b = Number(amountOut)
  if (!(a > 0) || !(b > 0)) return '-'
  // Always quote the price of one cirBTC. "1 USDC = 0.000016 cirBTC" would round to a misleading figure.
  if (tokenOut === 'cirBTC') return `1 cirBTC ≈ ${(a / b).toLocaleString(undefined, { maximumFractionDigits: 2 })} ${tokenIn}`
  if (tokenIn === 'cirBTC') return `1 cirBTC ≈ ${(b / a).toLocaleString(undefined, { maximumFractionDigits: 2 })} ${tokenOut}`
  return `1 ${tokenIn} ≈ ${(b / a).toLocaleString(undefined, { maximumFractionDigits: 6 })} ${tokenOut}`
}

/** Friendly provider names for display. The value itself comes from the quote. */
const PROVIDER_NAMES: Record<string, string> = { lifi: 'LiFi', circle: 'Circle' }

function SwapCard({ network }: { network: Network }) {
  const { chainId, kitChain } = network
  const isMainnet = chainId === ARC_CHAIN_ID
  const { address, connector } = useAccount()
  const [tokenIn, setTokenIn] = useState<SwapSymbol>('USDC')
  const [tokenOut, setTokenOut] = useState<SwapSymbol>('EURC')
  const [amount, setAmount] = useState('')
  const [slippageBps, setSlippageBps] = useState<number>(100)
  const [reviewed, setReviewed] = useState<ReviewedSwap | null>(null)
  const [reviewing, setReviewing] = useState(false)
  const [swapping, setSwapping] = useState(false)
  const [done, setDone] = useState<SwapDone | null>(null)
  const [error, setError] = useState<string | null>(null)
  // Set when a very small cirBTC amount finds no route at the chosen slippage. Offers the 3% option, never applies it itself.
  const [smallAmountHint, setSmallAmountHint] = useState(false)
  // Custom slippage, typed as a percent. Only used while it holds a valid number; presets clear it.
  const [customText, setCustomText] = useState('')
  const customPct = customText === '' ? NaN : Number(customText)
  const customValid = Number.isFinite(customPct) && customPct >= MIN_SLIPPAGE_PCT && customPct <= MAX_SLIPPAGE_PCT
  const customActive = customText !== ''

  const inInfo = SWAP_TOKENS[tokenIn]
  const outInfo = SWAP_TOKENS[tokenOut]
  const inAddr  = swapTokenAddress(tokenIn,  chainId)
  const outAddr = swapTokenAddress(tokenOut, chainId)

  const { data: balIn, refetch: refetchIn } = useReadContract({
    address: inAddr, abi: erc20Abi, functionName: 'balanceOf',
    args: address ? [address] : undefined, chainId,
    query: { enabled: !!address && !!inAddr },
  })
  const { data: balOut, refetch: refetchOut } = useReadContract({
    address: outAddr, abi: erc20Abi, functionName: 'balanceOf',
    args: address ? [address] : undefined, chainId,
    query: { enabled: !!address && !!outAddr },
  })

  let amountRaw = 0n
  try { amountRaw = amount ? parseToken(amount, inInfo.decimals) : 0n } catch { amountRaw = 0n }
  const insufficient = balIn !== undefined && amountRaw > balIn
  const canReview = !!address && amountRaw > 0n && !insufficient && !reviewing && !swapping && (!customActive || customValid)
  const largeStable = isMainnet && tokenIn !== 'cirBTC' && Number(amount) > LARGE_AMOUNT

  const resetReview = () => { setReviewed(null); setDone(null); setError(null); setSmallAmountHint(false) }

  const pickIn = (t: SwapSymbol) => {
    if (t === tokenOut) setTokenOut(tokenIn)
    setTokenIn(t); setAmount(''); resetReview()
  }
  const pickOut = (t: SwapSymbol) => {
    if (t === tokenIn) setTokenIn(tokenOut)
    setTokenOut(t); resetReview()
  }
  const flip = () => { setTokenIn(tokenOut); setTokenOut(tokenIn); setAmount(''); resetReview() }

  const getAdapter = async () => {
    if (!connector) throw new Error('Wallet not connected')
    const provider = (await connector.getProvider()) as EIP1193Provider
    return createViemAdapterFromProvider({ provider })
  }

  const review = async () => {
    if (!address) return
    setReviewing(true); setError(null); setDone(null)
    try {
      const adapter = await getAdapter()
      const estimate = await kit.estimateSwap({
        from: { adapter, chain: kitChain },
        tokenIn: inInfo.kitSymbol, tokenOut: outInfo.kitSymbol, amountIn: amount,
        config: { slippageBps },
      })
      setReviewed({ estimate, tokenIn, tokenOut, amountIn: amount, slippageBps, account: address, chainId })
    } catch (e) {
      setReviewed(null)
      const code = (e as { code?: number }).code
      const involvesBtc = tokenIn === 'cirBTC' || tokenOut === 'cirBTC'
      if (code === 1003 && involvesBtc && slippageBps < 300) {
        // The provider answers "no route" when the allowed price range is narrower than cirBTC's smallest unit (8 decimals).
        setSmallAmountHint(true)
        setError(`No route for this amount at ${slippageBps / 100}% slippage. cirBTC has only 8 decimals, so for a very small amount the allowed price range can be narrower than its smallest unit. Use a larger amount, or allow 3% slippage.`)
      } else {
        setSmallAmountHint(false)
        setError(errorMessage(e))
      }
    } finally {
      setReviewing(false)
    }
  }

  const execute = async () => {
    if (!reviewed) return
    if (address !== reviewed.account) {
      setReviewed(null); setError('Wallet account changed since the quote. Review the quote again.')
      return
    }
    setSwapping(true); setError(null)
    try {
      const adapter = await getAdapter()
      const result = await kit.swap({
        from: { adapter, chain: kitChain },
        tokenIn: SWAP_TOKENS[reviewed.tokenIn].kitSymbol,
        tokenOut: SWAP_TOKENS[reviewed.tokenOut].kitSymbol,
        amountIn: reviewed.amountIn,
        config: { slippageBps: reviewed.slippageBps },
      })
      setDone({
        txHash: result.txHash,
        amountOut: result.amountOut,
        tokenOut: reviewed.tokenOut,
        status: result.progress.status,
        chainId: reviewed.chainId,
      })
      recordSwap(reviewed.chainId, reviewed.account, reviewed.tokenIn, reviewed.amountIn)
      // Keep the hash for Personal history. Only a swap the provider reports as DONE is recorded as confirmed.
      if (result.txHash) {
        recordTx(reviewed.account, {
          hash: result.txHash as `0x${string}`, kind: 'Swap',
          detail: `${reviewed.amountIn} ${reviewed.tokenIn} to ${reviewed.tokenOut}`,
          amountRaw: parseToken(reviewed.amountIn, SWAP_TOKENS[reviewed.tokenIn].decimals).toString(),
          token: reviewed.tokenIn, decimals: SWAP_TOKENS[reviewed.tokenIn].decimals,
          chainId: reviewed.chainId, status: result.progress.status === 'DONE' ? 'confirmed' : 'pending',
        })
      }
      setReviewed(null)
      setAmount('')
      void refetchIn(); void refetchOut()
      toast.success('Swap submitted')
    } catch (e) {
      setError(errorMessage(e))
    } finally {
      setSwapping(false)
    }
  }

  const status = done ? (done.status === 'DONE' ? 'Confirmed' : 'Submitted, not confirmed') : swapping ? 'Waiting for wallet' : reviewing ? 'Getting quote' : reviewed ? 'Quote ready' : 'Not started'
  const statusColor = done ? (done.status === 'DONE' ? 'var(--success)' : 'var(--warning)') : swapping || reviewing ? 'var(--accent)' : 'var(--muted)'
  const est = reviewed?.estimate
  // For pairs with cirBTC the stable side is only known from the quote, so the large-amount warning uses it.
  const quotedStableToken = reviewed ? (reviewed.tokenIn !== 'cirBTC' ? reviewed.tokenIn : reviewed.tokenOut) : ''
  const quotedStable = reviewed && est ? Number(reviewed.tokenIn !== 'cirBTC' ? reviewed.amountIn : est.estimatedOutput.amount) : 0
  const largeQuoted = isMainnet && !!reviewed && (reviewed.tokenIn === 'cirBTC' || reviewed.tokenOut === 'cirBTC') && reviewed.tokenIn !== reviewed.tokenOut && quotedStable > LARGE_AMOUNT

  return (
    <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_380px] gap-5 items-start">
      <Card className="p-4 sm:p-5 flex flex-col gap-4 w-full">
        <TokenRow
          label="You pay" token={tokenIn} decimals={inInfo.decimals} balance={balIn} amount={amount}
          onAmount={v => { setAmount(v); resetReview() }}
          onMax={() => { if (balIn !== undefined) { setAmount(formatToken(balIn, inInfo.decimals)); resetReview() } }}
          onToken={pickIn}
        />
        <div className="flex justify-center -my-2 z-10">
          <button
            type="button" onClick={flip}
            className="w-11 h-11 rounded-full flex items-center justify-center hover:bg-[var(--surface-hover)]"
            style={{ background: 'var(--surface)', border: '1px solid var(--border-strong)', color: 'var(--ink-2)' }}
            title="Flip direction" aria-label="Flip swap direction"
          >
            <ArrowUpDown size={16} aria-hidden="true" />
          </button>
        </div>
        <TokenRow
          label="You receive (estimate)" token={tokenOut} decimals={outInfo.decimals} balance={balOut} readOnly
          amount={est ? est.estimatedOutput.amount : ''}
          onToken={pickOut}
        />

        <div className="flex items-center justify-between gap-2 flex-wrap">
          <span id="slippage-label" className="text-xs font-medium" style={{ color: 'var(--ink-2)' }}>Max slippage</span>
          <div className="flex gap-1.5" role="group" aria-labelledby="slippage-label">
            {SLIPPAGE_OPTIONS.map(bps => (
              <button
                key={bps} type="button" aria-pressed={!customActive && slippageBps === bps}
                onClick={() => { setCustomText(''); setSlippageBps(bps); resetReview() }}
                className="px-3.5 rounded-lg text-xs font-semibold min-h-[40px]"
                style={{
                  background: !customActive && slippageBps === bps ? 'var(--accent)' : 'var(--surface)',
                  color: !customActive && slippageBps === bps ? 'var(--on-accent)' : 'var(--ink-2)',
                  border: `1px solid ${!customActive && slippageBps === bps ? 'var(--accent)' : 'var(--border-strong)'}`,
                }}
              >
                {bps / 100}%
              </button>
            ))}
            <div className="relative w-24">
              <input
                inputMode="decimal" value={customText} placeholder="Custom"
                aria-label="Custom slippage in percent" aria-invalid={customActive && !customValid}
                onChange={e => {
                  const [whole, ...rest] = e.target.value.replace(/[^0-9.]/g, '').split('.')
                  const next = rest.length ? `${whole}.${rest.join('').slice(0, 2)}` : whole
                  setCustomText(next)
                  const n = Number(next)
                  if (next !== '' && Number.isFinite(n) && n >= MIN_SLIPPAGE_PCT && n <= MAX_SLIPPAGE_PCT) setSlippageBps(Math.round(n * 100))
                  resetReview()
                }}
                className="w-full min-h-[40px] rounded-lg pl-3 pr-7 text-xs font-semibold tabular-nums outline-none focus:ring-2 focus:ring-[var(--accent-glow)]"
                style={{
                  background: customActive && customValid ? 'var(--accent-muted)' : 'var(--surface)',
                  color: 'var(--ink)',
                  border: `1px solid ${customActive ? (customValid ? 'var(--accent)' : 'var(--danger)') : 'var(--border-strong)'}`,
                }}
              />
              <span className="absolute right-2.5 top-1/2 -translate-y-1/2 text-xs pointer-events-none" style={{ color: 'var(--muted)' }} aria-hidden="true">%</span>
            </div>
          </div>
        </div>
        {customActive && !customValid && (
          <p role="alert" className="text-xs -mt-2" style={{ color: 'var(--danger)' }}>
            Enter a slippage between {MIN_SLIPPAGE_PCT}% and {MAX_SLIPPAGE_PCT}%, up to two decimals.
          </p>
        )}
        {customActive && customValid && customPct > HIGH_SLIPPAGE_PCT && (
          <AlertBox variant="warning">
            {customPct}% slippage means you could receive up to {customPct}% less than the quote. Only use this if you accept that.
          </AlertBox>
        )}

        {insufficient && <AlertBox variant="danger">Amount is more than your {tokenIn} balance.</AlertBox>}
        {largeStable && (
          <AlertBox variant="warning">
            This is more than {LARGE_AMOUNT} {tokenIn} of real funds. Check the quote carefully, or test with a smaller amount first.
          </AlertBox>
        )}
        {largeQuoted && (
          <AlertBox variant="warning">
            This swap is worth about {Math.round(quotedStable).toLocaleString()} {quotedStableToken} of real funds. Check the quote carefully, or test with a smaller amount first.
          </AlertBox>
        )}
        {error && <AlertBox variant="danger">{error}</AlertBox>}
        {smallAmountHint && (
          <GhostButton onClick={() => { setCustomText(''); setSlippageBps(300); setError(null); setSmallAmountHint(false) }} className="min-h-[44px]">
            Allow 3% slippage and try again
          </GhostButton>
        )}

        {!reviewed ? (
          <PrimaryButton onClick={() => void review()} disabled={!canReview} loading={reviewing}>
            Review quote
          </PrimaryButton>
        ) : (
          <div className="flex flex-col gap-2">
            <PrimaryButton onClick={() => void execute()} loading={swapping}>
              <Repeat size={14} aria-hidden="true" /> Swap {reviewed.amountIn} {reviewed.tokenIn} to {reviewed.tokenOut}
            </PrimaryButton>
            <GhostButton onClick={resetReview} disabled={swapping} className="min-h-[44px]">Cancel</GhostButton>
          </div>
        )}
        {swapping && <p role="status" className="text-xs" style={{ color: 'var(--muted)' }}>Confirm in your wallet, then wait for the network. Keep this page open.</p>}

        <p className="flex items-start gap-1.5 text-xs" style={{ color: 'var(--muted)' }}>
          <AlertTriangle size={12} className="mt-0.5 shrink-0" aria-hidden="true" />
          {isMainnet
            ? 'Only USDC, EURC and cirBTC can be swapped on Arc. cirBTC has 8 decimals.'
            : 'Arc Testnet. Test tokens have no real value. Get test USDC and EURC from the faucet.'}
        </p>
      </Card>

      {/* Swap summary: every value here comes from the provider's quote or the swap result. */}
      <aside aria-label="Swap summary" className="lg:sticky lg:top-24 flex flex-col gap-4">
        <Card className="p-4 sm:p-5 flex flex-col gap-2.5">
          <div className="flex items-center justify-between gap-2">
            <h2 className="text-sm font-semibold" style={{ color: 'var(--ink)' }}>Swap summary</h2>
            <span role="status" className="text-xs font-semibold" style={{ color: statusColor }}>{status}</span>
          </div>
          <SummaryRow label="Network">{chainLabel(chainId)}</SummaryRow>
          <SummaryRow label="Pair">{tokenIn} to {tokenOut}</SummaryRow>
          {est && reviewed ? (
            <>
              <SummaryRow label="You pay">{reviewed.amountIn} {reviewed.tokenIn}</SummaryRow>
              <SummaryRow label="Estimated rate">{rateText(reviewed.amountIn, est.estimatedOutput.amount, reviewed.tokenIn, est.estimatedOutput.token)}</SummaryRow>
              <SummaryRow label="Estimated output">{est.estimatedOutput.amount} {est.estimatedOutput.token}</SummaryRow>
              <SummaryRow label={`Minimum received (${reviewed.slippageBps / 100}% slippage)`}>{est.stopLimit.amount} {est.stopLimit.token}</SummaryRow>
              {est.fees?.map((f, i) => (
                <SummaryRow key={i} label={f.type === 'provider' ? 'Provider fee' : f.type === 'gas' ? 'Network fee' : 'Fee'}>{f.amount} {f.token}</SummaryRow>
              ))}
              {est.route?.provider && <SummaryRow label="Routed via">{PROVIDER_NAMES[est.route.provider.toLowerCase()] ?? est.route.provider}</SummaryRow>}
              <SummaryRow label="Price impact"><span style={{ color: 'var(--muted)', fontWeight: 400 }}>Not reported by the provider</span></SummaryRow>
              {!est.fees?.some(f => f.type === 'gas') && (
                <SummaryRow label="Network fee"><span style={{ color: 'var(--muted)', fontWeight: 400 }}>Not included in the quote. Your wallet shows it when you confirm</span></SummaryRow>
              )}
              <Divider />
              <p className="text-xs" style={{ color: 'var(--muted)' }}>
                These are estimates, not a completed swap. Swaps are routed through a swap service provider (a third-party aggregator or Circle) that can vary by
                route and are subject to that provider's terms. The rate can move before your wallet confirms; the swap fails if the output would fall below the minimum.
              </p>
            </>
          ) : (
            <p className="text-xs" style={{ color: 'var(--muted)' }}>Enter an amount and review the quote. The rate, minimum received and fees come from the swap provider, and nothing is estimated before that.</p>
          )}
        </Card>

        {done && (
          <Card className="p-4 sm:p-5 flex flex-col gap-2">
            <h2 className="text-sm font-semibold" style={{ color: done.status === 'DONE' ? 'var(--success)' : 'var(--warning)' }}>
              {done.status === 'DONE' ? 'Swap confirmed' : `Swap submitted, not confirmed yet (${done.status.toLowerCase()})`}
            </h2>
            {done.status === 'DONE' && done.amountOut && <p className="text-sm tabular-nums" style={{ color: 'var(--ink)' }}>Received {done.amountOut} {done.tokenOut}</p>}
            {done.txHash && (
              <a href={explorerTxFor(done.chainId, done.txHash)} target="_blank" rel="noreferrer"
                className="flex items-center gap-1 text-xs font-mono break-all hover:underline" style={{ color: 'var(--accent)' }}>
                <ExternalLink size={11} aria-hidden="true" /> {done.txHash.slice(0, 10)}…{done.txHash.slice(-6)}
              </a>
            )}
          </Card>
        )}
      </aside>
    </div>
  )
}

function SummaryRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-3 text-sm">
      <span className="shrink-0" style={{ color: 'var(--muted)' }}>{label}</span>
      <span className="font-semibold tabular-nums text-right break-words min-w-0" style={{ color: 'var(--ink)' }}>{children}</span>
    </div>
  )
}

export default function SwapPage() {
  const [network, setNetwork] = useState<Network>(NETWORKS[0])
  return (
    <div className="flex flex-col gap-6 animate-fade-up">
      <PageHeader
        icon={Repeat}
        title="Swap"
        subtitle="Swap between USDC, EURC and cirBTC on Arc. Quotes come from the swap provider."
      />
      <div className="flex gap-1 p-1 rounded-xl w-fit mx-auto"
        style={{ background: 'var(--surface-muted)', border: '1px solid var(--border)' }}
        role="tablist" aria-label="Network">
        {NETWORKS.map(n => (
          <button
            key={n.chainId}
            role="tab"
            aria-selected={network.chainId === n.chainId}
            onClick={() => setNetwork(n)}
            className="px-4 py-2 rounded-lg text-sm font-medium transition-all min-h-[40px]"
            style={{
              background: network.chainId === n.chainId ? 'var(--surface-strong)' : 'transparent',
              color: network.chainId === n.chainId ? 'var(--ink)' : 'var(--muted)',
              border: network.chainId === n.chainId ? '1px solid var(--border-strong)' : '1px solid transparent',
            }}
          >
            {chainLabel(n.chainId)}
          </button>
        ))}
      </div>
      <ChainGuard chainId={network.chainId}>
        <SwapCard key={network.chainId} network={network} />
        <div className="w-full">
          <SwapStats chainId={network.chainId} />
        </div>
      </ChainGuard>
    </div>
  )
}
