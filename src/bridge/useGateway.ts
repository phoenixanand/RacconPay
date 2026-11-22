/**
 * Circle Gateway through App Kit's unified balance: deposit USDC on the From chain, then spend it to the To chain.
 * One side is always Arc.
 * Nothing moves funds unless `deposit()` or `spend()` is called from a user's click.
 */
import { useCallback, useEffect, useState } from 'react'
import { useAccount, useSwitchChain } from 'wagmi'
import { isAddress, type EIP1193Provider } from 'viem'
import { AppKit } from '@circle-fin/app-kit'
import { createViemAdapterFromProvider } from '@circle-fin/adapter-viem-v2'
import { createSolanaAdapterFromProvider } from '@circle-fin/adapter-solana'
import { ARC_CHAIN_ID } from '../constants'
import { endpointById, isSolanaAddress, type BridgeEndpoint, type Direction } from './chains'
import { detectSolanaWallet, withPublicKey } from './solana'
import { bridgeErrorMessage } from './useBridge'
import { formatToken, parseToken } from '../utils'
import { recordLocal } from '../stats/useSwapHistory'
import { recordTx } from '../lib/txlog'

const kit = new AppKit()

type EvmAdapter = Awaited<ReturnType<typeof createViemAdapterFromProvider>>
type SolAdapter = Awaited<ReturnType<typeof createSolanaAdapterFromProvider>>

export interface ChainBalance { chain: string; confirmed: bigint; pending: bigint }
export interface GatewayBalances { total: bigint; pending: bigint; byChain: ChainBalance[] }
export interface Fee { type: string; token: string; amount: string }
export interface SpendReview { source: BridgeEndpoint; dest: BridgeEndpoint; amount: string; recipient: string; fees: Fee[]; account: string }
export interface GatewayDone { kind: 'deposit' | 'spend'; amount: string; txHash?: string; explorerUrl?: string; chain: string }

const safeParse = (v: string | undefined): bigint => {
  try { return v ? parseToken(v, 6) : 0n } catch { return 0n }
}

export function useGateway(direction: Direction) {
  const { address, connector, chainId: walletChainId } = useAccount()
  const { switchChainAsync } = useSwitchChain()

  const [amount, setAmount] = useState('')
  const [recipientInput, setRecipientInput] = useState('')
  const [solAddress, setSolAddress] = useState<string>()
  const [balances, setBalances] = useState<GatewayBalances | null>(null)
  const [loadingBalances, setLoadingBalances] = useState(false)
  const [review, setReview] = useState<SpendReview | null>(null)
  const [busy, setBusy] = useState<'review' | 'deposit' | 'spend' | null>(null)
  const [done, setDone] = useState<GatewayDone | null>(null)
  const [error, setError] = useState<string | null>(null)

  const source = endpointById(direction.from)
  const dest = endpointById(direction.to)
  const defaultRecipient = dest.family === 'solana' ? (solAddress ?? '') : (address ?? '')
  const recipient = recipientInput.trim() || defaultRecipient
  const recipientValid = dest.family === 'solana' ? isSolanaAddress(recipient) : isAddress(recipient)
  const needsSolanaWallet = source.family === 'solana' || (dest.family === 'solana' && !recipientInput.trim())

  const clear = useCallback(() => { setReview(null); setDone(null); setError(null) }, [])

  const refreshBalances = useCallback(async () => {
    const sources: { address: string }[] = []
    if (address) sources.push({ address })
    if (solAddress) sources.push({ address: solAddress })
    if (!sources.length) { setBalances(null); return }
    setLoadingBalances(true)
    try {
      const res = await kit.unifiedBalance.getBalances({ sources, networkType: 'mainnet', includePending: true })
      const byChain = new Map<string, ChainBalance>()
      for (const account of res.breakdown) {
        for (const c of account.breakdown) {
          const prev = byChain.get(c.chain) ?? { chain: c.chain, confirmed: 0n, pending: 0n }
          prev.confirmed += safeParse(c.confirmedBalance)
          prev.pending += safeParse((c as { pendingBalance?: string }).pendingBalance)
          byChain.set(c.chain, prev)
        }
      }
      setBalances({
        total: safeParse(res.totalConfirmedBalance),
        pending: safeParse(res.totalPendingBalance),
        byChain: [...byChain.values()].filter(c => c.confirmed > 0n || c.pending > 0n),
      })
    } catch (e) {
      setError(bridgeErrorMessage(e))
    } finally {
      setLoadingBalances(false)
    }
  }, [address, solAddress])

  useEffect(() => {
    // Loading balances is a network read; the setState calls happen after the request starts.
    // oxlint-disable-next-line react-hooks/set-state-in-effect
    void refreshBalances()
  }, [refreshBalances])

  const evmAdapter = async (chainId: number): Promise<EvmAdapter> => {
    if (!connector) throw new Error('Connect your wallet first.')
    if (walletChainId !== chainId) await switchChainAsync({ chainId })
    const provider = (await connector.getProvider()) as EIP1193Provider
    return createViemAdapterFromProvider({ provider })
  }

  const solanaAdapter = async (): Promise<SolAdapter> => {
    const wallet = detectSolanaWallet()
    if (!wallet) throw new Error('No Solana wallet found. Install Phantom, then reload this page.')
    return createSolanaAdapterFromProvider({ provider: withPublicKey(wallet) })
  }

  const adapterFor = async (s: BridgeEndpoint): Promise<EvmAdapter | SolAdapter> =>
    s.family === 'solana' ? solanaAdapter() : evmAdapter(s.chainId!)

  const connectSolana = async () => {
    const wallet = detectSolanaWallet()
    if (!wallet) { setError('No Solana wallet found. Install Phantom, then reload this page.'); return }
    try {
      const { publicKey } = await wallet.connect()
      setSolAddress(publicKey.toString())
      setError(null)
    } catch (e) { setError(bridgeErrorMessage(e)) }
  }

  const amountRaw = safeParse(amount)
  const sourceBalance = balances?.byChain.find(c => c.chain === source.kitChain)?.confirmed ?? 0n

  /** Add USDC from the connected wallet on the selected chain to the unified balance. */
  const deposit = async () => {
    if (!address || amountRaw <= 0n) return
    setBusy('deposit'); clear()
    try {
      const adapter = await adapterFor(source)
      const res = await kit.unifiedBalance.deposit({ from: { adapter, chain: source.kitChain }, amount })
      setDone({ kind: 'deposit', amount: res.amount, txHash: res.txHash, explorerUrl: res.explorerUrl, chain: source.label })
      setAmount('')
      void refreshBalances()
    } catch (e) { setError(bridgeErrorMessage(e)) } finally { setBusy(null) }
  }

  const spendParams = async (r: { source: BridgeEndpoint; dest: BridgeEndpoint; amount: string; recipient: string }) => ({
    from: {
      adapter: await adapterFor(r.source),
      allocations: { amount: r.amount, chain: r.source.kitChain },
    },
    to: { chain: r.dest.kitChain, recipientAddress: r.recipient, useForwarder: true as const },
    amount: r.amount,
  })

  /** Quote the spend so fees are visible before the user confirms. */
  const getReview = async () => {
    if (!address) { setError('Connect your wallet first.'); return }
    if (!recipientValid) { setError(dest.family === 'solana' ? 'Enter a valid Solana address to receive the funds.' : `Enter a valid ${dest.label} address to receive the funds.`); return }
    if (needsSolanaWallet && !solAddress) { setError('Connect your Solana wallet first.'); return }
    if (amountRaw <= 0n) return
    if (amountRaw > sourceBalance) { setError(`Your unified balance on ${source.label} is ${formatToken(sourceBalance, 6)} USDC. Deposit more first.`); return }
    setBusy('review'); clear()
    try {
      const r = { source, dest, amount, recipient }
      const est = await kit.unifiedBalance.estimateSpend(await spendParams(r))
      setReview({ ...r, account: address, fees: est.fees.map(f => ({ type: String(f.type), token: f.token, amount: f.amount })) })
    } catch (e) { setError(bridgeErrorMessage(e)) } finally { setBusy(null) }
  }

  /** Burn from the unified balance on the From chain and mint on the To chain. */
  const spend = async () => {
    if (!review) return
    if (address !== review.account) { setReview(null); setError('Wallet account changed since the quote. Review again.'); return }
    setBusy('spend'); setError(null)
    try {
      const res = await kit.unifiedBalance.spend(await spendParams(review))
      setDone({ kind: 'spend', amount: review.amount, txHash: res.txHash, explorerUrl: res.explorerUrl, chain: review.dest.label })
      recordLocal(review.dest.id === 'arc' ? 'gateway' : 'gatewayOut', ARC_CHAIN_ID, review.account, 'USDC', review.amount)
      // Gateway has no source-chain hash for the spend; the hash returned is the destination mint.
      if (res.txHash) {
        recordTx(review.account, {
          hash: res.txHash as `0x${string}`, kind: 'Bridge', detail: `${review.amount} USDC via Gateway to ${review.dest.label}`,
          amountRaw: parseToken(review.amount, 6).toString(), token: 'USDC', decimals: 6,
          chainId: review.dest.chainId, network: `Gateway to ${review.dest.label}`, url: res.explorerUrl ?? review.dest.explorerTx(res.txHash),
          status: 'confirmed',
        })
      }
      setReview(null); setAmount('')
      void refreshBalances()
    } catch (e) { setError(bridgeErrorMessage(e)) } finally { setBusy(null) }
  }

  return {
    address, source, dest, amount, recipientInput, recipient, recipientValid, solAddress, needsSolanaWallet,
    balances, loadingBalances, review, busy, done, error, sourceBalance, amountRaw,
    setAmount: (v: string) => { setAmount(v); setReview(null); setDone(null) },
    setRecipientInput: (v: string) => { setRecipientInput(v); setReview(null) },
    connectSolana, deposit, getReview, spend, cancelReview: () => setReview(null), refreshBalances,
  }
}
