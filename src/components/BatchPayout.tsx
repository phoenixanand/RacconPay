/**
 * BatchPayout page.
 *
 * Flow (≤100 rows): add rows → [blocklist check] → approve USDC → batchPay → receipt NFT minted.
 * Flow (>100 rows): CSV auto-splits into chunks of 100 → approve total → send each chunk sequentially.
 *
 * DECIMAL NOTE:
 *   All amounts are 6-decimal ERC-20 USDC.
 *   Arc native gas is 18-decimal — never used here.
 */

import { useState, useRef, useCallback } from 'react'
import {
  useAccount,
  useWriteContract,
  useWaitForTransactionReceipt,
  useReadContract,
  useReadContracts,
} from 'wagmi'
import { toast } from 'sonner'
import {
  Upload, Plus, Trash2, ExternalLink, CheckCircle2, Send,
  ArrowRight, Download, ShieldAlert, Layers,
} from 'lucide-react'
import Papa from 'papaparse'

import ChainGuard from './ChainGuard'
import SuccessAnimation from './SuccessAnimation'
import { USDC_ADDRESS, BATCH_PAYOUT_ADDRESS, ARC_CHAIN_ID, explorerTx } from '../constants'
import { ERC20_ABI, BATCH_PAYOUT_ABI } from '../abis'
import { parseUsdc, formatUsdc } from '../utils'
import { Card, Label, PrimaryButton, TxStatus, PageHeader, Badge, AlertBox } from './ui'

interface Row { addr: string; amount: string }
const emptyRow = (): Row => ({ addr: '', amount: '' })
const CHUNK_SIZE = 100

// Split an array into chunks of `size`
function chunkArray<T>(arr: T[], size: number): T[][] {
  const chunks: T[][] = []
  for (let i = 0; i < arr.length; i += size) chunks.push(arr.slice(i, i + size))
  return chunks
}

type Step = 'idle' | 'checking' | 'approving' | 'approved' | 'paying'

export default function BatchPayoutPage() {
  const [key, setKey] = useState(0)
  return <ChainGuard><Inner key={key} onReset={() => setKey(k => k + 1)} /></ChainGuard>
}

function Inner({ onReset }: { onReset: () => void }) {
  const { address } = useAccount()
  const [rows, setRows]               = useState<Row[]>([emptyRow()])
  const [errors, setErrors]           = useState<string[]>([])
  const [step, setStep]               = useState<Step>('idle')
  const [isDone, setIsDone]           = useState(false)
  const [showSuccess, setShowSuccess] = useState(false)
  const [receiptId, setReceiptId]     = useState<bigint | null>(null)

  // Chunking state
  const [chunks, setChunks]               = useState<{ addr: `0x${string}`; amount: bigint }[][]>([])
  const [currentChunk, setCurrentChunk]   = useState(0)
  const [chunkHashes, setChunkHashes]     = useState<string[]>([])
  const isChunked = chunks.length > 1

  // Blocklist state — set of lowercased blocked addresses found during pre-check
  const [blocklisted, setBlocklisted]     = useState<Set<string>>(new Set())
  const [checkDone, setCheckDone]         = useState(false)

  const fileRef = useRef<HTMLInputElement>(null)

  const { data: balance } = useReadContract({
    address: USDC_ADDRESS, abi: ERC20_ABI, functionName: 'balanceOf',
    args: [address!], chainId: ARC_CHAIN_ID, query: { enabled: !!address },
  })

  const { writeContract: writeApprove, data: approveHash, isPending: isApproving } = useWriteContract()
  const { isSuccess: approveConfirmed } = useWaitForTransactionReceipt({ hash: approveHash })
  const { writeContract: writeBatchPay, data: batchHash,   isPending: isPaying   } = useWriteContract()
  const { isSuccess: batchConfirmed, data: batchReceipt, isLoading: batchLoading } = useWaitForTransactionReceipt({ hash: batchHash })

  // ── Blocklist reads ────────────────────────────────────────────────
  const validAddrs = rows
    .map(r => r.addr.trim())
    .filter(a => /^0x[0-9a-fA-F]{40}$/.test(a) && a !== '0x0000000000000000000000000000000000000000')

  const blacklistContracts = validAddrs.map(addr => ({
    address: USDC_ADDRESS as `0x${string}`,
    abi: ERC20_ABI,
    functionName: 'isBlacklisted' as const,
    args: [addr as `0x${string}`],
    chainId: ARC_CHAIN_ID,
  }))

  const { refetch: refetchBlacklist } = useReadContracts({
    contracts: blacklistContracts,
    query: { enabled: false }, // manual trigger only
  })

  // ── State transitions ──────────────────────────────────────────────
  if (batchConfirmed && batchReceipt && batchHash && !isDone && !isChunked) {
    try {
      const log = batchReceipt.logs.find(l => l.address.toLowerCase() === BATCH_PAYOUT_ADDRESS.toLowerCase())
      if (log && log.data.length >= 194) {
        const tokenIdHex = log.data.slice(2 + 64 * 2, 2 + 64 * 3)
        setReceiptId(BigInt('0x' + tokenIdHex))
      }
    } catch { /* ignore */ }
    setIsDone(true)
    setShowSuccess(true)
  }

  // Chunked: when a chunk tx confirms, advance to next chunk or finish
  if (batchConfirmed && batchHash && isChunked && !isDone) {
    const newHashes = [...chunkHashes]
    if (!newHashes.includes(batchHash)) {
      newHashes.push(batchHash)
      setChunkHashes(newHashes)
      const next = currentChunk + 1
      if (next >= chunks.length) {
        setIsDone(true)
        setShowSuccess(true)
      } else {
        setCurrentChunk(next)
        setStep('approved') // ready to send next chunk
        toast.success(`Chunk ${currentChunk + 1}/${chunks.length} sent — confirm next chunk`)
      }
    }
  }

  if (approveConfirmed && step === 'approving') {
    setStep('approved')
    toast.success(isChunked
      ? `USDC approved — confirm chunk 1/${chunks.length}`
      : 'USDC allowed — confirm the batch send')
  }

  // ── Validation ────────────────────────────────────────────────────
  function validate() {
    const errs: string[] = []
    const parsed: { addr: `0x${string}`; amount: bigint }[] = []
    let total = 0n
    if (rows.length === 0) errs.push('Add at least one recipient.')
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
        if (newRows.length) {
          setRows(newRows)
          setErrors([])
          setBlocklisted(new Set())
          setCheckDone(false)
          if (newRows.length > CHUNK_SIZE) {
            toast.info(`${newRows.length} recipients detected — will split into ${Math.ceil(newRows.length / CHUNK_SIZE)} chunks of ${CHUNK_SIZE}`)
          }
        } else {
          toast.error('CSV had no valid rows (expected: address,amount)')
        }
      },
      error() { toast.error('Could not read CSV') },
    })
  }

  // ── Blocklist pre-check ───────────────────────────────────────────
  const handleCheck = useCallback(async () => {
    const { valid } = validate()
    if (!valid) return
    setStep('checking')
    try {
      const result = await refetchBlacklist()
      const blocked = new Set<string>()
      if (result.data) {
        result.data.forEach((r, i) => {
          if (r.status === 'success' && r.result === true) {
            blocked.add(validAddrs[i].toLowerCase())
          }
        })
      }
      setBlocklisted(blocked)
      setCheckDone(true)
      setStep('idle')
      if (blocked.size > 0) {
        toast.warning(`${blocked.size} address${blocked.size > 1 ? 'es are' : ' is'} USDC-blocklisted — remove them before continuing`)
      } else {
        toast.success('All addresses clear — no blocklisted recipients')
      }
    } catch {
      setStep('idle')
      toast.error('Blocklist check failed — proceeding without check')
      setCheckDone(true)
    }
  }, [refetchBlacklist, validAddrs]) // eslint-disable-line react-hooks/exhaustive-deps

  function removeBlocklisted() {
    setRows(r => r.filter(row => !blocklisted.has(row.addr.toLowerCase())))
    setBlocklisted(new Set())
    setCheckDone(false)
    setErrors([])
  }

  // ── Approve + Pay ─────────────────────────────────────────────────
  function handleApprove() {
    const { valid, parsed, total } = validate()
    if (!valid) return
    if (total === 0n) { toast.error('Total is zero'); return }
    if (blocklisted.size > 0) { toast.error('Remove blocklisted addresses first'); return }

    // Build chunks
    const built = chunkArray(parsed, CHUNK_SIZE)
    setChunks(built)
    setCurrentChunk(0)
    setChunkHashes([])

    setStep('approving')
    try {
      writeApprove({
        address: USDC_ADDRESS, abi: ERC20_ABI, functionName: 'approve',
        args: [BATCH_PAYOUT_ADDRESS, total], chainId: ARC_CHAIN_ID,
      })
    } catch (e: unknown) {
      setStep('idle')
      const msg = e instanceof Error ? e.message : String(e)
      toast.error(msg.includes('user rejected') ? 'Cancelled' : msg)
    }
  }

  function handleBatchPay() {
    const theChunks = isChunked ? chunks : chunks
    const chunk = theChunks[currentChunk]
    if (!chunk) return
    setStep('paying')
    try {
      writeBatchPay({
        address: BATCH_PAYOUT_ADDRESS, abi: BATCH_PAYOUT_ABI,
        functionName: 'batchPay', args: [chunk], chainId: ARC_CHAIN_ID,
      })
    } catch (e: unknown) {
      setStep('approved')
      const msg = e instanceof Error ? e.message : String(e)
      toast.error(msg.includes('user rejected') ? 'Cancelled' : msg)
    }
  }

  // ── Derived values ────────────────────────────────────────────────
  let displayTotal = '—'; let totalRaw = 0n
  try { totalRaw = rows.reduce((acc, r) => acc + parseUsdc(r.amount), 0n); displayTotal = formatUsdc(totalRaw) } catch { /* leave */ }

  const balanceFormatted     = balance ? formatUsdc(balance) : '—'
  const insufficientFunds    = balance !== undefined && totalRaw > 0n && balance < totalRaw
  const hasBlocklisted       = blocklisted.size > 0
  const needsCheck           = !checkDone && rows.some(r => /^0x[0-9a-fA-F]{40}$/.test(r.addr.trim()))
  const canApprove           = step === 'idle' && !hasBlocklisted
  const canPay               = step === 'approved'
  const isChecking           = step === 'checking'
  const numChunks            = Math.ceil(rows.length / CHUNK_SIZE)

  function downloadTemplate() {
    const csv = 'address,amount\n0xRecipientAddress1,10.00\n0xRecipientAddress2,25.50'
    const blob = new Blob([csv], { type: 'text/csv' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a'); a.href = url; a.download = 'racconpay-batch-template.csv'; a.click()
    URL.revokeObjectURL(url)
  }

  // ── Success animation overlay ──────────────────────────────────────
  if (showSuccess) {
    return (
      <>
        <SuccessAnimation
          show={showSuccess}
          label={isChunked ? `All ${chunks.length} chunks sent!` : 'Batch sent!'}
          sublabel={receiptId !== null ? `Receipt NFT #${receiptId} minted` : `${rows.length} recipients paid`}
          duration={2400}
          onDone={() => setShowSuccess(false)}
        />
        <div className="max-w-lg mx-auto opacity-0" />
      </>
    )
  }

  // ── Success screen ─────────────────────────────────────────────────
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
              {isChunked ? `All ${chunks.length} Chunks Sent!` : 'Batch Sent!'}
            </h2>
            {isChunked && (
              <p className="text-sm mt-1.5" style={{ color: 'var(--muted)' }}>
                {rows.length} recipients paid across {chunks.length} transactions.
              </p>
            )}
            {receiptId !== null && (
              <p className="text-sm mt-1.5" style={{ color: 'var(--muted)' }}>
                Receipt NFT <span className="font-mono font-semibold" style={{ color: 'var(--accent)' }}>#{receiptId.toString()}</span> minted to your wallet.
              </p>
            )}
          </div>
          {isChunked && chunkHashes.length > 0 && (
            <div className="w-full flex flex-col gap-1.5 text-left">
              {chunkHashes.map((h, i) => (
                <a key={h} href={explorerTx(h)} target="_blank" rel="noreferrer"
                   className="flex items-center gap-1.5 text-xs font-mono"
                   style={{ color: 'var(--accent)' }}>
                  <ExternalLink size={11} /> Chunk {i + 1}: {h.slice(0, 18)}…
                </a>
              ))}
            </div>
          )}
          <div className="flex gap-3">
            {!isChunked && batchHash && (
              <a href={explorerTx(batchHash)} target="_blank" rel="noreferrer"
                 className="flex items-center gap-1.5 text-sm" style={{ color: 'var(--accent)' }}>
                <ExternalLink size={14} /> View on explorer
              </a>
            )}
            <button onClick={onReset}
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
      <PageHeader icon={Send} title="Batch Payout" subtitle="Send USDC to multiple addresses in one transaction." />

      {/* Chunking notice */}
      {rows.length > CHUNK_SIZE && (
        <div className="flex items-start gap-3 rounded-xl px-4 py-3 text-sm"
             style={{ background: 'rgba(var(--accent-rgb,245,158,11),0.08)', border: '1px solid rgba(245,158,11,0.25)', color: 'var(--ink-2)' }}>
          <Layers size={16} className="shrink-0 mt-0.5" style={{ color: 'var(--accent)' }} />
          <span>
            <strong>{rows.length} recipients</strong> detected — this will be split into{' '}
            <strong>{numChunks} transactions</strong> of up to {CHUNK_SIZE} each.
            You'll approve the total once, then confirm each chunk separately.
          </span>
        </div>
      )}

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
              <span className="text-xs" style={{ color: 'var(--subtle)' }}>Format: address,amount — no limit on rows</span>
              <input ref={fileRef} type="file" accept=".csv,text/csv" className="hidden"
                     onChange={e => { const f = e.target.files?.[0]; if (f) loadCsv(f) }} />
            </button>
            <button onClick={downloadTemplate}
              className="flex items-center gap-1.5 text-xs self-end transition-colors hover:opacity-80"
              style={{ color: 'var(--subtle)' }}>
              <Download size={12} /> Download CSV template
            </button>
          </div>

          {/* Blocklisted warning banner */}
          {hasBlocklisted && (
            <div className="rounded-xl px-4 py-3 text-sm flex flex-col gap-2"
                 style={{ background: 'rgba(232,109,122,0.08)', border: '1px solid rgba(232,109,122,0.3)', color: 'var(--danger)' }}>
              <div className="flex items-center gap-2 font-semibold">
                <ShieldAlert size={15} /> {blocklisted.size} USDC-blocklisted address{blocklisted.size > 1 ? 'es' : ''} found
              </div>
              <p className="text-xs opacity-80">These addresses cannot receive USDC. Remove them to continue.</p>
              <div className="flex flex-col gap-1">
                {[...blocklisted].map(addr => (
                  <span key={addr} className="font-mono text-xs opacity-70">{addr.slice(0,10)}…{addr.slice(-8)}</span>
                ))}
              </div>
              <button onClick={removeBlocklisted}
                      className="self-start mt-1 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all hover:opacity-80"
                      style={{ background: 'rgba(232,109,122,0.2)', color: 'var(--danger)', border: '1px solid rgba(232,109,122,0.3)' }}>
                Remove {blocklisted.size} blocked address{blocklisted.size > 1 ? 'es' : ''}
              </button>
            </div>
          )}

          {/* Recipient rows */}
          <Card className="overflow-hidden">
            <div className="hidden sm:grid grid-cols-[1fr_140px_36px] gap-2 px-4 py-2.5 border-b border-[var(--border)]">
              <Label>Recipient address</Label>
              <Label>USDC amount</Label>
              <span />
            </div>

            <div className="divide-y divide-[var(--border)] max-h-[480px] overflow-y-auto">
              {rows.map((row, i) => {
                const isBlocked = blocklisted.has(row.addr.toLowerCase())
                return (
                  <div key={i}
                       className="px-4 py-3 flex flex-col sm:grid sm:grid-cols-[1fr_140px_36px] gap-2 sm:items-center"
                       style={isBlocked ? { background: 'rgba(232,109,122,0.06)' } : undefined}>
                    <div className="flex flex-col gap-1 sm:contents">
                      <span className="sm:hidden text-[10px] font-semibold uppercase tracking-wider" style={{ color: 'var(--subtle)' }}>Address</span>
                      <div className="flex items-center gap-1.5">
                        {isBlocked && <ShieldAlert size={12} style={{ color: 'var(--danger)', flexShrink: 0 }} />}
                        <input
                          className="font-mono text-xs w-full rounded-lg px-2.5 py-2 outline-none transition-all placeholder:text-[var(--subtle)]"
                          style={{
                            background: 'var(--surface-muted)',
                            color: isBlocked ? 'var(--danger)' : 'var(--ink)',
                            border: `1px solid ${isBlocked ? 'rgba(232,109,122,0.5)' : 'var(--border)'}`,
                          }}
                          placeholder="0x…"
                          value={row.addr}
                          onChange={e => updateRow(i, 'addr', e.target.value)}
                        />
                      </div>
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
                        />
                      </div>
                      <button onClick={() => removeRow(i)} className="p-2 rounded-lg transition-colors hover:bg-[var(--danger-muted)] shrink-0"
                              style={{ color: 'var(--subtle)' }} aria-label="Remove row">
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </div>
                )
              })}
            </div>

            <div className="px-4 py-2.5 border-t border-[var(--border)]">
              <button onClick={addRow}
                      className="flex items-center gap-1.5 text-sm font-medium transition-colors"
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
                {rows.length > CHUNK_SIZE && <span style={{ color: 'var(--accent)' }}> · {numChunks} chunks</span>}
              </p>
            </div>

            {/* Chunk progress (visible during chunked flow) */}
            {isChunked && step !== 'idle' && (
              <div className="flex flex-col gap-2">
                <Label>Chunk progress</Label>
                <div className="flex gap-1.5 flex-wrap">
                  {chunks.map((_, i) => (
                    <div key={i}
                         className="flex items-center justify-center w-7 h-7 rounded-lg text-xs font-bold"
                         style={{
                           background: i < currentChunk || isDone
                             ? 'var(--success-muted)'
                             : i === currentChunk
                               ? 'var(--accent-muted, rgba(245,158,11,0.15))'
                               : 'var(--surface-strong)',
                           color: i < currentChunk || isDone
                             ? 'var(--success)'
                             : i === currentChunk
                               ? 'var(--accent)'
                               : 'var(--subtle)',
                           border: `1px solid ${i === currentChunk ? 'rgba(245,158,11,0.4)' : 'var(--border)'}`,
                         }}>
                      {i < currentChunk || isDone ? '✓' : i + 1}
                    </div>
                  ))}
                </div>
                <p className="text-xs" style={{ color: 'var(--subtle)' }}>
                  {isDone
                    ? 'All chunks complete'
                    : `Chunk ${currentChunk + 1} of ${chunks.length} — ${chunks[currentChunk]?.length ?? 0} recipients`}
                </p>
              </div>
            )}

            {/* Steps */}
            <div className="flex flex-col gap-2.5 mt-1">
              <div className="flex items-center gap-2 text-xs" style={{ color: 'var(--subtle)' }}>
                <span className="w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold shrink-0"
                      style={{
                        background: checkDone ? 'var(--success-muted)' : 'var(--surface-strong)',
                        color: checkDone ? 'var(--success)' : 'var(--subtle)',
                        border: `1px solid ${checkDone ? 'rgba(94,207,138,0.3)' : 'var(--border)'}`,
                      }}>
                  {checkDone ? '✓' : '1'}
                </span>
                Blocklist check
                <span className="ml-auto">
                  <Badge variant={checkDone && !hasBlocklisted ? 'success' : hasBlocklisted ? 'danger' : 'default'}>
                    {isChecking ? 'Checking…' : checkDone && !hasBlocklisted ? 'Clear' : hasBlocklisted ? 'Blocked' : 'Recommended'}
                  </Badge>
                </span>
              </div>
              <div className="flex items-center gap-2 text-xs" style={{ color: 'var(--subtle)' }}>
                <span className="w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold shrink-0"
                      style={{
                        background: step !== 'idle' && step !== 'checking' ? 'var(--success-muted)' : 'var(--surface-strong)',
                        color: step !== 'idle' && step !== 'checking' ? 'var(--success)' : 'var(--subtle)',
                        border: `1px solid ${step !== 'idle' && step !== 'checking' ? 'rgba(94,207,138,0.3)' : 'var(--border)'}`,
                      }}>
                  {step !== 'idle' && step !== 'checking' ? '✓' : '2'}
                </span>
                Allow USDC spend
                <span className="ml-auto">
                  <Badge variant={step !== 'idle' && step !== 'checking' ? 'success' : 'default'}>
                    {step === 'approving' ? 'Pending' : step !== 'idle' && step !== 'checking' ? 'Done' : 'Required'}
                  </Badge>
                </span>
              </div>
              <div className="flex items-center gap-2 text-xs" style={{ color: 'var(--subtle)' }}>
                <span className="w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold shrink-0"
                      style={{
                        background: isDone ? 'var(--success-muted)' : 'var(--surface-strong)',
                        color: isDone ? 'var(--success)' : 'var(--subtle)',
                        border: `1px solid ${isDone ? 'rgba(94,207,138,0.3)' : 'var(--border)'}`,
                      }}>
                  {isDone ? '✓' : '3'}
                </span>
                {isChunked ? `Send ${numChunks} chunks` : 'Send batch'}
              </div>
            </div>

            {/* Warnings */}
            {insufficientFunds && (
              <AlertBox variant="danger">
                You need {displayTotal} USDC but have {balanceFormatted}. Get USDC on Arc first.
              </AlertBox>
            )}
            {needsCheck && !hasBlocklisted && !checkDone && (
              <AlertBox variant="warning">
                Run a blocklist check to catch any USDC-blocked addresses before approving.
              </AlertBox>
            )}

            {/* CTAs */}
            {step === 'idle' && (
              <button
                onClick={() => { void handleCheck() }}
                disabled={isChecking || insufficientFunds}
                className="w-full flex items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold transition-all disabled:opacity-40 hover:opacity-80"
                style={{ background: 'var(--surface-strong)', color: 'var(--ink-2)', border: '1px solid var(--border-strong)' }}>
                <ShieldAlert size={14} />
                {isChecking ? 'Checking…' : checkDone ? 'Re-check blocklist' : 'Check blocklist'}
              </button>
            )}
            {canApprove && (
              <PrimaryButton onClick={handleApprove} loading={isApproving} disabled={insufficientFunds}>
                {isApproving ? 'Waiting for wallet…' : rows.length > CHUNK_SIZE ? `Allow USDC (${numChunks} chunks)` : 'Allow USDC'}
              </PrimaryButton>
            )}
            {step === 'approving' && (
              <TxStatus isPending={isApproving} isConfirming={!isApproving}
                        hash={approveHash} explorerUrl={explorerTx} successMsg="Allow confirmed" />
            )}
            {canPay && (
              <PrimaryButton onClick={handleBatchPay} loading={isPaying || batchLoading}>
                {isPaying ? 'Waiting for wallet…'
                  : batchLoading ? 'Confirming…'
                  : isChunked ? `Send chunk ${currentChunk + 1}/${chunks.length}`
                  : 'Send Batch'}
              </PrimaryButton>
            )}
          </Card>
        </div>
      </div>
    </div>
  )
}