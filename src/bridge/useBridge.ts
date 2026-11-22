/**
 * Bridge logic: quote, execute and recover a USDC or EURC transfer to or from Arc with Circle App Kit.
 * Nothing moves funds unless `execute()` is called from the user's click on the Bridge button.
 */
import { useRef, useState } from 'react'
import { useAccount, useSwitchChain } from 'wagmi'
import { isAddress, type EIP1193Provider } from 'viem'
import { arc, avalanche, base, mainnet } from 'viem/chains'
import { AppKit, type BridgeResult, type EstimateResult } from '@circle-fin/app-kit'
import { createViemAdapterFromProvider } from '@circle-fin/adapter-viem-v2'
import { createSolanaKitAdapterFromProvider } from '@circle-fin/adapter-solana-kit'
import { endpointById, isSolanaAddress, routeTokens, type BridgeEndpoint, type BridgeToken, type Direction } from './chains'
import { withAddChainFallback } from './withAddChainFallback'
import { detectSolanaWallet, withAddress } from './solana'
import { recordTx } from '../lib/txlog'
import { parseToken } from '../utils'

const kit = new AppKit()
const SUPPORTED = [arc, mainnet, base, avalanche] as const

export type Speed = 'FAST' | 'SLOW'
type Adapter = Awaited<ReturnType<typeof createViemAdapterFromProvider>>
type SolAdapter = ReturnType<typeof createSolanaKitAdapterFromProvider>

/**
 * Who pays for and signs the mint on the destination:
 * 'evm' = the same EVM wallet, on Arc (a transfer into Arc from an EVM chain),
 * 'forwarder' = Circle's forwarding service (one signature, no destination gas, a forwarding fee),
 * 'wallet' = the user's own wallet on the destination chain (EVM or Solana).
 */
export type MintMode = 'evm' | 'forwarder' | 'wallet'

export interface Review {
  estimate: EstimateResult<string, string>
  from: BridgeEndpoint
  to: BridgeEndpoint
  token: BridgeToken
  amount: string
  speed: Speed
  recipient: string
  mode: MintMode
  account: string
}

export interface ProgressEvent { name: string; txHash?: string }

export function bridgeErrorMessage(e: unknown): string {
  const msg = e instanceof Error ? e.message : String(e)
  const lower = msg.toLowerCase()
  if (lower.includes('user rejected') || lower.includes('user denied') || lower.includes('rejected the request')) return 'Request cancelled in your wallet.'
  if (lower.includes('insufficient')) return 'Insufficient balance for this transfer or its fees.'
  if (lower.includes('could not be determined')) return 'Circle\'s route check did not respond for this token. Try again in a moment, or use USDC.'
  if (lower.includes('unsupported_route') || lower.includes('not supported')) return 'This token is not available on this route yet. Try USDC or another chain.'
  return msg.length > 200 ? `${msg.slice(0, 200)}…` : msg
}

export function useBridge(direction: Direction) {
  const { address, connector, chainId: walletChainId } = useAccount()
  const { switchChainAsync } = useSwitchChain()

  const from = endpointById(direction.from)
  const to = endpointById(direction.to)
  const tokens = routeTokens(from, to)

  const [token, setTokenState] = useState<BridgeToken>('USDC')
  const [amount, setAmount] = useState('')
  const [speed, setSpeed] = useState<Speed>('FAST')
  const [recipientInput, setRecipientInput] = useState('')
  const [solAddress, setSolAddress] = useState<string>()
  const [review, setReview] = useState<Review | null>(null)
  const [reviewing, setReviewing] = useState(false)
  const [bridging, setBridging] = useState(false)
  const [events, setEvents] = useState<ProgressEvent[]>([])
  const [result, setResult] = useState<BridgeResult<string> | null>(null)
  const [error, setError] = useState<string | null>(null)
  const adapters = useRef<{ from?: Adapter | SolAdapter; to?: Adapter | SolAdapter }>({})

  const activeToken: BridgeToken = tokens.includes(token) ? token : 'USDC'
  /** Solana recipients default to the connected Solana wallet; EVM recipients to the connected EVM wallet. */
  const defaultRecipient = to.family === 'solana' ? (solAddress ?? '') : (address ?? '')
  const recipient = recipientInput.trim() || defaultRecipient
  const recipientValid = to.family === 'solana' ? isSolanaAddress(recipient) : isAddress(recipient)
  const needsSolanaWallet = from.family === 'solana' || (to.family === 'solana' && !recipientInput.trim())

  const reset = () => { setReview(null); setResult(null); setError(null); setEvents([]) }

  const getEvmAdapter = async (): Promise<Adapter> => {
    if (!connector) throw new Error('Connect your wallet first.')
    const provider = (await connector.getProvider()) as EIP1193Provider
    return createViemAdapterFromProvider({ provider: withAddChainFallback(provider, SUPPORTED) })
  }

  const getSolAdapter = (): SolAdapter => {
    const wallet = detectSolanaWallet()
    if (!wallet) throw new Error('No Solana wallet found. Install Phantom, then reload this page.')
    return createSolanaKitAdapterFromProvider({ provider: withAddress(wallet) })
  }

  const connectSolana = async () => {
    const wallet = detectSolanaWallet()
    if (!wallet) { setError('No Solana wallet found. Install Phantom, then reload this page.'); return }
    try {
      const { publicKey } = await wallet.connect()
      setSolAddress(publicKey.toString())
      setError(null)
    } catch (e) { setError(bridgeErrorMessage(e)) }
  }

  /** Modes to try, best first. A transfer into Arc from an EVM chain mints with the same wallet. */
  const modesFor = (): MintMode[] => (from.family === 'evm' && to.id === 'arc' ? ['evm'] : ['forwarder', 'wallet'])

  const buildParams = async (mode: MintMode) => {
    const evmNeeded = from.family === 'evm' || (to.family === 'evm' && mode !== 'forwarder')
    const evmAdapter = evmNeeded ? await getEvmAdapter() : undefined
    const solNeeded = from.family === 'solana' || (to.family === 'solana' && mode === 'wallet')
    const solAdapter = solNeeded ? getSolAdapter() : undefined
    adapters.current = { from: from.family === 'evm' ? evmAdapter : solAdapter, to: to.family === 'evm' ? evmAdapter : solAdapter }

    const base = { token: activeToken, amount, config: { transferSpeed: speed } }
    const fromCtx = from.family === 'evm'
      ? { adapter: evmAdapter!, chain: from.kitChain }
      : { adapter: solAdapter!, chain: from.kitChain }

    if (mode === 'forwarder') {
      return { ...base, from: fromCtx, to: { chain: to.kitChain, recipientAddress: recipient, useForwarder: true as const } }
    }
    return {
      ...base,
      from: fromCtx,
      to: to.family === 'evm'
        ? { adapter: evmAdapter!, chain: to.kitChain, recipientAddress: recipient }
        : { adapter: solAdapter!, chain: to.kitChain, recipientAddress: recipient },
    }
  }

  const switchToSource = async () => {
    if (from.family === 'evm' && from.chainId && walletChainId !== from.chainId) {
      await switchChainAsync({ chainId: from.chainId })
    }
  }

  const getReview = async () => {
    if (!address) { setError('Connect your wallet first.'); return }
    if (!recipientValid) { setError(to.family === 'solana' ? 'Enter a valid Solana address to receive the funds.' : `Enter a valid ${to.label} address to receive the funds.`); return }
    if (needsSolanaWallet && !solAddress) { setError('Connect your Solana wallet first.'); return }
    setReviewing(true); reset()
    try {
      await switchToSource()
      let lastError: unknown
      for (const mode of modesFor()) {
        try {
          const params = await buildParams(mode)
          const estimate = await kit.estimateBridge(params)
          setReview({ estimate, from, to, token: activeToken, amount, speed, recipient, mode, account: address })
          return
        } catch (e) { lastError = e }
      }
      throw lastError
    } catch (e) {
      setReview(null); setError(bridgeErrorMessage(e))
    } finally { setReviewing(false) }
  }

  /**
   * Keep the transfer in Personal history. It counts as confirmed only when the destination mint step has succeeded;
   * until then it is pending. Nothing is recorded if the burn never happened.
   */
  const saveBridge = (res: BridgeResult<string>, rv: Review) => {
    const burn = res.steps.find(st => /burn/i.test(st.name) && st.txHash)
    if (!burn?.txHash) return
    const mint = res.steps.find(st => /mint/i.test(st.name))
    const minted = mint?.state === 'success'
    recordTx(rv.account, {
      hash: burn.txHash as `0x${string}`, kind: 'Bridge',
      detail: `${rv.amount} ${rv.token}: ${rv.from.label} to ${rv.to.label}`,
      amountRaw: parseToken(rv.amount, 6).toString(), token: rv.token, decimals: 6,
      chainId: rv.from.chainId, network: `${rv.from.label} to ${rv.to.label}`, url: rv.from.explorerTx(burn.txHash),
      counterHash: minted && mint?.txHash ? (mint.txHash as `0x${string}`) : undefined,
      counterChainId: rv.to.chainId, counterUrl: minted && mint?.txHash ? rv.to.explorerTx(mint.txHash) : undefined,
      status: res.state === 'success' && minted ? 'confirmed' : 'pending',
    })
  }

  const execute = async () => {
    if (!review) return
    if (address !== review.account) { setReview(null); setError('Wallet account changed since the quote. Review again.'); return }
    setBridging(true); setError(null); setEvents([])
    const handler = (payload: unknown) => {
      const p = payload as { method?: string; values?: { txHash?: string } }
      if (p.method) setEvents(prev => [...prev, { name: p.method!.replace(/^bridge\./, ''), txHash: p.values?.txHash }])
    }
    kit.on('*', handler)
    try {
      await switchToSource()
      const params = await buildParams(review.mode)
      const res = await kit.bridge(params)
      setResult(res)
      saveBridge(res, review)
      if (res.state === 'error') setError('The transfer stopped part way. Your funds are safe. Use Resume to continue from the failed step.')
    } catch (e) {
      setError(bridgeErrorMessage(e))
    } finally {
      kit.off('*', handler)
      setBridging(false)
    }
  }

  /** Resume a transfer that stopped mid-way. Never starts a new burn. */
  const resume = async () => {
    if (!result) return
    setBridging(true); setError(null)
    try {
      const retried = await kit.retryBridge(result, {
        from: adapters.current.from ?? (await getEvmAdapter()),
        to: adapters.current.to,
      })
      setResult(retried)
      if (review) saveBridge(retried, review)
      if (retried.state === 'error') setError('Still not complete. Try Resume again in a moment.')
    } catch (e) { setError(bridgeErrorMessage(e)) } finally { setBridging(false) }
  }

  return {
    from, to, tokens, token: activeToken, amount, speed, recipientInput, recipient, recipientValid, solAddress, needsSolanaWallet,
    review, reviewing, bridging, events, result, error, address,
    setToken: (t: BridgeToken) => { setTokenState(t); reset() },
    setAmount: (v: string) => { setAmount(v); reset() },
    setSpeed: (s: Speed) => { setSpeed(s); reset() },
    setRecipientInput: (v: string) => { setRecipientInput(v); reset() },
    connectSolana, getReview, execute, resume, reset,
  }
}
