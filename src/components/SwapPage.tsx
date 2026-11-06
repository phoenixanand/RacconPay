/**
 * Swap — USDC <-> EURC on Arc Testnet with Circle App Kit.
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
import { ARC_TESTNET_CHAIN_ID, explorerTxFor } from '../constants'
import { TOKENS, tokenAddress, type TokenSymbol } from '../tokens'
import { formatToken, parseToken } from '../utils'

const kit = new AppKit()
const SLIPPAGE_OPTIONS = [50, 100, 300] as const

interface ReviewedSwap {
  estimate: SwapEstimate
  tokenIn: TokenSymbol
  tokenOut: TokenSymbol
  amountIn: string
  slippageBps: number
  account: string
}

interface SwapDone {
  txHash?: string
  amountOut?: string
  tokenOut: TokenSymbol
  status: string
}

function errorMessage(e: unknown): string {
  const msg = e instanceof Error ? e.message : String(e)
  const lower = msg.toLowerCase()
  if (lower.includes('user rejected') || lower.includes('user denied')) return 'Request cancelled in your wallet.'
  if (lower.includes('insufficient')) return 'Insufficient balance for this swap.'
  return msg.length > 160 ? `${msg.slice(0, 160)}…` : msg
}

function TokenRow({
  label, token, balance, amount, onAmount, readOnly, onMax,
}: {
  label: string; token: TokenSymbol; balance?: bigint
  amount: string; onAmount?: (v: string) => void; readOnly?: boolean; onMax?: () => void
}) {
  return (
    <div className="rounded-2xl p-4 flex flex-col gap-2"
      style={{ background: 'var(--surface-muted)', border: '1px solid var(--border)' }}>
      <div className="flex items-center justify-between text-xs" style={{ color: 'var(--subtle)' }}>
        <span className="font-semibold uppercase tracking-[0.1em]">{label}</span>
        <span className="tabular-nums">
          Balance {balance !== undefined ? formatToken(balance, TOKENS[token].decimals) : '—'}
          {onMax && balance !== undefined && balance > 0n && (
            <button onClick={onMax} className="ml-2 font-semibold" style={{ color: 'var(--accent)' }}>Max</button>
          )}
        </span>
      </div>
      <div className="flex items-center gap-3">
        <input
          inputMode="decimal"
          value={amount}
          readOnly={readOnly}
          onChange={e => onAmount?.(e.target.value.replace(/[^0-9.]/g, ''))}
          placeholder="0.00"
          className="flex-1 min-w-0 bg-transparent outline-none font-display font-bold text-2xl tabular-nums"
          style={{ color: 'var(--ink)' }}
          aria-label={`${label} amount`}
        />
        <span className="px-3 py-1.5 rounded-xl text-sm font-bold"
          style={{ background: 'var(--surface-strong)', color: 'var(--ink)' }}>{token}</span>
      </div>
    </div>
  )
}

function SwapCard() {
  const { address, connector } = useAccount()
  const [tokenIn, setTokenIn] = useState<TokenSymbol>('USDC')
  const tokenOut: TokenSymbol = tokenIn === 'USDC' ? 'EURC' : 'USDC'
  const [amount, setAmount] = useState('')
  const [slippageBps, setSlippageBps] = useState<number>(100)
  const [reviewed, setReviewed] = useState<ReviewedSwap | null>(null)
  const [reviewing, setReviewing] = useState(false)
  const [swapping, setSwapping] = useState(false)
  const [done, setDone] = useState<SwapDone | null>(null)
  const [error, setError] = useState<string | null>(null)

  const inAddr  = tokenAddress(tokenIn,  ARC_TESTNET_CHAIN_ID)
  const outAddr = tokenAddress(tokenOut, ARC_TESTNET_CHAIN_ID)

  const { data: balIn, refetch: refetchIn } = useReadContract({
    address: inAddr, abi: erc20Abi, functionName: 'balanceOf',
    args: address ? [address] : undefined, chainId: ARC_TESTNET_CHAIN_ID,
    query: { enabled: !!address && !!inAddr },
  })
  const { data: balOut, refetch: refetchOut } = useReadContract({
    address: outAddr, abi: erc20Abi, functionName: 'balanceOf',
    args: address ? [address] : undefined, chainId: ARC_TESTNET_CHAIN_ID,
    query: { enabled: !!address && !!outAddr },
  })

  let amountRaw = 0n
  try { amountRaw = amount ? parseToken(amount, TOKENS[tokenIn].decimals) : 0n } catch { amountRaw = 0n }
  const insufficient = balIn !== undefined && amountRaw > balIn
  const canReview = !!address && amountRaw > 0n && !insufficient && !reviewing && !swapping

  const resetReview = () => { setReviewed(null); setDone(null); setError(null) }

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
        from: { adapter, chain: 'Arc_Testnet' },
        tokenIn, tokenOut, amountIn: amount,
        config: { slippageBps },
      })
      setReviewed({ estimate, tokenIn, tokenOut, amountIn: amount, slippageBps, account: address })
    } catch (e) {
      setReviewed(null)
      setError(errorMessage(e))
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
        from: { adapter, chain: 'Arc_Testnet' },
        tokenIn: reviewed.tokenIn, tokenOut: reviewed.tokenOut, amountIn: reviewed.amountIn,
        config: { slippageBps: reviewed.slippageBps },
      })
      setDone({
        txHash: result.txHash,
        amountOut: result.amountOut,
        tokenOut: reviewed.tokenOut,
        status: result.progress.status,
      })
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

  const flip = () => { setTokenIn(tokenOut); setAmount(''); resetReview() }

  return (
    <Card className="p-5 flex flex-col gap-4 max-w-md mx-auto w-full">
      <TokenRow
        label="You pay" token={tokenIn} balance={balIn} amount={amount}
        onAmount={v => { setAmount(v); resetReview() }}
        onMax={() => { if (balIn !== undefined) { setAmount(formatToken(balIn, TOKENS[tokenIn].decimals)); resetReview() } }}
      />
      <div className="flex justify-center -my-2 z-10">
        <button
          onClick={flip}
          className="w-10 h-10 rounded-full flex items-center justify-center transition-transform hover:rotate-180"
          style={{ background: 'var(--surface-strong)', border: '1px solid var(--border-strong)', color: 'var(--ink-2)' }}
          title="Flip direction"
          aria-label="Flip swap direction"
        >
          <ArrowUpDown size={16} />
        </button>
      </div>
      <TokenRow
        label="You receive (estimate)" token={tokenOut} balance={balOut} readOnly
        amount={reviewed ? reviewed.estimate.estimatedOutput.amount : ''}
      />

      <div className="flex items-center justify-between gap-2">
        <span className="text-xs font-semibold uppercase tracking-[0.1em]" style={{ color: 'var(--subtle)' }}>
          Max slippage
        </span>
        <div className="flex gap-1.5">
          {SLIPPAGE_OPTIONS.map(bps => (
            <button
              key={bps}
              onClick={() => { setSlippageBps(bps); resetReview() }}
              className="px-3 py-1 rounded-full text-xs font-semibold transition-all"
              style={{
                background: slippageBps === bps ? 'var(--accent)' : 'var(--surface-strong)',
                color:      slippageBps === bps ? '#fff' : 'var(--muted)',
              }}
            >
              {bps / 100}%
            </button>
          ))}
        </div>
      </div>

      {insufficient && <AlertBox variant="danger">Amount is more than your {tokenIn} balance.</AlertBox>}
      {error && <AlertBox variant="danger">{error}</AlertBox>}

      {reviewed && (
        <div className="rounded-2xl p-4 flex flex-col gap-2 text-sm"
          style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
          <div className="flex justify-between">
            <span style={{ color: 'var(--muted)' }}>Estimated output</span>
            <span className="font-semibold tabular-nums" style={{ color: 'var(--ink)' }}>
              {reviewed.estimate.estimatedOutput.amount} {reviewed.estimate.estimatedOutput.token}
            </span>
          </div>
          <div className="flex justify-between">
            <span style={{ color: 'var(--muted)' }}>Minimum received</span>
            <span className="font-semibold tabular-nums" style={{ color: 'var(--ink)' }}>
              {reviewed.estimate.stopLimit.amount} {reviewed.estimate.stopLimit.token}
            </span>
          </div>
          {reviewed.estimate.fees?.map((f, i) => (
            <div key={i} className="flex justify-between">
              <span style={{ color: 'var(--muted)' }}>{f.type === 'provider' ? 'Provider fee' : 'Fee'}</span>
              <span className="tabular-nums" style={{ color: 'var(--ink-2)' }}>{f.amount} {f.token}</span>
            </div>
          ))}
          {reviewed.estimate.route?.provider && (
            <div className="flex justify-between">
              <span style={{ color: 'var(--muted)' }}>Routed via</span>
              <span style={{ color: 'var(--ink-2)' }}>{reviewed.estimate.route.provider}</span>
            </div>
          )}
          <Divider />
          <p className="text-xs" style={{ color: 'var(--subtle)' }}>
            Swaps are routed through a swap service provider that can vary by route and are subject to that
            provider's terms. The rate can move before your wallet confirms; the swap fails if the output
            would fall below the minimum.
          </p>
        </div>
      )}

      {!reviewed ? (
        <PrimaryButton onClick={() => void review()} disabled={!canReview} loading={reviewing}>
          Review quote
        </PrimaryButton>
      ) : (
        <div className="flex flex-col gap-2">
          <PrimaryButton onClick={() => void execute()} loading={swapping}>
            <Repeat size={14} /> Swap {reviewed.amountIn} {reviewed.tokenIn} to {reviewed.tokenOut}
          </PrimaryButton>
          <GhostButton onClick={resetReview} disabled={swapping}>Cancel</GhostButton>
        </div>
      )}

      {done && (
        <div className="rounded-xl px-4 py-3 text-sm flex flex-col gap-1"
          style={{ background: 'var(--success-muted)', border: '1px solid rgba(52,211,153,0.25)', color: 'var(--success)' }}>
          <span className="font-semibold">
            Swap {done.status === 'DONE' ? 'complete' : `submitted (${done.status.toLowerCase()})`}
            {done.amountOut ? `: received ${done.amountOut} ${done.tokenOut}` : ''}
          </span>
          {done.txHash && (
            <a href={explorerTxFor(ARC_TESTNET_CHAIN_ID, done.txHash)} target="_blank" rel="noreferrer"
              className="flex items-center gap-1 text-xs" style={{ color: 'var(--accent)' }}>
              <ExternalLink size={11} /> View transaction
            </a>
          )}
        </div>
      )}

      <p className="flex items-start gap-1.5 text-xs" style={{ color: 'var(--subtle)' }}>
        <AlertTriangle size={12} className="mt-0.5 shrink-0" />
        Arc Testnet only. Test tokens have no real value. Get test USDC and EURC from the faucet.
      </p>
    </Card>
  )
}

export default function SwapPage() {
  return (
    <div className="flex flex-col gap-6 animate-fade-up">
      <PageHeader
        icon={Repeat}
        title="Swap"
        subtitle="Swap between USDC and EURC on Arc Testnet."
        accentColor="var(--receipt-accent)"
      />
      <ChainGuard chainId={ARC_TESTNET_CHAIN_ID}>
        <SwapCard />
      </ChainGuard>
    </div>
  )
}
