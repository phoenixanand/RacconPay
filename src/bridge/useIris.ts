/**
 * Watches Circle's attestation service (Iris) for transfers saved in storage. Iris reports whether Circle has confirmed
 * the burn and, once the destination mint has happened, the mint transaction hash. A transfer minted by Circle's
 * forwarder while the page was closed is finished automatically when its mint shows up here.
 */
import { useEffect, useRef, useState } from 'react'
import { endpointById, type EndpointId } from './chains'
import { removePending, type PendingTransfer } from './pending'
import { recordTx } from '../lib/txlog'
import { parseToken } from '../utils'

/** CCTP domains, from the App Kit chain definitions. */
const DOMAIN: Record<string, number> = { Arc: 26, Ethereum: 0, Avalanche: 1, Base: 6, Solana: 5 }
const POLL_MS = 20_000

export type IrisState = 'checking' | 'confirming' | 'ready' | 'minted'

export interface IrisMessage { status?: string; destinationMintTxHash?: string }

/** Circle's record of a burn: whether it is confirmed and, once minted, the destination mint hash. */
export async function lookupBurn(fromId: EndpointId, burnTx: string): Promise<IrisMessage | null> {
  const domain = DOMAIN[endpointById(fromId).kitChain]
  if (domain === undefined) return null
  const res = await fetch(`https://iris-api.circle.com/v2/messages/${domain}?transactionHash=${encodeURIComponent(burnTx)}`)
  if (!res.ok) return null
  const body = (await res.json()) as { messages?: IrisMessage[] }
  return body.messages?.[0] ?? null
}

const lookup = (t: PendingTransfer) => lookupBurn(t.fromId, t.burnTx)

export function usePendingStatus(items: PendingTransfer[]): Record<string, IrisState> {
  const [states, setStates] = useState<Record<string, IrisState>>({})
  const itemsRef = useRef(items)
  useEffect(() => { itemsRef.current = items })
  const key = items.map(t => t.burnTx).join(',')

  useEffect(() => {
    if (!key) return
    let alive = true
    const tick = async () => {
      for (const t of itemsRef.current) {
        try {
          const m = await lookup(t)
          if (!alive) return
          if (!m) { setStates(s => ({ ...s, [t.burnTx]: s[t.burnTx] ?? 'checking' })); continue }
          const mintHash = typeof m.destinationMintTxHash === 'string' && m.destinationMintTxHash ? m.destinationMintTxHash : undefined
          if (mintHash) {
            const src = endpointById(t.fromId)
            const dst = endpointById(t.toId)
            removePending(t.account, t.burnTx)
            recordTx(t.account, {
              hash: t.burnTx as `0x${string}`, kind: 'Bridge',
              detail: `${t.amount} ${t.token}: ${src.label} to ${dst.label}`,
              amountRaw: parseToken(t.amount, 6).toString(), token: t.token, decimals: 6,
              chainId: src.chainId, network: `${src.label} to ${dst.label}`, url: src.explorerTx(t.burnTx),
              counterHash: mintHash as `0x${string}`, counterChainId: dst.chainId, counterUrl: dst.explorerTx(mintHash),
              status: 'confirmed',
            })
            setStates(s => ({ ...s, [t.burnTx]: 'minted' }))
          } else {
            setStates(s => ({ ...s, [t.burnTx]: m.status === 'complete' ? 'ready' : 'confirming' }))
          }
        } catch { /* network hiccup: keep the last known state and try again next tick */ }
      }
    }
    void tick()
    const id = setInterval(() => { void tick() }, POLL_MS)
    return () => { alive = false; clearInterval(id) }
  }, [key])

  return states
}
