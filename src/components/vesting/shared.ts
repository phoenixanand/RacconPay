/**
 * Shared types + helpers for Vesting V2 (breaks / leave).
 * All USDC amounts are 6-decimal ERC-20 units (never the 18-decimal native view).
 */
import { useEffect, useRef, useState } from 'react'
import { useWriteContract, useWaitForTransactionReceipt } from 'wagmi'
import { toast } from 'sonner'

export interface StreamV2 {
  grantor: `0x${string}`
  beneficiary: `0x${string}`
  totalAmount: bigint
  claimedAmount: bigint
  startTime: bigint
  endTime: bigint
  cancelled: boolean
  finalVested: bigint
  totalBreakTime: bigint
}

export interface BreakV2 { start: bigint; end: bigint }

export const LEAVE_STATUS = { Pending: 0, Approved: 1, Rejected: 2, Cancelled: 3 } as const

export interface LeaveRequestV2 {
  streamId: bigint
  start: bigint
  end: bigint
  requestedAt: bigint
  status: number
  reason: string
}

/** Contract constants (mirrors VestingStreamV2). */
export const MAX_BREAKS = 12
export const MAX_TOTAL_BREAK_BPS = 5000n
export const AUTO_APPROVE_DELAY = 7n * 86400n
export const MAX_AUTO_APPROVE_LEAVE = 14n * 86400n
export const GRANTOR_BREAK_NOTICE = 86400n
export const MAX_PENDING_REQUESTS = 5
export const MAX_REASON_BYTES = 140

export const sameAddr = (a?: string, b?: string) => !!a && !!b && a.toLowerCase() === b.toLowerCase()

export function nowSec(): bigint { return BigInt(Math.floor(Date.now() / 1000)) }

/** Current unix time in seconds, refreshed on an interval (for countdowns). */
export function useNow(intervalMs = 1000): bigint {
  const [now, setNow] = useState(nowSec)
  useEffect(() => {
    const id = setInterval(() => setNow(nowSec()), intervalMs)
    return () => clearInterval(id)
  }, [intervalMs])
  return now
}

export function fmtDuration(seconds: bigint): string {
  const s = Number(seconds < 0n ? 0n : seconds)
  if (s >= 86400) {
    const d = Math.floor(s / 86400)
    const h = Math.floor((s % 86400) / 3600)
    return h > 0 && d < 10 ? `${d}d ${h}h` : `${d}d`
  }
  if (s >= 3600) return `${Math.floor(s / 3600)}h ${Math.floor((s % 3600) / 60)}m`
  if (s >= 60) return `${Math.floor(s / 60)}m`
  return `${s}s`
}

export function fmtDateTime(ts: bigint): string {
  return new Date(Number(ts) * 1000).toLocaleString(undefined, {
    month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit',
  })
}

export function fmtDate(ts: bigint): string {
  return new Date(Number(ts) * 1000).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })
}

/** unix seconds -> value for <input type="datetime-local"> (local time). */
export function toLocalInput(sec: bigint): string {
  const d = new Date(Number(sec) * 1000)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

/** <input type="datetime-local"> value -> unix seconds, or null if empty/invalid. */
export function fromLocalInput(value: string): bigint | null {
  if (!value) return null
  const ms = new Date(value).getTime()
  return Number.isNaN(ms) ? null : BigInt(Math.floor(ms / 1000))
}

export function byteLength(s: string): number { return new TextEncoder().encode(s).length }

/** Break seconds that already elapsed or are in progress at `now` (for display only). */
export function breakStatus(b: BreakV2, now: bigint): 'upcoming' | 'active' | 'done' {
  if (now < b.start) return 'upcoming'
  if (now < b.end) return 'active'
  return 'done'
}

const FRIENDLY: Record<string, string> = {
  NotBeneficiary: 'Only the payee can do this.',
  NotGrantor: 'Only the payer can do this.',
  AlreadyCancelled: 'This stream was already cancelled.',
  NothingToClaim: 'Nothing to claim right now.',
  LeaveNotPending: 'This leave request is no longer pending.',
  InvalidLeavePeriod: 'The end of the break must be after its start.',
  LeaveStartsAfterStreamEnd: 'The break would start after the stream ends.',
  ReasonTooLong: 'The reason is too long (140 bytes max).',
  TooManyPendingRequests: 'Too many pending requests on this stream (5 max).',
  TooManyRequests: 'This stream reached its limit of 40 leave requests.',
  AutoApproveTooEarly: 'Auto-approval opens 7 days after the request.',
  AutoApproveLeaveTooLong: 'Only leaves of 14 days or less can be auto-approved.',
  LeaveAlreadyEnded: 'That break has already ended.',
  BreakOverlap: 'This break overlaps another break.',
  TooManyBreaks: 'This stream already has the maximum of 12 breaks.',
  BreakTooLong: 'Total break time would exceed 50% of the stream duration.',
  NoticeTooShort: 'A scheduled break needs at least 1 day of notice.',
  StreamNotFound: 'Stream not found.',
  VaultIlliquid: 'The vault cannot pay out right now. Try again later.',
  NoYield: 'No yield is available to withdraw right now.',
  YieldNotEnabled: 'This stream does not use yield.',
  NoShares: 'No funds are deployed in the vault.',
  NotCancelled: 'This stream is not cancelled.',
  NothingToUnwind: 'Nothing left to unwind.',
  NotStreamParty: 'Only the payer or payee can do this.',
  DepositValueTooLow: 'The vault returned too few shares for this deposit. Try again later.',
}

export function friendlyError(err: unknown): string {
  const e = err as { shortMessage?: string; message?: string }
  const raw = `${e.shortMessage ?? ''} ${e.message ?? ''}`
  if (/user rejected|denied transaction/i.test(raw)) return 'Cancelled in wallet'
  const m = /Error:\s*(\w+)\(/.exec(raw) ?? /reverted with the following reason:\s*(\w+)/.exec(raw)
  if (m && FRIENDLY[m[1]]) return FRIENDLY[m[1]]
  return (e.shortMessage ?? e.message ?? 'Transaction failed').split('\n')[0]
}

/** One write + receipt wait, with toasts and a single onConfirmed callback per tx. */
export function useTx(chainId: number, successMsg: string, onConfirmed?: () => void) {
  const { writeContract, data: hash, isPending, error, reset } = useWriteContract()
  const { isSuccess, isLoading: confirming } = useWaitForTransactionReceipt({ hash, chainId })
  const handled = useRef<string | undefined>(undefined)
  const cb = useRef(onConfirmed)
  useEffect(() => { cb.current = onConfirmed }, [onConfirmed])

  useEffect(() => {
    if (isSuccess && hash && handled.current !== hash) {
      handled.current = hash
      toast.success(successMsg)
      cb.current?.()
    }
  }, [isSuccess, hash, successMsg])

  useEffect(() => { if (error) toast.error(friendlyError(error)) }, [error])

  return { send: writeContract, hash, isPending, confirming, busy: isPending || confirming, isSuccess, reset }
}
