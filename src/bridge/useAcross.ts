/**
 * Across through its Swap API, in both directions between Arc and Ethereum, Base or Avalanche (USDC).
 * Only mounted when the availability check found Arc in Across's chain list. The API returns ready-to-send
 * transactions; the wallet signs each one on a user's click. The fill on the destination chain is read back from
 * Across's deposit status, and a transfer counts as complete only once Across reports it filled.
 */
import { useEffect, useRef, useState } from 'react'
import { useAccount, useSendTransaction, useSwitchChain, usePublicClient } from 'wagmi'
import { isAddress, type Hex } from 'viem'
import { ACROSS_API } from './probe'
import { endpointById, type BridgeEndpoint, type Direction } from './chains'
import { parseToken, formatToken } from '../utils'
import { bridgeErrorMessage } from './useBridge'
import { recordTx } from '../lib/txlog'

interface Tx { chainId: number; to: Hex; data: Hex; value?: string }
export interface AcrossReview {
  approvals: Tx[]
  swap: Tx
  expectedOutput: bigint
  minOutput: bigint
  fillSeconds?: number
  from: BridgeEndpoint
  to: BridgeEndpoint
  amount: string
  recipient: string
  account: string
}
export type FillState = { status: 'waiting' } | { status: 'filled'; fillHash?: string } | { status: 'problem'; text: string }

const str = (v: unknown): string | undefined => (typeof v === 'string' || typeof v === 'number' ? String(v) : undefined)

function parseTx(raw: unknown): Tx {
  const t = raw as { chainId?: number; to?: string; data?: string; value?: string | number } | undefined
  if (!t?.to || !t.data || !t.chainId || !isAddress(t.to)) throw new Error('Across returned an unexpected transaction. Try again.')
  return { chainId: t.chainId, to: t.to, data: t.data as Hex, value: str(t.value) }
}

export function useAcross(direction: Direction) {
  const { address } = useAccount()
  const { switchChainAsync } = useSwitchChain()
  const { sendTransactionAsync } = useSendTransaction()

  const from = endpointById(direction.from)
  const to = endpointById(direction.to)
  // Across here covers EVM chains only.
  const supported = from.family === 'evm' && to.family === 'evm'

  const [amount, setAmount] = useState('')
  const [recipientInput, setRecipientInput] = useState('')
  const [review, setReview] = useState<AcrossReview | null>(null)
  const [busy, setBusy] = useState<'review' | 'send' | null>(null)
  const [hashes, setHashes] = useState<string[]>([])
  const [depositHash, setDepositHash] = useState<string>()
  const [fill, setFill] = useState<FillState | null>(null)
  const [error, setError] = useState<string | null>(null)

  const originPublic = usePublicClient({ chainId: from.chainId ?? 5042 })
  const recipient = (recipientInput.trim() || address) ?? ''
  const recipientValid = isAddress(recipient)
  const reviewRef = useRef<AcrossReview | null>(null)

  const getReview = async () => {
    const inputToken = from.tokenAddress?.USDC
    const outputToken = to.tokenAddress?.USDC
    if (!address || !supported || !inputToken || !outputToken || !from.chainId || !to.chainId) return
    if (!recipientValid) { setError(`Enter a valid ${to.label} address to receive the funds.`); return }
    setBusy('review'); setError(null); setReview(null); setHashes([]); setDepositHash(undefined); setFill(null)
    try {
      const params = new URLSearchParams({
        tradeType: 'exactInput',
        amount: parseToken(amount, 6).toString(),
        inputToken, outputToken,
        originChainId: String(from.chainId),
        destinationChainId: String(to.chainId),
        depositor: address,
        recipient,
      })
      const res = await fetch(`${ACROSS_API}/swap/approval?${params.toString()}`)
      const body = (await res.json()) as Record<string, unknown>
      if (!res.ok) throw new Error(str(body.message) ?? `Across could not quote this route (HTTP ${res.status}).`)
      const expected = str(body.expectedOutputAmount)
      const min = str(body.minOutputAmount)
      if (!expected || !min) throw new Error('Across did not return an output amount. Try again.')
      const next: AcrossReview = {
        approvals: Array.isArray(body.approvalTxns) ? body.approvalTxns.map(parseTx) : [],
        swap: parseTx(body.swapTx),
        expectedOutput: BigInt(expected),
        minOutput: BigInt(min),
        fillSeconds: typeof body.expectedFillTime === 'number' ? body.expectedFillTime : undefined,
        from, to, amount, recipient, account: address,
      }
      reviewRef.current = next
      setReview(next)
    } catch (e) { setError(bridgeErrorMessage(e)) } finally { setBusy(null) }
  }

  const send = async () => {
    if (!review) return
    if (address !== review.account) { setReview(null); setError('Wallet account changed since the quote. Review again.'); return }
    setBusy('send'); setError(null); setHashes([]); setFill(null)
    try {
      const chainId = review.swap.chainId
      await switchChainAsync({ chainId })
      const txs = [...review.approvals, review.swap]
      for (let i = 0; i < txs.length; i++) {
        const tx = txs[i]
        const hash = await sendTransactionAsync({ chainId, to: tx.to, data: tx.data, value: tx.value ? BigInt(tx.value) : undefined })
        setHashes(h => [...h, hash])
        await originPublic?.waitForTransactionReceipt({ hash })
        if (i === txs.length - 1) {
          // The last transaction is the deposit. Keep it as pending until Across reports the fill.
          setDepositHash(hash); setFill({ status: 'waiting' })
          recordTx(review.account, {
            hash, kind: 'Bridge', detail: `${review.amount} USDC via Across: ${review.from.label} to ${review.to.label}`,
            amountRaw: parseToken(review.amount, 6).toString(), token: 'USDC', decimals: 6, chainId: review.from.chainId,
            network: `${review.from.label} to ${review.to.label}`, url: review.from.explorerTx(hash), counterChainId: review.to.chainId, status: 'pending',
          })
        }
      }
      setReview(null); setAmount('')
    } catch (e) { setError(bridgeErrorMessage(e)) } finally { setBusy(null) }
  }

  // Poll Across for the fill of the deposit we just made. Stops when it is filled or Across reports a problem.
  useEffect(() => {
    if (!depositHash || !fill || fill.status !== 'waiting') return
    const rv = reviewRef.current
    let stopped = false
    const check = async () => {
      try {
        const res = await fetch(`${ACROSS_API}/deposit/status?depositTxnRef=${depositHash}`)
        if (!res.ok) return // not indexed yet; keep waiting
        const body = (await res.json()) as { status?: string; fillTxnRef?: string }
        if (stopped) return
        if (body.status === 'filled') {
          setFill({ status: 'filled', fillHash: body.fillTxnRef })
          if (rv && body.fillTxnRef) {
            recordTx(rv.account, {
              hash: depositHash as `0x${string}`, kind: 'Bridge', detail: `${rv.amount} USDC via Across: ${rv.from.label} to ${rv.to.label}`,
              amountRaw: parseToken(rv.amount, 6).toString(), token: 'USDC', decimals: 6, chainId: rv.from.chainId,
              network: `${rv.from.label} to ${rv.to.label}`, url: rv.from.explorerTx(depositHash),
              counterHash: body.fillTxnRef as `0x${string}`, counterChainId: rv.to.chainId, counterUrl: rv.to.explorerTx(body.fillTxnRef), status: 'confirmed',
            })
          }
        } else if (body.status === 'expired' || body.status === 'refunded') {
          setFill({ status: 'problem', text: `Across reports this deposit as ${body.status}. Check your balance on ${rv?.from.label ?? 'the source chain'}.` })
        }
      } catch { /* network hiccup: try again on the next tick */ }
    }
    void check()
    const id = setInterval(() => void check(), 6000)
    return () => { stopped = true; clearInterval(id) }
  }, [depositHash, fill])

  const reset = () => { setReview(null); setError(null) }
  return {
    address, from, to, supported, amount, recipientInput, recipient, recipientValid, review, busy, hashes, depositHash, fill, error,
    setAmount: (v: string) => { setAmount(v); reset() },
    setRecipientInput: (v: string) => { setRecipientInput(v); reset() },
    getReview, send, cancel: () => setReview(null), formatOut: (v: bigint) => formatToken(v, 6),
  }
}
