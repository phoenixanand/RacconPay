/**
 * Forms for Vesting V2 breaks:
 *  - RequestLeaveForm: beneficiary asks for leave (payer approves, or auto-approval after 7 days).
 *  - ScheduleBreakForm: payer schedules a break with at least 1 day of notice.
 */
import { useState } from 'react'
import { Label, PrimaryButton } from '../ui'
import { VESTING_STREAM_V2_YIELD_ABI as VESTING_ABI } from '../../abisV2Yield'
import { setLeaveNote, leaveNoteKey } from './labels'
import {
  useTx, useNow, toLocalInput, fromLocalInput, fmtDuration,
  GRANTOR_BREAK_NOTICE, MAX_BREAKS, MAX_PENDING_REQUESTS, MAX_TOTAL_BREAK_BPS,
  type StreamV2,
} from './shared'

const inputCls = 'w-full rounded-xl px-3 py-2 text-sm outline-none placeholder:text-[var(--subtle)]'
const inputStyle = { background: 'var(--surface-muted)', color: 'var(--ink)', border: '1px solid var(--border)' }

interface FormProps {
  chainId: number
  vestingAddress: `0x${string}`
  streamId: bigint
  stream: StreamV2
  effectiveEnd: bigint
  breaksCount: number
  onDone: () => void
}

function Capacity({ stream, breaksCount }: { stream: StreamV2; breaksCount: number }) {
  const maxTotal = ((stream.endTime - stream.startTime) * MAX_TOTAL_BREAK_BPS) / 10000n
  const left = maxTotal > stream.totalBreakTime ? maxTotal - stream.totalBreakTime : 0n
  return (
    <p className="text-xs" style={{ color: 'var(--subtle)' }}>
      Pauses used: {breaksCount}/{MAX_BREAKS}. Pause time left: {fmtDuration(left)}.
    </p>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <div className="flex flex-col gap-1"><Label>{label}</Label>{children}</div>
}

export function RequestLeaveForm({
  chainId, vestingAddress, streamId, stream, effectiveEnd, breaksCount, pendingCount, onDone,
}: FormProps & { pendingCount: number }) {
  const now = useNow(30_000)
  const [start, setStart] = useState(() => toLocalInput(BigInt(Math.floor(Date.now() / 1000)) + 3600n))
  const [end, setEnd] = useState(() => toLocalInput(BigInt(Math.floor(Date.now() / 1000)) + 3600n + 3n * 86400n))
  const [note, setNote] = useState('')
  const tx = useTx(chainId, 'Leave requested', () => { setNote(''); onDone() })

  const s = fromLocalInput(start)
  const e = fromLocalInput(end)
  let problem: string | null = null
  if (s === null || e === null) problem = 'Pick a start and end time.'
  else if (e <= s) problem = 'The end must be after the start.'
  else if (e <= now) problem = 'That period is already over.'
  else if (s >= effectiveEnd) problem = 'The pause would start after the stream ends.'
  else if (pendingCount >= MAX_PENDING_REQUESTS) problem = 'You already have 5 pending requests.'

  const length = s !== null && e !== null && e > s ? e - s : 0n
  const autoOk = length > 0n && length <= 14n * 86400n

  return (
    <div className="flex flex-col gap-3">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <Field label="Leave starts">
          <input type="datetime-local" className={inputCls} style={inputStyle} value={start} onChange={ev => setStart(ev.target.value)} />
        </Field>
        <Field label="Leave ends">
          <input type="datetime-local" className={inputCls} style={inputStyle} value={end} onChange={ev => setEnd(ev.target.value)} />
        </Field>
      </div>
      <Field label="Private note (optional)">
        <input className={inputCls} style={inputStyle} placeholder="Visible only in this browser" maxLength={280}
               value={note} onChange={ev => setNote(ev.target.value)} />
      </Field>
      <p className="text-xs text-pretty" style={{ color: 'var(--subtle)' }}>
        Only the dates are recorded on-chain. The note stays in this browser and is never published, so avoid
        sharing personal or health details on-chain.
      </p>
      <Capacity stream={stream} breaksCount={breaksCount} />
      <p className="text-xs text-pretty" style={{ color: 'var(--subtle)' }}>
        Length: {fmtDuration(length)}. {autoOk
          ? 'If your payer does not respond in 7 days, anyone can finalize this leave.'
          : 'Leaves over 14 days need your payer to approve them.'}{' '}
        A leave never changes pay you have already earned.
      </p>
      {problem && <p className="text-xs" style={{ color: 'var(--danger)' }}>{problem}</p>}
      <PrimaryButton
        loading={tx.busy}
        disabled={!!problem}
        onClick={() => {
          if (s === null || e === null) return
          setLeaveNote(leaveNoteKey(vestingAddress, streamId, s, e), note)
          tx.send({
            address: vestingAddress, abi: VESTING_ABI, functionName: 'requestLeave',
            args: [streamId, s, e, ''], chainId,
          })
        }}
      >
        {tx.isPending ? 'Waiting for wallet…' : tx.confirming ? 'Confirming…' : 'Request leave'}
      </PrimaryButton>
    </div>
  )
}

export function ScheduleBreakForm({
  chainId, vestingAddress, streamId, stream, effectiveEnd, breaksCount, onDone,
}: FormProps) {
  const now = useNow(30_000)
  const [start, setStart] = useState(() => toLocalInput(BigInt(Math.floor(Date.now() / 1000)) + 86400n + 3600n))
  const [end, setEnd] = useState(() => toLocalInput(BigInt(Math.floor(Date.now() / 1000)) + 86400n + 3600n + 3n * 86400n))
  const tx = useTx(chainId, 'Pause scheduled', onDone)

  const s = fromLocalInput(start)
  const e = fromLocalInput(end)
  let problem: string | null = null
  if (s === null || e === null) problem = 'Pick a start and end time.'
  else if (e <= s) problem = 'The end must be after the start.'
  else if (s < now + GRANTOR_BREAK_NOTICE + 300n) problem = 'Scheduled pauses need at least 1 day of notice.'
  else if (s >= effectiveEnd) problem = 'The pause would start after the stream ends.'

  return (
    <div className="flex flex-col gap-3">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <Field label="Pause starts">
          <input type="datetime-local" className={inputCls} style={inputStyle} value={start} onChange={ev => setStart(ev.target.value)} />
        </Field>
        <Field label="Pause ends">
          <input type="datetime-local" className={inputCls} style={inputStyle} value={end} onChange={ev => setEnd(ev.target.value)} />
        </Field>
      </div>
      <Capacity stream={stream} breaksCount={breaksCount} />
      <p className="text-xs text-pretty" style={{ color: 'var(--subtle)' }}>
        Vesting pauses during this period and the end date moves back by the same time. The payee keeps
        everything vested so far, and a pause cannot be removed once added.
      </p>
      {problem && <p className="text-xs" style={{ color: 'var(--danger)' }}>{problem}</p>}
      <PrimaryButton
        loading={tx.busy}
        disabled={!!problem}
        onClick={() => {
          if (s === null || e === null) return
          tx.send({
            address: vestingAddress, abi: VESTING_ABI, functionName: 'scheduleBreak',
            args: [streamId, s, e, ''], chainId,
          })
        }}
      >
        {tx.isPending ? 'Waiting for wallet…' : tx.confirming ? 'Confirming…' : 'Schedule pause'}
      </PrimaryButton>
    </div>
  )
}
