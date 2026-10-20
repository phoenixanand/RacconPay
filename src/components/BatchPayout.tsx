/**
 * BatchPayout page — Arc Dark redesign.
 *
 * Flow: add rows → approve USDC → batchPay → receipt NFT minted.
 *
 * DECIMAL NOTE:
 *   All amounts are 6-decimal ERC-20 USDC.
 *   Arc native gas is 18-decimal — never used here.
 */

import { useState, useRef } from 'react'
import {
  useAccount,
  useWriteContract,
  useWaitForTransactionReceipt,
  useReadContract,
} from 'wagmi'
import { toast } from 'sonner'
import { Upload, Plus, Trash2, ExternalLink, CheckCircle2, Send, ArrowRight, Download, AlertTriangle } from 'lucide-react'
import Papa from 'papaparse'

import ChainGuard from './ChainGuard'
import SuccessAnimation from './SuccessAnimation'
import { USDC_ADDRESS, BATCH_PAYOUT_ADDRESS, ARC_CHAIN_ID, explorerTx } from '../constants'
import { ERC20_ABI, BATCH_PAYOUT_ABI } from '../abis'
import { parseUsdc, formatUsdc } from '../utils'
import { Card, Label, PrimaryButton, TxStatus, PageHeader, Badge } from './ui'

interface Row { addr: string; amount: string }
const emptyRow = (): Row => ({ addr: '', amount: '' })
type Step = 'idle' | 'approving' | 'approved' | 'paying'

export default function BatchPayoutPage() {
  return <ChainGuard><Inner /></ChainGuard>
}

function Inner() {
  const { address } = useAccount()
  const [rows, setRows]         = useState<Row[]>([emptyRow()])
  const [errors, setErrors]     = useState<string[]>([])
  const [step, setStep]         = useState<Step>('idle')
  const [isDone, setIsDone]     = useState(false)
  const [showSuccess, setShowSuccess] = useState(false)
  const [receiptId, setReceiptId]       = useState<bigint | null>(null)
  const [processedHash, setProcessedHash] = useState<string | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  const { data: balance } = useReadContract({
    address: USDC_ADDRESS, abi: ERC20_ABI, functionName: 'balanceOf',
    args: [address!], chainId: ARC_CHAIN_ID, query: { enabled: !!address },
  })

  const { writeContract: writeApprove, data: approveHash, isPending: isApproving } = useWriteContract()
  const { isSuccess: approveConfirmed } = useWaitForTransactionReceipt({ hash: approveHash })
  const { writeContract: writeBatchPay, data: batchHash,   isPending: isPaying   } = useWriteContract()
  const { isSuccess: batchConfirmed, data: batchReceipt, isLoading: batchLoading } = useWaitForTransactionReceipt({ hash: batchHash })

  if (batchConfirmed && batchReceipt && batchHash && batchHash !== processedHash) {
    try {
      const log = batchReceipt.logs.find(l => l.address.toLowerCase() === BATCH_PAYOUT_ADDRESS.toLowerCase())
      if (log && log.data.length >= 194) {
        const tokenIdHex = log.data.slice(2 + 64 * 2, 2 + 64 * 3)
        setReceiptId(BigInt('0x' + tokenIdHex))
      }
    } catch { /* ignore */ }
    setProcessedHash(batchHash)
    setIsDone(true)
    setShowSuccess(true)
  }

  if (approveConfirmed && step === 'approving') {
    setStep('approved')
    toast.success('USDC allowed — confirm the batch send')
  }

  function validate() {
    const errs: string[] = []
    const parsed: { addr: `0x${string}`; amount: bigint }[] = []
    let total = 0n
    if (rows.length === 0) errs.push('Add at least one recipient.')
    if (rows.length > 100) errs.push('Maximum 100 recipients per batch.')
    const seen = new Set<string>()
    rows.forEach((r, i) => {
      const l = `Row ${i + 1}`
      if (!r.addr.match(/^0x[0-9a-fA-F]{40}$/)) errs.push(`${l}: invalid address`)
      else if (r.addr === '0x0000000000000000000000000000000000000000') errs.push(`${l}: zero address`)
      else if (seen.has(r.addr.toLowerCase())) errs.push(`${l}: duplicate address (${r.addr.slice(0,6)}…)`)
      else seen.add(r.addr.toLowerCase())
      try {
        const amt = parseUsdc(r.amount)
        if (amt === 0n) errs.push(`${l}: amount cannot be zero`)
        parsed.push({ addr: r.addr as `0x${string}`, amount: amt })
        total += amt
      } catch { errs.push(`${l}: invalid amount "${r.amount}"`) }
    })
    setErrors(errs)
    return { valid: errs.length === 0, parsed, total }
  }

  function addRow()    { setRows(r => [...r, emptyRow()]) }
  function removeRow(i: number) { setRows(r => r.filter((_, j) => j !== i)) }
  function updateRow(i: number, field: keyof Row, val: string) {
    setRows(r => r.map((row, j) => j === i ? { ...row, [field]: val } : row))
  }

  function loadCsv(file: File) {
    Papa.parse<string[]>(file, {
      complete(results) {
        const newRows: Row[] = []
        for (const cols of results.data) {
          if (!cols || cols.length < 2) continue
          const addr = cols[0].trim(); const amt = cols[1].trim()
          if (!addr || !amt) continue
          newRows.push({ addr, amount: amt })
        }
        if (newRows.length) { setRows(newRows); setErrors([]) }
        else toast.error('CSV had no valid rows (expected: address,amount)')
      },
      error() { toast.error('Could not read CSV') },
    })
  }

  function handleApprove() {
    const { valid, total } = validate()
    if (!valid) return
    if (total === 0n) { toast.error('Total is zero'); return }
    setStep('approving')
    try {
      writeApprove({ address: USDC_ADDRESS, abi: ERC20_ABI, functionName: 'approve',
        args: [BATCH_PAYOUT_ADDRESS, total], chainId: ARC_CHAIN_ID })
    } catch (e: unknown) {
      setStep('idle')
      const msg = e instanceof Error ? e.message : String(e)
      toast.error(msg.includes('user rejected') ? 'Cancelled' : msg)
    }
  }

  function handleBatchPay() {
    const { valid, parsed } = validate()
    if (!valid) return
    setStep('paying')
    try {
      writeBatchPay({ address: BATCH_PAYOUT_ADDRESS, abi: BATCH_PAYOUT_ABI,
        functionName: 'batchPay', args: [parsed], chainId: ARC_CHAIN_ID })
    } catch (e: unknown) {
      setStep('approved')
      const msg = e instanceof Error ? e.message : String(e)
      toast.error(msg.includes('user rejected') ? 'Cancelled' : msg)
    }
  }

  function reset() {
    setRows([emptyRow()])
    setErrors([])
    setStep('idle')
    setIsDone(false)
    setReceiptId(null)
    setProcessedHash(null)
  }

  let displayTotal = '—'; let totalRaw = 0n
  try { totalRaw = rows.reduce((acc, r) => acc + parseUsdc(r.amount), 0n); displayTotal = formatUsdc(totalRaw) } catch { /* leave */ }

  const balanceFormatted = balance ? formatUsdc(balance) : '—'
  const insufficientFunds = balance !== undefined && totalRaw > 0n && balance < totalRaw
  const canApprove = step === 'idle'
  const canPay     = step === 'approved'

  function downloadTemplate() {
    const csv = 'address,amount\n0xRecipientAddress1,10.00\n0xRecipientAddress2,25.50'
    const blob = new Blob([csv], { type: 'text/csv' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a'); a.href = url; a.download = 'racconpay-batch-template.csv'; a.click()
    URL.revokeObjectURL(url)
  }

  // ── Success animation overlay (fires when batch confirmed) ─────────
  if (showSuccess) {
    return (
      <>
        <SuccessAnimation
          show={showSuccess}
          label="Batch sent!"
          sublabel={receiptId !== null ? `Receipt NFT #${receiptId} minted` : 'All recipients paid'}
          duration={2400}
          onDone={() => setShowSuccess(false)}
        />
        {/* Keep the success screen underneath */}
        <div className="max-w-lg mx-auto opacity-0" />
      </>
    )
  }

  // ── Success screen ───────────────────────────────────────────────
  if (isDone) {
    return (
      <div className="max-w-lg mx-auto">
        <Card strong className="p-8 flex flex-col items-center text-center gap-5">
          <div className="w-16 h-16 rounded-2xl flex items-center justify-center"
               style={{ background: 'var(--success-muted)', border: '1px solid rgba(94,207,138,0.25)' }}>
            <CheckCircle2 size={32} style={{ color: 'var(--success)' }} />
          </div>
          <div>
            <h2 className="font-display font-bold text-2xl" style={{ color: 'var(--ink)', letterSpacing: '-0.02em' }}>
              Batch Sent!
            </h2>
            {receiptId !== null && (
              <p className="text-sm mt-1.5" style={{ color: 'var(--muted)' }}>
                Receipt NFT <span className="font-mono font-semibold" style={{ color: 'var(--accent)' }}>#{receiptId.toString()}</span> minted to your wallet.
              </p>
            )}
          </div>
          <div className="flex gap-3">
            {batchHash && (
              <a href={explorerTx(batchHash)} target="_blank" rel="noreferrer"
                 className="flex items-center gap-1.5 text-sm" style={{ color: 'var(--accent)' }}>
                <ExternalLink size={14} /> View on explorer
              </a>
            )}
            <button onClick={reset}
                    className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-medium transition-all hover:bg-white/5"
                    style={{ color: 'var(--ink-2)', border: '1px solid var(--border-strong)' }}>
              New batch <ArrowRight size={13} />
            </button>
          </div>
        </Card>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-6">
      <PageHeader icon={Send} title="Batch Payout" subtitle="Send USDC to up to 100 addresses in one transaction." />

      <div className="grid grid-cols-1 md:grid-cols-[1fr_280px] gap-6 items-start">
        {/* Left col — recipient table */}
        <div className="flex flex-col gap-4">

          {/* CSV drop zone */}
          <div className="flex flex-col gap-2">
            <button
              onClick={() => fileRef.current?.click()}
              onDragOver={e => e.preventDefault()}
              onDrop={e => { e.preventDefault(); const f = e.dataTransfer.files[0]; if (f) loadCsv(f) }}
              className="w-full flex flex-col items-center gap-2 rounded-xl py-6 transition-all hover:bg-white/5"
              style={{ border: '1.5px dashed var(--border-strong)' }}
            >
              <Upload size={20} style={{ color: 'var(--subtle)' }} />
              <span className="text-sm font-medium" style={{ color: 'var(--muted)' }}>Drop a CSV or click to upload</span>
              <span className="text-xs" style={{ color: 'var(--subtle)' }}>Format: address,amount — one row per recipient</span>
              <input ref={fileRef} type="file" accept=".csv,text/csv" className="hidden"
                     onChange={e => { const f = e.target.files?.[0]; if (f) loadCsv(f) }} />
            </button>
            <button onClick={downloadTemplate}
              className="flex items-center gap-1.5 text-xs self-end transition-colors hover:opacity-80"
              style={{ color: 'var(--subtle)' }}>
              <Download size={12} /> Download CSV template
            </button>
          </div>

          {/* Recipient rows */}
          <Card className="overflow-hidden">
            {/* Header — hidden on mobile (labels shown inline instead) */}
            <div className="hidden sm:grid grid-cols-[1fr_140px_36px] gap-2 px-4 py-2.5 border-b border-[var(--border)]">
              <Label>Recipient address</Label>
              <Label>USDC amount</Label>
              <span />
            </div>

            {/* Rows */}
            <div className="divide-y divide-[var(--border)]">
              {rows.map((row, i) => (
                <div key={i} className="px-4 py-3 flex flex-col sm:grid sm:grid-cols-[1fr_140px_36px] gap-2 sm:items-center">
                  {/* Mobile: stacked label + input */}
                  <div className="flex flex-col gap-1 sm:contents">
                    <span className="sm:hidden text-[10px] font-semibold uppercase tracking-wider" style={{ color: 'var(--subtle)' }}>Address</span>
                    <input
                      className="font-mono text-xs w-full rounded-lg px-2.5 py-2 outline-none transition-all placeholder:text-[var(--subtle)]"
                      style={{ background: 'var(--surface-muted)', color: 'var(--ink)', border: '1px solid var(--border)' }}
                      placeholder="0x…"
                      value={row.addr}
                      onChange={e => updateRow(i, 'addr', e.target.value)}
                      onFocus={e => (e.currentTarget.style.borderColor = 'var(--border-strong)')}
                      onBlur={e  => (e.currentTarget.style.borderColor = 'var(--border)')}
                    />
                  </div>
                  <div className="flex items-center gap-2 sm:contents">
                    <div className="flex flex-col gap-1 flex-1 sm:contents">
                      <span className="sm:hidden text-[10px] font-semibold uppercase tracking-wider" style={{ color: 'var(--subtle)' }}>Amount (USDC)</span>
                      <input
                        className="text-sm tabular-nums w-full rounded-lg px-2.5 py-2 outline-none transition-all placeholder:text-[var(--subtle)]"
                        style={{ background: 'var(--surface-muted)', color: 'var(--ink)', border: '1px solid var(--border)' }}
                        placeholder="0.00"
                        value={row.amount}
                        onChange={e => updateRow(i, 'amount', e.target.value)}
                        onFocus={e => (e.currentTarget.style.borderColor = 'var(--border-strong)')}
                        onBlur={e  => (e.currentTarget.style.borderColor = 'var(--border)')}
                      />
                    </div>
                    <button onClick={() => removeRow(i)} className="p-2 rounded-lg transition-colors hover:bg-[var(--danger-muted)] shrink-0"
                            style={{ color: 'var(--subtle)' }} aria-label="Remove row">
                      <Trash2 size={14} />
                    </button>
                  </div>
                </div>
              ))}
            </div>

            <div className="px-4 py-2.5 border-t border-[var(--border)]">
              <button onClick={addRow} disabled={rows.length >= 100}
                      className="flex items-center gap-1.5 text-sm font-medium transition-colors disabled:opacity-40"
                      style={{ color: 'var(--accent)' }}>
                <Plus size={14} /> Add row
              </button>
            </div>
          </Card>

          {/* Errors */}
          {errors.length > 0 && (
            <div className="rounded-xl px-4 py-3 text-sm space-y-1"
                 style={{ background: 'var(--danger-muted)', border: '1px solid rgba(232,109,122,0.25)', color: 'var(--danger)' }}>
              {errors.map((e, i) => <p key={i}>{e}</p>)}
            </div>
          )}
        </div>

        {/* Right col — summary + actions */}
        <div className="flex flex-col gap-4">
          <Card strong className="p-5 flex flex-col gap-4">
            {/* Balance */}
            <div className="flex items-center justify-between">
              <Label>Your balance</Label>
              <span className="font-mono text-sm tabular-nums" style={{ color: 'var(--muted)' }}>
                {balanceFormatted} <span style={{ color: 'var(--subtle)' }}>USDC</span>
              </span>
            </div>

            {/* Spectral strip */}
            <div className="h-px rounded-full" style={{ background: 'var(--spectral)', opacity: 0.3 }} />

            {/* Total */}
            <div>
              <Label>Total to send</Label>
              <div className="font-display font-bold text-3xl tabular-nums mt-1" style={{ color: 'var(--ink)', letterSpacing: '-0.03em' }}>
                {displayTotal}
                <span className="text-lg font-medium ml-1.5" style={{ color: 'var(--subtle)' }}>USDC</span>
              </div>
              <p className="text-xs mt-1" style={{ color: 'var(--subtle)' }}>
                {rows.length} recipient{rows.length !== 1 ? 's' : ''}
              </p>
            </div>

            {/* Steps */}
            <div className="flex flex-col gap-2.5 mt-1">
              {/* Step indicator */}
              <div className="flex items-center gap-2 text-xs" style={{ color: 'var(--subtle)' }}>
                <span
                  className="w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold shrink-0"
                  style={{
                    background: step !== 'idle' ? 'var(--success-muted)' : 'var(--surface-strong)',
                    color: step !== 'idle' ? 'var(--success)' : 'var(--subtle)',
                    border: `1px solid ${step !== 'idle' ? 'rgba(94,207,138,0.3)' : 'var(--border)'}`,
                  }}
                >
                  {step !== 'idle' ? '✓' : '1'}
                </span>
                Allow USDC spend
                <span className="ml-auto">
                  <Badge variant={step !== 'idle' ? 'success' : 'default'}>
                    {step === 'approving' ? 'Pending' : step !== 'idle' ? 'Done' : 'Required'}
                  </Badge>
                </span>
              </div>
              <div className="flex items-center gap-2 text-xs" style={{ color: 'var(--subtle)' }}>
                <span
                  className="w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold shrink-0"
                  style={{
                    background: isDone ? 'var(--success-muted)' : 'var(--surface-strong)',
                    color: isDone ? 'var(--success)' : 'var(--subtle)',
                    border: `1px solid ${isDone ? 'rgba(94,207,138,0.3)' : 'var(--border)'}`,
                  }}
                >
                  {isDone ? '✓' : '2'}
                </span>
                Send batch
              </div>
            </div>

            {/* Insufficient funds warning */}
            {insufficientFunds && (
              <div className="flex items-start gap-2 rounded-xl px-3 py-2.5 text-xs"
                   style={{ background: 'var(--danger-muted)', border: '1px solid rgba(232,109,122,0.25)', color: 'var(--danger)' }}>
                <AlertTriangle size={13} className="shrink-0 mt-0.5" />
                <span>You need {displayTotal} USDC but have {balanceFormatted}. Get USDC on Arc first.</span>
              </div>
            )}

            {/* CTA */}
            {canApprove && (
              <PrimaryButton onClick={handleApprove} loading={isApproving} disabled={insufficientFunds}>
                {isApproving ? 'Waiting for wallet…' : 'Allow USDC'}
              </PrimaryButton>
            )}
            {step === 'approving' && !canApprove && (
              <PrimaryButton onClick={handleApprove} loading={true}>
                Waiting…
              </PrimaryButton>
            )}
            {canPay && (
              <PrimaryButton onClick={handleBatchPay} loading={isPaying || batchLoading}>
                {isPaying ? 'Waiting for wallet…' : batchLoading ? 'Confirming…' : 'Send Batch'}
              </PrimaryButton>
            )}
            {step === 'approving' && (
              <TxStatus isPending={isApproving} isConfirming={!isApproving}
                        hash={approveHash} explorerUrl={explorerTx} successMsg="Allow confirmed" />
            )}
          </Card>
        </div>
      </div>
    </div>
  )
}
