/**
 * Live availability checks for third-party bridges. A provider is only offered if its own API reports
 * a route to Arc; a failed or inconclusive check always means "unavailable", never a guess.
 */
import { useEffect, useState } from 'react'
import { arc } from 'viem/chains'
import { type ProviderId, type ProviderState } from './providers'

export const ACROSS_API = 'https://app.across.to/api'

async function probeAcross(signal: AbortSignal): Promise<ProviderState> {
  try {
    const res = await fetch(`${ACROSS_API}/swap/chains`, { signal })
    if (!res.ok) return { status: 'unavailable', reason: `Across could not be reached (HTTP ${res.status}).` }
    const chains = (await res.json()) as { chainId?: number }[]
    return chains.some(c => c.chainId === arc.id)
      ? { status: 'ready' }
      : { status: 'unavailable', reason: 'Across does not list Arc yet. This option turns on by itself once it does.' }
  } catch {
    if (signal.aborted) return { status: 'checking' }
    return { status: 'unavailable', reason: 'Across could not be reached from this browser.' }
  }
}

export type ProviderStates = Record<ProviderId, ProviderState>

export function useProviderStates(): ProviderStates {
  const [across, setAcross] = useState<ProviderState>({ status: 'checking' })

  useEffect(() => {
    const ctl = new AbortController()
    void probeAcross(ctl.signal).then(s => { if (!ctl.signal.aborted) setAcross(s) })
    return () => ctl.abort()
  }, [])

  return {
    cctp: { status: 'ready' },
    gateway: { status: 'ready' },
    across,
  }
}
