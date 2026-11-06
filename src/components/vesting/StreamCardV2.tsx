/**
 * One Vesting V2 stream: live vesting progress, break timeline, claim / cancel,
 * and the leave (break) tools for each role. All numbers come from the contract.
 */
import { useState } from 'react'
import { useReadContracts } from 'wagmi'
import { ChevronDown, ChevronUp, CheckCircle2, XCircle, PauseCircle, ExternalLink } from 'lucide-react'

import { Card, Label, PrimaryButton, Badge, AlertBox } from '../ui'
import { formatUsdc } from '../../utils'
import { useLabels } from './labels'
import { explorerTxFor } from '../../constants'
import { VESTING_STREAM_V2_YIELD_ABI as VESTING_ABI } from '../../abisV2Yield'
import { RequestLeaveForm, ScheduleBreakForm } from './LeaveForms'
import LeaveRequests from './LeaveRequests'
import YieldPanel from './YieldPanel'
import {
  useTx, useNow, sameAddr, fmtDate, fmtDateTime, fmtDuration, breakStatus,
  type StreamV2,
} from './shared'

type Section = 'none' | 'leave' | 'schedule'

export default function StreamCardV2({ streamId, stream, address, chainId, vestingAddress, hasYield = false, defaultExpanded = false, onRefresh }: {
  streamId: bigint
  stream: StreamV2
  address: `0x${string}`
  chainId: number
  vestingAddress: `0x${string}`
  /** True when `vestingAddress` is the yield-enabled contract. */
  hasYield?: boolean
  /** Start with the details open (used when the card is opened from the table). */
  defaultExpanded?: boolean
  onRefresh: () => void
}) {
  const [expanded, setExpanded] = useState(defaultExpanded)
  const [section, setSection] = useState<Section>('none')
  const [confirmCancel, setConfirmCancel] = useState(false)
  const now = useNow(1000)
  const { nameOf } = useLabels()

  const isBeneficiary = sameAddr(stream.beneficiary, address)
  const isGrantor = sameAddr(stream.grantor, address)

  const base = { address: vestingAddress, abi: VESTING_ABI, args: [streamId] as const, chainId }
  const { data, refetch } = useReadContracts({
    contracts: [
      { ...base, functionName: 'vestedAmount' },
      { ...base, functionName: 'claimableAmount' },
      { ...base, functionName: 'effectiveEndTime' },
      { ...base, functionName: 'getBreaks' },
      { ...base, functionName: 'getLeaveRequestIds' },
      { ...base, functionName: 'pendingLeaveCount' },
    ],
    query: { refetchInterval: 10_000 },
  })

  const vested = (data?.[0]?.result) ?? 0n
  const claimable = (data?.[1]?.result) ?? 0n
  const effectiveEnd = (data?.[2]?.result) ?? stream.endTime
  const breaks = [...((data?.[3]?.result) ?? [])]
  const requestIds = (data?.[4]?.result) ?? []
  const pendingCount = Number((data?.[5]?.result) ?? 0n)

  const refresh = () => { void refetch(); onRefresh() }
  const claim = useTx(chainId, 'Claimed', refresh)
  const cancel = useTx(chainId, 'Stream cancelled. Funds are ready to withdraw.', () => { setConfirmCancel(false); refresh() })

  const onBreak = !stream.cancelled && breaks.some(b => breakStatus(b, now) === 'active')
  const total = stream.totalAmount
  const pct = total === 0n ? 0 : Number((vested * 10000n) / total) / 100
  const claimedPct = total === 0n ? 0 : Number((stream.claimedAmount * 10000n) / total) / 100
  const fullyVested = vested >= total
  const completed = !stream.cancelled && stream.claimedAmount >= total
  const open = !stream.cancelled && !fullyVested

  let statusLabel = 'Streaming'
  let statusVariant: 'default' | 'success' | 'danger' | 'warning' = 'default'
  if (stream.cancelled) { statusLabel = 'Cancelled'; statusVariant = 'danger' }
  else if (completed) { statusLabel = 'Completed'; statusVariant = 'success' }
  else if (fullyVested) { statusLabel = 'Fully vested'; statusVariant = 'success' }
  else if (onBreak) { statusLabel = 'On pause'; statusVariant = 'warning' }

  const barColor = stream.cancelled ? 'var(--danger)' : onBreak ? 'var(--warning)' : fullyVested ? 'var(--success)' : 'var(--accent)'
  const unvested = total - (stream.cancelled ? stream.finalVested : vested)

  const toggle = (s: Section) => setSection(cur => (cur === s ? 'none' : s))
  const pill = (active: boolean) => ({
    background: active ? 'var(--surface-strong)' : 'transparent',
    border: `1px solid ${active ? 'var(--border-strong)' : 'var(--border)'}`,
    color: active ? 'var(--ink)' : 'var(--muted)',
  })
  const pillCls = 'px-3.5 py-2 rounded-xl text-sm font-medium transition-all'

  return (
    <Card className="overflow-hidden">
      <button onClick={() => setExpanded(x => !x)}
              className="w-full px-5 py-4 flex items-center justify-between gap-3 text-left transition-colors hover:bg-white/[0.03]">
        <div className="flex items-center gap-3 min-w-0">
          <span className="font-mono text-sm font-semibold shrink-0" style={{ color: 'var(--accent)' }}>#{streamId.toString()}</span>
          <Badge variant={statusVariant}>{statusLabel}</Badge>
          <span className="text-xs truncate" style={{ color: 'var(--subtle)' }}>
            {isBeneficiary && isGrantor ? 'Both roles' : isBeneficiary ? 'You receive' : 'You sent'}
          </span>
        </div>
        <div className="flex items-center gap-3 shrink-0">
          <span className="text-sm font-semibold tabular-nums" style={{ color: 'var(--ink)' }}>
            {formatUsdc(total)} <span style={{ color: 'var(--subtle)' }}>USDC</span>
          </span>
          {expanded ? <ChevronUp size={15} style={{ color: 'var(--subtle)' }} /> : <ChevronDown size={15} style={{ color: 'var(--subtle)' }} />}
        </div>
      </button>

      <div className="px-5 pb-4">
        <div className="relative h-1.5 rounded-full overflow-hidden" style={{ background: 'var(--surface-strong)' }}>
          <div className="absolute inset-y-0 left-0 rounded-full transition-all" style={{ width: `${pct}%`, background: barColor, opacity: 0.45 }} />
          <div className="absolute inset-y-0 left-0 rounded-full transition-all" style={{ width: `${claimedPct}%`, background: barColor }} />
        </div>
        <div className="flex justify-between mt-1.5 text-xs" style={{ color: 'var(--subtle)' }}>
          <span>{fmtDate(stream.startTime)}</span>
          <span className="tabular-nums font-medium" style={{ color: 'var(--muted)' }}>{pct.toFixed(1)}% vested</span>
          <span>{fmtDate(effectiveEnd)}{stream.totalBreakTime > 0n && !stream.cancelled ? ` (+${fmtDuration(stream.totalBreakTime)})` : ''}</span>
        </div>
      </div>

      {expanded && (
        <div className="border-t border-[var(--border)] px-5 py-4 flex flex-col gap-5">
          {onBreak && (
            <AlertBox variant="warning">
              Vesting is paused until {fmtDateTime(breaks.find(b => breakStatus(b, now) === 'active')!.end)}. The end date moves back by the pause length.
            </AlertBox>
          )}

          <div className="rounded-xl overflow-hidden" style={{ background: 'var(--surface-muted)', border: '1px solid var(--border)' }}>
            {([
              ['Payer', nameOf(stream.grantor)],
              ['Payee', nameOf(stream.beneficiary)],
              ['Vested so far', `${formatUsdc(stream.cancelled ? stream.finalVested : vested)} USDC`],
              ['Claimed', `${formatUsdc(stream.claimedAmount)} USDC`],
              ['Original end', fmtDate(stream.endTime)],
              ['New end (with pauses)', fmtDate(effectiveEnd)],
            ] as [string, string][]).map(([k, v]) => (
              <div key={k} className="flex items-center justify-between px-4 py-2.5 text-sm border-b border-[var(--border)] last:border-0">
                <span style={{ color: 'var(--subtle)' }}>{k}</span>
                <span className="tabular-nums" style={{ color: 'var(--ink-2)' }}>{v}</span>
              </div>
            ))}
          </div>

          <div className="flex flex-col gap-2">
            <Label>Pauses ({breaks.length}/12)</Label>
            {breaks.length === 0 ? (
              <p className="text-xs" style={{ color: 'var(--subtle)' }}>No pauses scheduled. Vesting runs continuously.</p>
            ) : breaks.map((b, i) => {
              const st = breakStatus(b, now)
              return (
                <div key={`${b.start}-${i}`} className="flex items-center justify-between gap-2 rounded-xl px-3.5 py-2.5 text-sm"
                     style={{ background: 'var(--surface-muted)', border: '1px solid var(--border)' }}>
                  <span className="flex items-center gap-2 tabular-nums" style={{ color: 'var(--ink-2)' }}>
                    <PauseCircle size={14} style={{ color: st === 'active' ? 'var(--warning)' : 'var(--subtle)' }} />
                    {fmtDateTime(b.start)} to {fmtDateTime(b.end)}
                  </span>
                  <span className="text-xs" style={{ color: 'var(--subtle)' }}>
                    {st === 'active' ? 'Active' : st === 'upcoming' ? 'Upcoming' : 'Done'} · {fmtDuration(b.end - b.start)}
                  </span>
                </div>
              )
            })}
          </div>

          {open && (isBeneficiary || isGrantor) && (
            <div className="flex flex-col gap-3">
              <div className="flex flex-wrap gap-2">
                {isBeneficiary && <button className={pillCls} style={pill(section === 'leave')} onClick={() => toggle('leave')}>Request leave</button>}
                {isGrantor && <button className={pillCls} style={pill(section === 'schedule')} onClick={() => toggle('schedule')}>Schedule a pause</button>}
              </div>
              {section === 'leave' && isBeneficiary && (
                <RequestLeaveForm chainId={chainId} vestingAddress={vestingAddress} streamId={streamId} stream={stream}
                                  effectiveEnd={effectiveEnd} breaksCount={breaks.length} pendingCount={pendingCount}
                                  onDone={() => { setSection('none'); refresh() }} />
              )}
              {section === 'schedule' && isGrantor && (
                <ScheduleBreakForm chainId={chainId} vestingAddress={vestingAddress} streamId={streamId} stream={stream}
                                   effectiveEnd={effectiveEnd} breaksCount={breaks.length}
                                   onDone={() => { setSection('none'); refresh() }} />
              )}
            </div>
          )}

          {hasYield && (
            <YieldPanel chainId={chainId} contractAddress={vestingAddress} streamId={streamId} stream={stream}
                        isGrantor={isGrantor} isBeneficiary={isBeneficiary} onDone={refresh} />
          )}

          <div className="flex flex-col gap-2">
            <Label>Leave requests</Label>
            <LeaveRequests chainId={chainId} vestingAddress={vestingAddress} requestIds={requestIds}
                           isGrantor={isGrantor} isBeneficiary={isBeneficiary} streamCancelled={stream.cancelled} onDone={refresh} />
          </div>

          {!stream.cancelled && (
            <div className="flex flex-col gap-3">
              {isBeneficiary && (
                <PrimaryButton onClick={() => claim.send({ ...base, functionName: 'claim' })}
                               loading={claim.busy} disabled={claimable === 0n}>
                  {claim.isPending ? 'Waiting for wallet…' : claim.confirming ? 'Confirming…' : `Claim ${formatUsdc(claimable)} USDC`}
                </PrimaryButton>
              )}
              {isGrantor && (completed ? (
                <div className="flex items-center gap-1.5 text-sm font-medium" style={{ color: 'var(--success)' }}>
                  <CheckCircle2 size={14} /> Closed. Fully claimed.
                </div>
              ) : !confirmCancel ? (
                <button onClick={() => setConfirmCancel(true)}
                        className="flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-xl text-sm font-medium transition-all hover:bg-[var(--danger-muted)]"
                        style={{ color: 'var(--danger)', border: '1px solid rgba(232,109,122,0.25)' }}>
                  <XCircle size={14} /> Cancel stream
                </button>
              ) : (
                <div className="rounded-xl p-4 flex flex-col gap-3" style={{ background: 'var(--danger-muted)', border: '1px solid rgba(232,109,122,0.25)' }}>
                  <p className="text-sm text-pretty" style={{ color: 'var(--danger)' }}>
                    Cancelling pays the payee everything vested so far ({formatUsdc(vested)} USDC, minus what they already claimed)
                    and returns {formatUsdc(unvested)} USDC to you. This cannot be undone.
                    {hasYield && ' If part of the funds is in the vault and it cannot pay out right now, the rest is paid later through "Retry payout from the vault", beneficiary first.'}
                  </p>
                  <div className="flex gap-2">
                    <button className="flex-1 px-4 py-2 rounded-xl text-sm font-semibold" style={{ background: 'var(--danger)', color: '#fff8f0' }}
                            disabled={cancel.busy} onClick={() => cancel.send({ ...base, functionName: 'cancel' })}>
                      {cancel.busy ? 'Cancelling…' : 'Yes, cancel'}
                    </button>
                    <button className="px-4 py-2 rounded-xl text-sm" style={{ border: '1px solid var(--border-strong)', color: 'var(--ink-2)' }}
                            onClick={() => setConfirmCancel(false)}>Keep</button>
                  </div>
                </div>
              ))}
            </div>
          )}

          {(claim.hash ?? cancel.hash) && (
            <a href={explorerTxFor(chainId, (claim.hash ?? cancel.hash)!)} target="_blank" rel="noreferrer"
               className="flex items-center gap-1 text-xs" style={{ color: 'var(--accent)' }}>
              <ExternalLink size={11} /> View last tx
            </a>
          )}
        </div>
      )}
    </Card>
  )
}
