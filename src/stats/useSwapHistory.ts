/**
 * Local swap history. Swaps run through Circle's service, not a RacconPay contract, so the only honest
 * count is the one this browser recorded for the connected wallet. Nothing here leaves the device.
 */
import { useEffect, useMemo, useState } from 'react'
import { readJson, writeJson } from './store'

export interface SwapHistory {
  count: number
  /** Amount paid in, as decimal strings per token symbol. */
  volume: Record<string, string>
  lastAt?: number
}

const EMPTY: SwapHistory = { count: 0, volume: {} }
export type HistoryKind = 'swaps' | 'gateway' | 'gatewayOut'
const keyOf = (kind: HistoryKind, chainId: number, account: string) => `${kind}:${chainId}:${account.toLowerCase()}`
const EVENT = 'racconpay:swap-recorded'

function addDecimal(a: string | undefined, b: string): string {
  const total = Number(a ?? 0) + Number(b)
  return Number.isFinite(total) ? String(Math.round(total * 1e8) / 1e8) : (a ?? '0')
}

export function recordSwap(chainId: number, account: string, tokenIn: string, amountIn: string): void {
  recordLocal('swaps', chainId, account, tokenIn, amountIn)
}

/** Record a completed action (a swap or a Gateway transfer) for this wallet on this device. */
export function recordLocal(kind: HistoryKind, chainId: number, account: string, token: string, amount: string): void {
  const h = readJson<SwapHistory>(keyOf(kind, chainId, account)) ?? EMPTY
  writeJson(keyOf(kind, chainId, account), {
    count: h.count + 1,
    volume: { ...h.volume, [token]: addDecimal(h.volume[token], amount) },
    lastAt: Date.now(),
  } satisfies SwapHistory)
  window.dispatchEvent(new Event(EVENT))
}

export function useSwapHistory(chainId: number, account: string | undefined, kind: HistoryKind = 'swaps'): SwapHistory {
  const [tick, setTick] = useState(0)
  useEffect(() => {
    const bump = () => setTick(t => t + 1)
    window.addEventListener(EVENT, bump)
    return () => window.removeEventListener(EVENT, bump)
  }, [])
  // `tick` changes whenever a swap is recorded, so the memo re-reads storage.
  // oxlint-disable-next-line react-hooks/exhaustive-deps
  return useMemo(() => (account ? (readJson<SwapHistory>(keyOf(kind, chainId, account)) ?? EMPTY) : EMPTY), [kind, chainId, account, tick])
}
