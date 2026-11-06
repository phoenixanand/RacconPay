/**
 * Leave request list for a V2 stream, with the actions each role may take:
 *  - grantor: approve / reject a pending request
 *  - beneficiary: withdraw a pending request
 *  - anyone: finalize after 7 days (leaves up to 14 days)
 */
import { useReadContracts } from 'wagmi'
import { Check, X, Hourglass } from 'lucide-react'
import { Badge } from '../ui'
import { getLeaveNote, leaveNoteKey } from './labels'
import { VESTING_STREAM_V2_YIELD_ABI as VESTING_ABI } from '../../abisV2Yield'
import {
  useTx, useNow, fmtDateTime, fmtDuration,
  AUTO_APPROVE_DELAY, MAX_AUTO_APPROVE_LEAVE, LEAVE_STATUS,
  type LeaveRequestV2,
} from './shared'

const STATUS_LABEL = ['Pending', 'Approved', 'Rejected', 'Withdrawn']
const STATUS_VARIANT = ['warning', 'success', 'danger', 'default'] as const

export function LeaveRequestRow({ chainId, vestingAddress, requestId, req, isGrantor, isBeneficiary, streamCancelled, onDone }: {
  chainId: number
  vestingAddress: `0x${string}`
  requestId: bigint
  req: LeaveRequestV2
  isGrantor: boolean
  isBeneficiary: boolean
  streamCancelled: boolean
  onDone: () => void
}) {
  const now = useNow(30_000)
  const approve = useTx(chainId, 'Leave approved', onDone)
  const reject = useTx(chainId, 'Leave rejected', onDone)
  const withdraw = useTx(chainId, 'Request withdrawn', onDone)
  const finalize = useTx(chainId, 'Leave finalized', onDone)

  const call = (fn: 'approveLeave' | 'rejectLeave' | 'cancelLeaveRequest' | 'finalizeLeave', tx: typeof approve) =>
    tx.send({ address: vestingAddress, abi: VESTING_ABI, functionName: fn, args: [requestId], chainId })

  // Notes are private to this browser; older requests may still carry an on-chain reason.
  const note = getLeaveNote(leaveNoteKey(vestingAddress, req.streamId, req.start, req.end)) || req.reason
  const pending = req.status === LEAVE_STATUS.Pending
  const ended = req.end <= now
  const opensAt = req.requestedAt + AUTO_APPROVE_DELAY
  const eligibleLength = req.end - req.start <= MAX_AUTO_APPROVE_LEAVE
  const canFinalize = pending && !streamCancelled && !ended && now >= opensAt && eligibleLength

  const btn = 'flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all disabled:opacity-50'

  return (
    <div className="rounded-xl p-3.5 flex flex-col gap-2.5" style={{ background: 'var(--surface-muted)', border: '1px solid var(--border)' }}>
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-sm font-medium tabular-nums" style={{ color: 'var(--ink)' }}>
            {fmtDateTime(req.start)} to {fmtDateTime(req.end)}
          </p>
          <p className="text-xs mt-0.5" style={{ color: 'var(--subtle)' }}>
            {fmtDuration(req.end - req.start)}{note ? ` · ${note}` : ''}
          </p>
        </div>
        <Badge variant={STATUS_VARIANT[req.status] ?? 'default'}>{STATUS_LABEL[req.status] ?? 'Unknown'}</Badge>
      </div>

      {pending && !streamCancelled && (
        <div className="flex flex-wrap items-center gap-2">
          {isGrantor && (
            <>
              <button className={btn} style={{ background: 'var(--success-muted)', color: 'var(--success)' }}
                      disabled={approve.busy || ended} onClick={() => call('approveLeave', approve)}>
                <Check size={12} /> {approve.busy ? 'Approving…' : 'Approve'}
              </button>
              <button className={btn} style={{ background: 'var(--danger-muted)', color: 'var(--danger)' }}
                      disabled={reject.busy} onClick={() => call('rejectLeave', reject)}>
                <X size={12} /> {reject.busy ? 'Rejecting…' : 'Reject'}
              </button>
            </>
          )}
          {isBeneficiary && (
            <button className={btn} style={{ border: '1px solid var(--border-strong)', color: 'var(--ink-2)' }}
                    disabled={withdraw.busy} onClick={() => call('cancelLeaveRequest', withdraw)}>
              {withdraw.busy ? 'Withdrawing…' : 'Withdraw request'}
            </button>
          )}
          {canFinalize && (
            <button className={btn} style={{ background: 'var(--accent-muted)', color: 'var(--accent)' }}
                    disabled={finalize.busy} onClick={() => call('finalizeLeave', finalize)}>
              <Check size={12} /> {finalize.busy ? 'Finalizing…' : 'Finalize (no reply in 7 days)'}
            </button>
          )}
          {!canFinalize && !ended && eligibleLength && now < opensAt && (
            <span className="flex items-center gap-1 text-xs" style={{ color: 'var(--subtle)' }}>
              <Hourglass size={11} /> Auto-approval opens in {fmtDuration(opensAt - now)}
            </span>
          )}
          {ended && <span className="text-xs" style={{ color: 'var(--subtle)' }}>This period is over. Withdraw or reject it.</span>}
        </div>
      )}
    </div>
  )
}

export default function LeaveRequests({ chainId, vestingAddress, requestIds, isGrantor, isBeneficiary, streamCancelled, onDone }: {
  chainId: number
  vestingAddress: `0x${string}`
  requestIds: readonly bigint[]
  isGrantor: boolean
  isBeneficiary: boolean
  streamCancelled: boolean
  onDone: () => void
}) {
  const { data } = useReadContracts({
    contracts: requestIds.map(id => ({
      address: vestingAddress, abi: VESTING_ABI, functionName: 'getLeaveRequest' as const, args: [id] as const, chainId,
    })),
    query: { enabled: requestIds.length > 0, refetchInterval: 15_000 },
  })

  if (requestIds.length === 0) {
    return <p className="text-xs" style={{ color: 'var(--subtle)' }}>No leave requests yet.</p>
  }

  const rows = requestIds
    .map((id, i) => ({ id, req: data?.[i]?.result }))
    .filter((r): r is { id: bigint; req: LeaveRequestV2 } => !!r.req)
    .reverse()

  return (
    <div className="flex flex-col gap-2">
      {rows.map(({ id, req }) => (
        <LeaveRequestRow key={id.toString()} chainId={chainId} vestingAddress={vestingAddress} requestId={id} req={req}
             isGrantor={isGrantor} isBeneficiary={isBeneficiary} streamCancelled={streamCancelled} onDone={onDone} />
      ))}
    </div>
  )
}
