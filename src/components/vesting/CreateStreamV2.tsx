/**
 * Create a Vesting V2 stream (supports breaks / leave after creation).
 * Two steps: allow USDC, then create the stream.
 */
import { useState } from 'react'
import { useReadContract } from 'wagmi'
import { toast } from 'sonner'
import { CheckCircle2, AlertTriangle, ExternalLink, CalendarOff, TrendingUp } from 'lucide-react'

import { Card, Label, PrimaryButton, GhostButton } from '../ui'
import { USDC_ADDRESS, ARC_TESTNET_CHAIN_ID, explorerTxFor } from '../../constants'
import { ERC20_ABI } from '../../abis'
import { VESTING_STREAM_V2_ABI } from '../../abisV2'
import { VESTING_STREAM_V2_YIELD_ABI } from '../../abisV2Yield'
import { parseUsdc, formatUsdc } from '../../utils'
import { useTx } from './shared'
import { useLabels } from './labels'

const UNITS = { minutes: 60, hours: 3600, days: 86400 } as const
type Unit = keyof typeof UNITS

export default function CreateStreamV2({ address, chainId, vestingAddress, yieldAddress }: {
  address: `0x${string}`
  chainId: number
  vestingAddress: `0x${string}`
  /** Yield-enabled contract on this network, if any. */
  yieldAddress?: `0x${string}`
}) {
  const { setLabel } = useLabels()
  const [label, setLabelText] = useState('')
  const [useYield, setUseYield] = useState(false)
  const [ack, setAck] = useState(false)
  const [beneficiary, setBeneficiary] = useState('')
  const [amount, setAmount] = useState('')
  const [duration, setDuration] = useState('')
  const [unit, setUnit] = useState<Unit>('days')
  const [errors, setErrors] = useState<string[]>([])

  const { data: balance } = useReadContract({
    address: USDC_ADDRESS, abi: ERC20_ABI, functionName: 'balanceOf', args: [address], chainId,
  })
  const yieldOn = useYield && !!yieldAddress
  const target = yieldOn ? yieldAddress : vestingAddress
  const { data: allowance, refetch: refetchAllowance } = useReadContract({
    address: USDC_ADDRESS, abi: ERC20_ABI, functionName: 'allowance', args: [address, target], chainId,
  })

  const approve = useTx(chainId, 'USDC allowed', () => { void refetchAllowance() })
  const create = useTx(chainId, 'Stream created', () => { if (label.trim()) setLabel(beneficiary, { name: label }) })
  const createdHash = create.isSuccess && create.hash ? create.hash : null

  function parse() {
    const errs: string[] = []
    if (!/^0x[0-9a-fA-F]{40}$/.test(beneficiary)) errs.push('Enter a valid payee address')
    else if (/^0x0{40}$/.test(beneficiary)) errs.push('Zero address is not allowed')
    let amt = 0n
    try { amt = parseUsdc(amount); if (amt === 0n) errs.push('Amount must be more than zero') }
    catch { errs.push('Enter a valid USDC amount') }
    const n = parseFloat(duration)
    const secs = Number.isFinite(n) && n > 0 ? BigInt(Math.floor(n * UNITS[unit])) : 0n
    if (secs === 0n) errs.push('Duration must be more than zero')
    setErrors(errs)
    return { ok: errs.length === 0, amt, secs }
  }

  let amtPreview = 0n
  try { amtPreview = parseUsdc(amount) } catch { /* ignore while typing */ }
  const insufficient = balance !== undefined && amtPreview > 0n && balance < amtPreview
  const hasAllowance = allowance !== undefined && amtPreview > 0n && allowance >= amtPreview

  function handleApprove() {
    const { ok, amt } = parse(); if (!ok) return
    approve.send({ address: USDC_ADDRESS, abi: ERC20_ABI, functionName: 'approve', args: [target, amt], chainId })
  }

  function handleCreate() {
    const { ok, amt, secs } = parse(); if (!ok) return
    if (yieldOn && yieldAddress) {
      create.send({
        address: yieldAddress, abi: VESTING_STREAM_V2_YIELD_ABI, functionName: 'createStream',
        args: [beneficiary as `0x${string}`, amt, secs, true], chainId,
      })
      return
    }
    create.send({
      address: vestingAddress, abi: VESTING_STREAM_V2_ABI, functionName: 'createStream',
      args: [beneficiary as `0x${string}`, amt, secs], chainId,
    })
  }

  function reset() {
    create.reset(); approve.reset()
    setBeneficiary(''); setLabelText(''); setAmount(''); setDuration(''); setErrors([]); setUseYield(false); setAck(false)
    toast.dismiss()
  }

  if (createdHash) {
    return (
      <Card strong className="p-8 flex flex-col items-center text-center gap-5 max-w-md">
        <div className="w-16 h-16 rounded-2xl flex items-center justify-center"
             style={{ background: 'var(--success-muted)', border: '1px solid rgba(94,207,138,0.25)' }}>
          <CheckCircle2 size={32} style={{ color: 'var(--success)' }} />
        </div>
        <div>
          <h2 className="font-display font-bold text-2xl" style={{ color: 'var(--ink)', letterSpacing: '-0.02em' }}>
            Stream created
          </h2>
          <p className="text-sm mt-1.5" style={{ color: 'var(--muted)' }}>
            Find it under My Streams. Either side can request or schedule pauses from the stream.
          </p>
        </div>
        <div className="flex gap-3 items-center">
          <a href={explorerTxFor(chainId, createdHash)} target="_blank" rel="noreferrer"
             className="flex items-center gap-1.5 text-sm" style={{ color: 'var(--accent)' }}>
            <ExternalLink size={14} /> View tx
          </a>
          <GhostButton onClick={reset}>New stream</GhostButton>
        </div>
      </Card>
    )
  }

  const input = 'w-full rounded-xl px-3.5 py-2.5 text-sm outline-none transition-all placeholder:text-[var(--subtle)]'
  const inputStyle = { background: 'var(--surface-muted)', color: 'var(--ink)', border: '1px solid var(--border)' }

  return (
    <div className="grid grid-cols-1 md:grid-cols-[1fr_300px] gap-6 items-start">
      <Card className="divide-y divide-[var(--border)]">
        <div className="p-5">
          <Label>Payee wallet address</Label>
          <input className={`${input} font-mono text-xs mt-1.5`} style={inputStyle} placeholder="0x…"
                 value={beneficiary} onChange={e => setBeneficiary(e.target.value.trim())} />
          <input className={`${input} mt-2`} style={inputStyle} placeholder="Name or employee ID (optional, saved in this browser only)"
                 maxLength={80} value={label} onChange={e => setLabelText(e.target.value)} />
        </div>
        <div className="p-5">
          <Label>Total USDC to vest</Label>
          <div className="flex items-center gap-2 mt-1.5">
            <input className={`${input} tabular-nums`} style={inputStyle} placeholder="0.00" inputMode="decimal"
                   value={amount} onChange={e => setAmount(e.target.value)} />
            <span className="text-sm shrink-0" style={{ color: 'var(--subtle)' }}>USDC</span>
          </div>
        </div>
        <div className="p-5">
          <Label>Vesting duration</Label>
          <div className="flex items-center gap-2 mt-1.5">
            <input className={`${input} tabular-nums`} style={inputStyle} placeholder="30" inputMode="decimal"
                   value={duration} onChange={e => setDuration(e.target.value)} />
            <select className="text-sm rounded-xl px-3 py-2.5 outline-none" style={inputStyle}
                    value={unit} onChange={e => setUnit(e.target.value as Unit)}>
              <option value="minutes">Minutes</option>
              <option value="hours">Hours</option>
              <option value="days">Days</option>
            </select>
          </div>
        </div>
        {yieldAddress && (
          <div className="p-5 flex flex-col gap-3">
            <label className="flex items-start gap-3 cursor-pointer">
              <input type="checkbox" className="mt-1 w-4 h-4" checked={useYield}
                     onChange={e => { setUseYield(e.target.checked); setAck(false) }} />
              <span>
                <span className="flex items-center gap-1.5 text-sm font-semibold" style={{ color: 'var(--ink)' }}>
                  <TrendingUp size={14} style={{ color: 'var(--vest-accent)' }} /> Earn yield on locked funds
                </span>
                <span className="block text-xs mt-0.5 text-pretty" style={{ color: 'var(--muted)' }}>
                  Optional, off by default, and fixed once the stream is created. 70% of the amount is deposited into{' '}
                  {chainId === ARC_TESTNET_CHAIN_ID ? 'the Arc Testnet Earn vault' : 'the lending vault this contract was deployed with'} (USDC). 30% stays in the contract so claims can be paid. Any yield belongs to you.
                </span>
              </span>
            </label>
            {useYield && (
              <div className="rounded-xl p-3.5 flex flex-col gap-2.5" style={{ background: 'var(--warning-muted)', border: '1px solid rgba(245,192,90,0.25)' }}>
                <p className="text-xs text-pretty" style={{ color: 'var(--warning)' }}>
                  The deposited part can lose value and may not be withdrawable instantly. The payee is always paid their
                  vested amount first, and any loss comes out of your unvested part first. If the vault cannot pay out, claims can
                  be delayed until it can.
                </p>
                <label className="flex items-start gap-2 text-xs cursor-pointer" style={{ color: 'var(--ink-2)' }}>
                  <input type="checkbox" className="mt-0.5" checked={ack} onChange={e => setAck(e.target.checked)} />
                  I understand these risks
                </label>
              </div>
            )}
          </div>
        )}
        <div className="p-5 flex gap-3 text-xs" style={{ color: 'var(--muted)' }}>
          <CalendarOff size={16} className="shrink-0 mt-0.5" style={{ color: 'var(--vest-accent)' }} />
          <p className="text-pretty">
            Pauses are limited to 12 per stream and 50% of the duration in total. While a pause is active,
            vesting stops and the end date moves back by the same time, so no pay is lost.
          </p>
        </div>
      </Card>

      <div className="flex flex-col gap-4">
        <Card strong className="p-5 flex flex-col gap-4">
          <div className="flex items-center justify-between">
            <Label>Your balance</Label>
            <span className="font-mono text-sm tabular-nums" style={{ color: 'var(--muted)' }}>
              {balance !== undefined ? formatUsdc(balance) : '—'} <span style={{ color: 'var(--subtle)' }}>USDC</span>
            </span>
          </div>
          {insufficient && (
            <div className="flex items-start gap-2 rounded-xl px-3 py-2.5 text-xs"
                 style={{ background: 'var(--danger-muted)', border: '1px solid rgba(232,109,122,0.25)', color: 'var(--danger)' }}>
              <AlertTriangle size={13} className="shrink-0 mt-0.5" />
              <span>You need {amount} USDC but have {balance !== undefined ? formatUsdc(balance) : '0'}.</span>
            </div>
          )}
          {!hasAllowance && (
            <PrimaryButton onClick={handleApprove} loading={approve.busy} disabled={insufficient || !amount}>
              {approve.isPending ? 'Waiting for wallet…' : approve.confirming ? 'Confirming…' : '1. Allow USDC'}
            </PrimaryButton>
          )}
          {hasAllowance && (
            <PrimaryButton onClick={handleCreate} loading={create.busy} disabled={insufficient || (yieldOn && !ack)}>
              {create.isPending ? 'Waiting for wallet…' : create.confirming ? 'Confirming…' : '2. Create stream'}
            </PrimaryButton>
          )}
        </Card>
        {errors.length > 0 && (
          <div className="rounded-xl px-4 py-3 text-sm space-y-1"
               style={{ background: 'var(--danger-muted)', border: '1px solid rgba(232,109,122,0.25)', color: 'var(--danger)' }}>
            {errors.map(e => <p key={e}>{e}</p>)}
          </div>
        )}
      </div>
    </div>
  )
}
