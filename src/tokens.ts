/**
 * Stablecoin registry, USDC and EURC (both 6-decimal ERC-20s on Arc).
 * Arc native gas USDC (18 decimals) is never used here: always read balances
 * and send transfers through the ERC-20 interface.
 */
import { ARC_CHAIN_ID, ARC_TESTNET_CHAIN_ID } from './constants'

export type TokenSymbol = 'USDC' | 'EURC'

export interface TokenInfo {
  symbol:   TokenSymbol
  name:     string
  decimals: number
  /** Address per supported chain id. A missing chain means the token is not available there. */
  address:  Partial<Record<number, `0x${string}`>>
}

export const TOKENS: Record<TokenSymbol, TokenInfo> = {
  USDC: {
    symbol: 'USDC',
    name: 'USD Coin',
    decimals: 6,
    address: {
      [ARC_CHAIN_ID]:         '0x3600000000000000000000000000000000000000',
      [ARC_TESTNET_CHAIN_ID]: '0x3600000000000000000000000000000000000000',
    },
  },
  EURC: {
    symbol: 'EURC',
    name: 'Euro Coin',
    decimals: 6,
    address: {
      [ARC_CHAIN_ID]:         '0xbEf5f6d51CB62b58e6A8f77868681825C6fe21c1',
      [ARC_TESTNET_CHAIN_ID]: '0x89B50855Aa3bE2F677cD6303Cec089B5F319D72a',
    },
  },
}

export const TOKEN_LIST: TokenInfo[] = [TOKENS.USDC, TOKENS.EURC]

export function isTokenSymbol(v: unknown): v is TokenSymbol {
  return v === 'USDC' || v === 'EURC'
}

/** Address of a token on a chain, or undefined when it is not deployed there. */
export function tokenAddress(symbol: TokenSymbol, chainId: number): `0x${string}` | undefined {
  return TOKENS[symbol].address[chainId]
}

/** Resolve a token symbol from an on-chain address (case-insensitive). */
export function symbolForAddress(addr: string, chainId: number): TokenSymbol | undefined {
  const a = addr.toLowerCase()
  return TOKEN_LIST.find(t => t.address[chainId]?.toLowerCase() === a)?.symbol
}

/* ── Swap tokens ─────────────────────────────────────────────────────────
 * Circle App Kit swaps on Arc support exactly USDC, EURC and cirBTC.
 * cirBTC (Circle wrapped Bitcoin) has 8 decimals, unlike the 6-decimal stablecoins.
 * Kept separate from TOKENS so invoices and escrow stay USDC/EURC only.
 */
export type SwapSymbol = TokenSymbol | 'cirBTC'

export interface SwapTokenInfo {
  symbol:    SwapSymbol
  /** Alias the App Kit expects. */
  kitSymbol: 'USDC' | 'EURC' | 'CIRBTC'
  name:      string
  decimals:  number
  address:   Partial<Record<number, `0x${string}`>>
}

export const SWAP_TOKENS: Record<SwapSymbol, SwapTokenInfo> = {
  USDC: { symbol: 'USDC', kitSymbol: 'USDC', name: TOKENS.USDC.name, decimals: TOKENS.USDC.decimals, address: TOKENS.USDC.address },
  EURC: { symbol: 'EURC', kitSymbol: 'EURC', name: TOKENS.EURC.name, decimals: TOKENS.EURC.decimals, address: TOKENS.EURC.address },
  cirBTC: {
    symbol: 'cirBTC',
    kitSymbol: 'CIRBTC',
    name: 'Circle Bitcoin',
    decimals: 8,
    address: {
      [ARC_CHAIN_ID]:         '0x171A4217b86A807A64eB94757Db6849fb4bDbAA0',
      [ARC_TESTNET_CHAIN_ID]: '0xf0C4a4CE82A5746AbAAd9425360Ab04fbBA432BF',
    },
  },
}

export const SWAP_SYMBOLS: SwapSymbol[] = ['USDC', 'EURC', 'cirBTC']

export function swapTokenAddress(symbol: SwapSymbol, chainId: number): `0x${string}` | undefined {
  return SWAP_TOKENS[symbol].address[chainId]
}
