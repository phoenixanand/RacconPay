/**
 * Bridge providers the user can pick between. Only providers with a confirmed Arc Mainnet route are usable;
 * the rest stay listed with an honest reason so nobody wonders why they are missing.
 */
export type ProviderId = 'cctp' | 'gateway' | 'across'

export interface ProviderInfo {
  id: ProviderId
  label: string
  /** One line on how it works. */
  blurb: string
  /** Who it suits. */
  hint: string
  speed: string
  tokens: string
}

export const PROVIDERS: ProviderInfo[] = [
  {
    id: 'cctp', label: 'CCTP',
    blurb: 'Circle\'s native burn-and-mint transfer. USDC is burned on the source chain and minted on the destination.',
    hint: 'Best for a one-off transfer. USDC and EURC.',
    speed: 'Fast: about a minute. Standard: 15+ minutes.', tokens: 'USDC, EURC (EVM)',
  },
  {
    id: 'gateway', label: 'Gateway',
    blurb: 'Deposit USDC once into a unified balance, then spend it on any supported chain in under a second.',
    hint: 'Best if you move USDC often or hold it on several chains.',
    speed: 'Under a second after your deposit is confirmed.', tokens: 'USDC',
  },
  {
    id: 'across', label: 'Across',
    blurb: 'Intent-based bridge: a relayer fills your transfer on the destination chain and is repaid later. Works to and from Arc.',
    hint: 'Third-party bridge. Quotes and fees come from Across.',
    speed: 'Usually about a minute, set by Across relayers.', tokens: 'USDC (Ethereum, Base, Avalanche)',
  },
]

export function providerById(id: string | null): ProviderInfo {
  return PROVIDERS.find(p => p.id === id) ?? PROVIDERS[0]
}

export type ProviderStatus = 'ready' | 'checking' | 'unavailable'
export interface ProviderState { status: ProviderStatus; reason?: string }
