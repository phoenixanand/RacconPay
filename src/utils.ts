import { USDC_DECIMALS } from './constants'

/** Format a 6-decimal USDC raw bigint to a display string like "12.50" */
export function formatUsdc(raw: bigint): string {
  const divisor = 10n ** BigInt(USDC_DECIMALS)
  const whole = raw / divisor
  const frac  = raw % divisor
  const fracStr = frac.toString().padStart(USDC_DECIMALS, '0').replace(/0+$/, '')
  return fracStr.length > 0 ? `${whole}.${fracStr}` : `${whole}`
}

/** Parse a human-readable USDC string ("12.50") to a 6-decimal raw bigint. Throws on invalid input. */
export function parseUsdc(value: string): bigint {
  const trimmed = value.trim()
  if (!/^\d+(\.\d*)?$/.test(trimmed)) throw new Error(`Invalid USDC amount: "${value}"`)
  const [wholePart, fracPart = ''] = trimmed.split('.')
  const fracPadded = fracPart.slice(0, USDC_DECIMALS).padEnd(USDC_DECIMALS, '0')
  return BigInt(wholePart) * 10n ** BigInt(USDC_DECIMALS) + BigInt(fracPadded)
}

/** Shorten an Ethereum address for display: 0x1234...abcd */
export function shortAddr(addr: string): string {
  return `${addr.slice(0, 6)}…${addr.slice(-4)}`
}

/** Return a truncated hex hash for display */
export function shortHash(hash: string): string {
  return `${hash.slice(0, 10)}…${hash.slice(-6)}`
}
