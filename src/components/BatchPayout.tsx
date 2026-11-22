/**
 * BatchPayout page.
 *
 * Flow (≤100 rows): add rows → [blocklist check] → approve USDC → batchPay → receipt NFT minted.
 * Flow (>100 rows): CSV auto-splits into chunks of 100 → approve total → send each chunk sequentially.
 *
 * DECIMAL NOTE:
 *   All amounts are 6-decimal ERC-20 USDC.
 *   Arc native gas is 18-decimal, never used here.
 */

import { useState, useRef, useCallback } from 'react'
import {
  useAccount,
  useBalance,
  useWriteContract,
  useWaitForTransactionReceipt,
  useReadContract,
  useReadContracts,
} from 'wagmi'
import { formatEther } from 'viem'
import { toast } from 'sonner'
import { Link, useSearchParams } from 'react-router-dom'
import {
  Upload, Plus, Trash2, ExternalLink, CheckCircle2, Send,
  ArrowRight, Download, ShieldAlert, AlertTriangle, ShieldCheck,
} from 'lucide-react'
import Papa from 'papaparse'

import ChainGuard from './ChainGuard'
import SuccessAnimation from './SuccessAnimation'
import { USDC_ADDRESS, BATCH_PAYOUT_ADDRESS, ARC_CHAIN_ID, explorerTx } from '../constants'
import { ERC20_ABI, BATCH_PAYOUT_ABI } from '../abis'
import { parseUsdc, formatUsdc } from '../utils'
import { Card, PrimaryButton, GhostButton, TxStatus, PageHeader, Badge, AlertBox } from './ui'
import { Stepper } from './kit/Stepper'
import { useFeeEstimate } from '../lib/fee'
import { useRecordTx } from '../lib/txlog'
import { friendlyTxError } from '../lib/txError'
import ApprovalChoice, { checkCoSigners, type PayoutMode } from './payout/ApprovalChoice'
import { useProposeRequest, type ProposeRecipient } from './payout/useProposeRequest'
import { ApprovalsPanel } from './MultiSigPayoutPage'

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
const STEPS = ['Upload', 'Validate', 'Review', 'Approve', 'Execute', 'Receipt']

type Tab = 'new' | 'approvals'

export default function BatchPayoutPage() {
  const [key, setKey] = useState(0)
  const [params, setParams] = useSearchParams()
  const { address } = useAccount()
  // A shared approval link (?proposal=) always opens the Approvals tab.
  const tab: Tab = params.get('tab') === 'approvals' || params.get('proposal') ? 'approvals' : 'new'
  const setTab = (t: Tab) => {
    const next = new URLSearchParams(params)
    if (t === 'new') { next.delete('tab'); next.delete('proposal') } else next.set('tab', t)
    setParams(next, { replace: true })
  }
  const tabs: [Tab, string][] = [['new', 'New payout'], ['approvals', 'Approvals']]
  return (
    <ChainGuard>
      <div className="flex flex-col gap-5">
        <div role="tablist" aria-label="Payouts" className="flex items-center gap-1 overflow-x-auto no-scrollbar" style={{ borderBottom: '1px solid var(--border)' }}>
          {tabs.map(([id, label]) => (
            <button key={id} role="tab" aria-selected={tab === id} onClick={() => setTab(id)}
              className="px-4 min-h-[44px] text-sm font-medium whitespace-nowrap -mb-px transition-colors"
              style={{ color: tab === id ? 'var(--accent)' : 'var(--muted)', borderBottom: `2px solid ${tab === id ? 'var(--accent)' : 'transparent'}` }}>
              {label}
            </button>
          ))}
        </div>
        {tab === 'new' && <Inner key={key} onReset={() => setKey(k => k + 1)} onOpenApprovals={() => setTab('approvals')} />}
        {tab === 'approvals' && <ApprovalsPanel connectedAddr={address ?? ''} />}
      </div>
    </ChainGuard>
  )
}

function Inner({ onReset, onOpenApprovals }: { onReset: () => void; onOpenApprovals: () => void }) {
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

  // Blocklist state, set of lowercased blocked addresses found during pre-check
  const [blocklisted, setBlocklisted]     = useState<Set<string>>(new Set())
  const [checkDone, setCheckDone]         = useState(false)

  // Release method: pay straight away, or create an approval request for two co-signers first.
  const [mode, setMode]               = useState<PayoutMode>('now')
  const [coSigner1, setCoSigner1]     = useState('')
  const [coSigner2, setCoSigner2]     = useState('')
  const [description, setDescription] = useState('')
  const proposeRecs: ProposeRecipient[] = []
  let proposeTotal = 0n
  for (const r of rows) {
    const a = r.addr.trim()
    try {
      const amt = parseUsdc(r.amount)
      if (/^0x[0-9a-fA-F]{40}$/.test(a) && amt > 0n) { proposeRecs.push({ addr: a as `0x${string}`, amount: amt }); proposeTotal += amt }
    } catch { /* an unfinished amount is simply skipped */ }
  }
  const propose = useProposeRequest(proposeTotal)

  const fileRef = useRef<HTMLInputElement>(null)

  const { data: balance } = useReadContract({
    address: USDC_ADDRESS, abi: ERC20_ABI, functionName: 'balanceOf',
    args: [address!], chainId: ARC_CHAIN_ID, query: { enabled: !!address },
  })

  const { writeContract: writeApprove, data: approveHash, isPending: isApproving, error: approveError } = useWriteContract()
  const { isSuccess: approveConfirmed } = useWaitForTransactionReceipt({ hash: approveHash })
  const { writeContract: writeBatchPay, data: batchHash,   isPending: isPaying, error: payError } = useWriteContract()
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

  // ── Display-only helpers: gas balance, fee estimates, local record ──
  const { data: gasBalance } = useBalance({ address, chainId: ARC_CHAIN_ID, query: { enabled: !!address } })
  let previewTotal = 0n
  try { previewTotal = rows.reduce((acc, r) => acc + (r.amount ? parseUsdc(r.amount) : 0n), 0n) } catch { previewTotal = 0n }
  const approveFee = useFeeEstimate(address && previewTotal > 0n
    ? { address: USDC_ADDRESS, abi: ERC20_ABI, functionName: 'approve', args: [BATCH_PAYOUT_ADDRESS, previewTotal], account: address }
    : undefined)
  // The send estimate needs the allowance in place, so it only runs once the approval is confirmed.
  const sendFee = useFeeEstimate(address && step === 'approved' && chunks[currentChunk]
    ? { address: BATCH_PAYOUT_ADDRESS, abi: BATCH_PAYOUT_ABI, functionName: 'batchPay', args: [chunks[currentChunk]], account: address }
    : undefined)
  useRecordTx({ address, hash: batchHash, confirmed: batchConfirmed, kind: 'Batch payout', detail: isChunked ? `Chunk ${currentChunk + 1} of ${chunks.length}` : `${rows.length} recipient${rows.length === 1 ? '' : 's'}` })

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
        toast.success(`Chunk ${currentChunk + 1}/${chunks.length} sent, confirm next chunk`)
      }
    }
  }

  if (approveConfirmed && step === 'approving') {
    setStep('approved')
    toast.success(isChunked
      ? `USDC approved, confirm chunk 1/${chunks.length}`
      : 'USDC allowed, confirm the batch send')
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
            toast.info(`${newRows.length} recipients detected, will split into ${Math.ceil(newRows.length / CHUNK_SIZE)} chunks of ${CHUNK_SIZE}`)
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
        toast.warning(`${blocked.size} address${blocked.size > 1 ? 'es are' : ' is'} USDC-blocklisted, remove them before continuing`)
      } else {
        toast.success('All addresses clear, no blocklisted recipients')
      }
    } catch {
      setStep('idle')
      toast.error('Blocklist check failed, proceeding without check')
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
  let displayTotal = '0'; let totalRaw = 0n
  try { totalRaw = rows.reduce((acc, r) => acc + parseUsdc(r.amount), 0n); displayTotal = formatUsdc(totalRaw) } catch { /* leave */ }

  const balanceFormatted     = balance ? formatUsdc(balance) : '-'
  // The balance is only needed up front when paying now. An approval request moves no USDC until it is executed.
  const insufficientFunds    = mode === 'now' && balance !== undefined && totalRaw > 0n && balance < totalRaw
  const hasBlocklisted       = blocklisted.size > 0
  const needsCheck           = !checkDone && rows.some(r => /^0x[0-9a-fA-F]{40}$/.test(r.addr.trim()))
  const canApprove           = step === 'idle' && !hasBlocklisted && mode === 'now'
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

  // ── Display-only derived state for the new layout ──────────────────
  const rowIssues = rows.map((r, i) => {
    const addr = r.addr.trim()
    if (addr && !/^0x[0-9a-fA-F]{40}$/.test(addr)) return 'Not a valid wallet address'
    if (addr === '0x0000000000000000000000000000000000000000') return 'The zero address cannot be paid'
    if (addr) {
      const first = rows.findIndex(o => o.addr.trim().toLowerCase() === addr.toLowerCase())
      if (first !== -1 && first < i) return `Duplicate of row ${first + 1}`
    }
    if (r.amount.trim()) {
      try { if (parseUsdc(r.amount) === 0n) return 'Amount must be above zero' } catch { return 'Not a valid USDC amount' }
    }
    return ''
  })
  const issueCount = rowIssues.filter(Boolean).length
  const approvalMode = mode === 'approval'
  const coCheck = checkCoSigners(coSigner1, coSigner2, address)
  const tooMany = rows.length > CHUNK_SIZE
  const requestBusy = propose.signing || propose.confirming
  const canRequest = approvalMode && coCheck.valid && description.trim().length > 0 && proposeRecs.length > 0 &&
    issueCount === 0 && !tooMany && !hasBlocklisted && !requestBusy
  const requestHint = !approvalMode ? '' : tooMany ? 'Split the file to 100 recipients or fewer.' : issueCount > 0 ? 'Fix the highlighted rows first.'
    : proposeRecs.length === 0 ? 'Add at least one recipient with an amount.' : !coCheck.valid ? 'Enter two valid, different co-signers.'
    : !description.trim() ? 'Add a description.' : hasBlocklisted ? 'Remove the blocked addresses first.' : ''
  const handleRequest = () => { void propose.submit(proposeRecs, coSigner1 as `0x${string}`, coSigner2 as `0x${string}`, description.trim()) }
  const hasContent = rows.some(r => r.addr.trim() || r.amount.trim())
  const stepIndex = approvalMode
    ? (propose.confirmed ? 5 : requestBusy ? 3 : checkDone ? 2 : hasContent ? 1 : 0)
    : isDone ? 5 : (step === 'paying' || step === 'approved') ? 4 : step === 'approving' ? 3 : checkDone ? 2 : hasContent ? 1 : 0
  const fmtFee = (v: bigint) => `${Number(formatEther(v)).toLocaleString(undefined, { maximumFractionDigits: 6 })} USDC`
  const feeNeeded = sendFee.data ?? approveFee.data ?? undefined
  const lowGas = mode === 'now' && gasBalance !== undefined && feeNeeded !== undefined && feeNeeded !== null && gasBalance.value < feeNeeded
  const inputStyle = (bad: boolean) => ({
    background: 'var(--surface)', color: 'var(--ink)', border: `1px solid ${bad ? 'var(--danger)' : 'var(--border-strong)'}`,
  })

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

  // ── Approval request created ───────────────────────────────────────
  if (propose.confirmed) {
    return (
      <div className="flex flex-col gap-5 max-w-xl">
        <PageHeader icon={ShieldCheck} title="Approval request created" subtitle="Your co-signers can now approve it." />
        <Card className="p-5 flex flex-col gap-4">
          <p className="text-sm" style={{ color: 'var(--ink-2)' }}>
            {proposeRecs.length} recipient{proposeRecs.length === 1 ? '' : 's'}, {formatUsdc(proposeTotal)} USDC. Nothing has been paid yet. Once both co-signers approve,
            come back to the Approvals tab to approve the USDC and execute the payout.
          </p>
          <div className="flex flex-col sm:flex-row gap-3">
            {propose.hash && (
              <a href={explorerTx(propose.hash)} target="_blank" rel="noreferrer" className="min-h-[44px] flex items-center justify-center gap-1.5 px-4 rounded-lg text-sm font-medium hover:bg-[var(--surface-hover)]" style={{ color: 'var(--accent)', border: '1px solid var(--border-strong)' }}>
                <ExternalLink size={14} aria-hidden="true" /> View on explorer
              </a>
            )}
            <button onClick={onOpenApprovals} className="min-h-[44px] flex items-center justify-center gap-1.5 px-4 rounded-lg text-sm font-semibold" style={{ background: 'var(--accent)', color: 'var(--on-accent)' }}>
              Open Approvals <ArrowRight size={14} aria-hidden="true" />
            </button>
            <button onClick={onReset} className="min-h-[44px] flex items-center justify-center px-4 rounded-lg text-sm font-medium hover:bg-[var(--surface-hover)]" style={{ color: 'var(--ink-2)', border: '1px solid var(--border-strong)' }}>
              New payout
            </button>
          </div>
        </Card>
      </div>
    )
  }

  // ── Receipt screen ─────────────────────────────────────────────────
  if (isDone) {
    return (
      <div className="flex flex-col gap-5 max-w-xl">
        <PageHeader icon={Send} title="Batch payout" subtitle="Send USDC to many wallets in one transaction." />
        <Stepper steps={STEPS} current={5} />
        <Card className="p-6 flex flex-col gap-5">
          <div className="flex items-center gap-3">
            <span className="w-11 h-11 rounded-full flex items-center justify-center" style={{ background: 'var(--success-muted)' }}>
              <CheckCircle2 size={22} style={{ color: 'var(--success)' }} aria-hidden="true" />
            </span>
            <div>
              <h2 className="text-lg font-semibold" style={{ color: 'var(--ink)' }}>{isChunked ? `All ${chunks.length} chunks confirmed` : 'Payment confirmed'}</h2>
              <p className="text-sm" style={{ color: 'var(--muted)' }}>Confirmed on Arc Mainnet.</p>
            </div>
          </div>
          <dl className="flex flex-col">
            {[
              ['Recipients', `${rows.length}`],
              ['Total sent', `${displayTotal} USDC`],
              ...(receiptId !== null ? [['Receipt NFT', `#${receiptId.toString()}`]] : []),
              ...(isChunked ? [['Transactions', `${chunks.length}`]] : []),
            ].map(([k, v]) => (
              <div key={k} className="flex items-center justify-between py-2.5 text-sm" style={{ borderBottom: '1px solid var(--border)' }}>
                <dt style={{ color: 'var(--muted)' }}>{k}</dt>
                <dd className="font-medium tabular-nums" style={{ color: 'var(--ink)' }}>{v}</dd>
              </div>
            ))}
          </dl>
          {isChunked && chunkHashes.length > 0 && (
            <div className="flex flex-col gap-1.5">
              {chunkHashes.map((h, i) => (
                <a key={h} href={explorerTx(h)} target="_blank" rel="noreferrer" className="flex items-center gap-1.5 text-xs font-mono hover:underline" style={{ color: 'var(--accent)' }}>
                  <ExternalLink size={12} aria-hidden="true" /> Chunk {i + 1}: {h.slice(0, 18)}…
                </a>
              ))}
            </div>
          )}
          <div className="flex flex-col sm:flex-row gap-3">
            {!isChunked && batchHash && (
              <a href={explorerTx(batchHash)} target="_blank" rel="noreferrer" className="min-h-[44px] flex items-center justify-center gap-1.5 px-4 rounded-lg text-sm font-medium hover:bg-[var(--surface-hover)]" style={{ color: 'var(--accent)', border: '1px solid var(--border-strong)' }}>
                <ExternalLink size={14} aria-hidden="true" /> View on explorer
              </a>
            )}
            <Link to="/dashboard?tab=receipts" className="min-h-[44px] flex items-center justify-center gap-1.5 px-4 rounded-lg text-sm font-medium hover:bg-[var(--surface-hover)]" style={{ color: 'var(--ink-2)', border: '1px solid var(--border-strong)' }}>
              View receipts
            </Link>
            <button onClick={onReset} className="min-h-[44px] flex items-center justify-center gap-1.5 px-4 rounded-lg text-sm font-semibold" style={{ background: 'var(--accent)', color: 'var(--on-accent)' }}>
              New batch <ArrowRight size={14} aria-hidden="true" />
            </button>
          </div>
        </Card>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-5">
      <PageHeader icon={Send} title="Payouts" subtitle="Pay many wallets in USDC, straight away or after two co-signers approve. Files above 100 rows are split when you send now." />

      <Card className="px-4 py-3">
        <Stepper steps={approvalMode ? ['Upload', 'Validate', 'Review', 'Request', 'Approve', 'Done'] : STEPS} current={stepIndex} failed={!!(approveError && step === 'approving') || !!(payError && step === 'paying') || !!propose.error} />
      </Card>

      {rows.length > CHUNK_SIZE && !approvalMode && (
        <AlertBox variant="info">
          <strong>{rows.length} recipients</strong> will be split into <strong>{numChunks} transactions</strong> of up to {CHUNK_SIZE} each. You approve the total once, then confirm each chunk separately.
        </AlertBox>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-[1fr_340px] gap-5 items-start">
        {/* Recipients */}
        <div className="flex flex-col gap-4 min-w-0">
          <Card className="p-4 flex flex-col gap-3">
            <div className="flex items-center justify-between gap-3">
              <h2 className="text-sm font-semibold" style={{ color: 'var(--ink)' }}>1. Upload recipients</h2>
              <button onClick={downloadTemplate} className="min-h-[36px] flex items-center gap-1.5 text-xs font-medium hover:underline" style={{ color: 'var(--accent)' }}>
                <Download size={13} aria-hidden="true" /> CSV template
              </button>
            </div>
            <button
              type="button"
              onClick={() => fileRef.current?.click()}
              onDragOver={e => e.preventDefault()}
              onDrop={e => { e.preventDefault(); const f = e.dataTransfer.files[0]; if (f) loadCsv(f) }}
              className="w-full flex flex-col items-center gap-1.5 rounded-lg py-6 px-3 text-center transition-colors hover:bg-[var(--surface-hover)]"
              style={{ border: '1.5px dashed var(--border-strong)' }}
            >
              <Upload size={20} style={{ color: 'var(--muted)' }} aria-hidden="true" />
              <span className="text-sm font-medium" style={{ color: 'var(--ink)' }}>Drop a CSV here, or choose a file</span>
              <span className="text-xs" style={{ color: 'var(--muted)' }}>Two columns: wallet address, USDC amount. No row limit.</span>
              <input ref={fileRef} type="file" accept=".csv,text/csv" className="hidden" aria-label="Upload CSV file"
                     onChange={e => { const f = e.target.files?.[0]; if (f) loadCsv(f) }} />
            </button>
          </Card>

          {hasBlocklisted && (
            <div role="alert" className="rounded-lg px-4 py-3 text-sm flex flex-col gap-2" style={{ background: 'var(--danger-muted)', border: '1px solid var(--border-strong)', color: 'var(--danger)' }}>
              <div className="flex items-center gap-2 font-semibold">
                <ShieldAlert size={16} aria-hidden="true" /> {blocklisted.size} blocked address{blocklisted.size > 1 ? 'es' : ''} found
              </div>
              <p className="text-xs">These addresses cannot receive USDC. Remove them to continue.</p>
              <div className="flex flex-col gap-1">
                {[...blocklisted].map(addr => <span key={addr} className="font-mono text-xs">{addr.slice(0, 10)}…{addr.slice(-8)}</span>)}
              </div>
              <button onClick={removeBlocklisted} className="self-start min-h-[40px] px-3 rounded-lg text-xs font-semibold" style={{ background: 'var(--surface)', color: 'var(--danger)', border: '1px solid var(--danger)' }}>
                Remove {blocklisted.size} blocked address{blocklisted.size > 1 ? 'es' : ''}
              </button>
            </div>
          )}

          <Card className="overflow-hidden">
            <div className="flex items-center justify-between gap-3 px-4 py-3" style={{ borderBottom: '1px solid var(--border)' }}>
              <h2 className="text-sm font-semibold" style={{ color: 'var(--ink)' }}>2. Review recipients</h2>
              <span className="text-xs tabular-nums" style={{ color: issueCount ? 'var(--danger)' : 'var(--muted)' }} role="status">
                {rows.length} row{rows.length === 1 ? '' : 's'}{issueCount ? ` · ${issueCount} to fix` : ''}
              </span>
            </div>
            <div className="hidden sm:grid grid-cols-[1fr_150px_44px] gap-2 px-4 py-2 text-xs font-medium" style={{ color: 'var(--muted)', borderBottom: '1px solid var(--border)' }}>
              <span>Wallet address</span><span>USDC amount</span><span className="sr-only">Remove</span>
            </div>
            <ul className="max-h-[480px] overflow-y-auto">
              {rows.map((row, i) => {
                const isBlocked = blocklisted.has(row.addr.toLowerCase())
                const issue = isBlocked ? 'Blocked from receiving USDC' : rowIssues[i]
                return (
                  <li key={i} className="px-4 py-3 flex flex-col gap-1.5" style={{ borderBottom: '1px solid var(--border)', background: issue ? 'var(--danger-muted)' : undefined }}>
                    <div className="grid grid-cols-[1fr_44px] sm:grid-cols-[1fr_150px_44px] gap-2 items-start">
                      <input
                        className="font-mono text-xs w-full min-h-[44px] rounded-lg px-3 outline-none focus:border-[var(--accent)] focus:ring-2 focus:ring-[var(--accent-glow)] placeholder:text-[var(--subtle)] col-span-2 sm:col-span-1"
                        style={inputStyle(!!issue)} placeholder="0x…" aria-label={`Wallet address, row ${i + 1}`} aria-invalid={!!issue}
                        value={row.addr} onChange={e => updateRow(i, 'addr', e.target.value)}
                      />
                      <input
                        className="text-sm tabular-nums w-full min-h-[44px] rounded-lg px-3 outline-none focus:border-[var(--accent)] focus:ring-2 focus:ring-[var(--accent-glow)] placeholder:text-[var(--subtle)]"
                        style={inputStyle(!!issue)} placeholder="0.00" inputMode="decimal" aria-label={`USDC amount, row ${i + 1}`}
                        value={row.amount} onChange={e => updateRow(i, 'amount', e.target.value)}
                      />
                      <button onClick={() => removeRow(i)} className="w-11 h-11 rounded-lg flex items-center justify-center hover:bg-[var(--danger-muted)]" style={{ color: 'var(--muted)' }} aria-label={`Remove row ${i + 1}`}>
                        <Trash2 size={16} aria-hidden="true" />
                      </button>
                    </div>
                    {issue && <p className="flex items-center gap-1.5 text-xs" style={{ color: 'var(--danger)' }}><AlertTriangle size={12} aria-hidden="true" />{issue}</p>}
                  </li>
                )
              })}
            </ul>
            <div className="px-4 py-2.5">
              <button onClick={addRow} className="min-h-[40px] flex items-center gap-1.5 text-sm font-medium hover:underline" style={{ color: 'var(--accent)' }}>
                <Plus size={15} aria-hidden="true" /> Add recipient
              </button>
            </div>
          </Card>

          {errors.length > 0 && (
            <AlertBox variant="danger">
              <span className="flex flex-col gap-0.5">{errors.map((e, i) => <span key={i}>{e}</span>)}</span>
            </AlertBox>
          )}

          <ApprovalChoice
            mode={mode} onMode={setMode} me={address}
            coSigner1={coSigner1} coSigner2={coSigner2} description={description}
            onCoSigner1={setCoSigner1} onCoSigner2={setCoSigner2} onDescription={setDescription}
            tooMany={tooMany} disabled={requestBusy || step !== 'idle'}
          />

        </div>

        {/* Summary and actions */}
        <div className="flex flex-col gap-4 lg:sticky lg:top-24">
          <Card className="p-5 flex flex-col gap-4">
            <h2 className="text-sm font-semibold" style={{ color: 'var(--ink)' }}>Payment summary</h2>
            <div>
              <p className="text-xs font-medium" style={{ color: 'var(--muted)' }}>Total to send</p>
              <p className="text-3xl font-semibold tabular-nums tracking-tight mt-1" style={{ color: 'var(--ink)' }}>
                {displayTotal}<span className="text-base font-medium ml-1.5" style={{ color: 'var(--muted)' }}>USDC</span>
              </p>
            </div>
            <dl className="flex flex-col text-sm">
              {([
                ['Recipients', `${rows.length}${rows.length > CHUNK_SIZE ? ` · ${numChunks} transactions` : ''}`],
                ['Your USDC balance', `${balanceFormatted} USDC`],
                ...(approvalMode ? [
                  ['Release', 'After two co-signers approve'],
                  ['Network fee', 'Shown by your wallet when you sign'],
                ] as [string, string][] : [
                ['Network fee (allow USDC)', approveFee.data ? `≈ ${fmtFee(approveFee.data)}` : totalRaw === 0n ? '0 USDC' : approveFee.isLoading ? 'Estimating…' : '-'],
                ['Network fee (send)', sendFee.data ? `≈ ${fmtFee(sendFee.data)}` : totalRaw === 0n ? '0 USDC' : step === 'approved' && sendFee.isLoading ? 'Estimating…' : 'Shown after approval'],
                ] as [string, string][]),
              ] as [string, string][]).map(([k, v]) => (
                <div key={k} className="flex items-center justify-between gap-3 py-2" style={{ borderTop: '1px solid var(--border)' }}>
                  <dt style={{ color: 'var(--muted)' }}>{k}</dt>
                  <dd className="font-medium tabular-nums text-right" style={{ color: 'var(--ink)' }}>{v}</dd>
                </div>
              ))}
            </dl>

            {isChunked && step !== 'idle' && (
              <p className="text-xs" role="status" style={{ color: 'var(--muted)' }}>
                {isDone ? 'All chunks complete' : `Chunk ${currentChunk + 1} of ${chunks.length}, ${chunks[currentChunk]?.length ?? 0} recipients`}
              </p>
            )}

            <ol className="flex flex-col gap-2.5">
              {([
                { n: 1, label: 'Blocklist check', done: checkDone, badge: isChecking ? 'Checking…' : checkDone && !hasBlocklisted ? 'Clear' : hasBlocklisted ? 'Blocked' : 'Recommended', variant: (checkDone && !hasBlocklisted ? 'success' : hasBlocklisted ? 'danger' : 'default') },
                ...(approvalMode ? [
                  { n: 2, label: 'Create approval request', done: propose.confirmed, badge: propose.confirmed ? 'Done' : requestBusy ? 'Pending' : 'Required', variant: (propose.confirmed ? 'success' : 'default') },
                  { n: 3, label: 'Co-signers approve, then you send', done: false, badge: 'Next', variant: 'default' },
                ] : [
                { n: 2, label: 'Allow USDC spend', done: step !== 'idle' && step !== 'checking', badge: step === 'approving' ? 'Pending' : step !== 'idle' && step !== 'checking' ? 'Done' : 'Required', variant: (step !== 'idle' && step !== 'checking' ? 'success' : 'default') },
                { n: 3, label: isChunked ? `Send ${numChunks} chunks` : 'Send batch', done: isDone, badge: isDone ? 'Done' : 'Required', variant: (isDone ? 'success' : 'default') },
                ]),
              ] as { n: number; label: string; done: boolean; badge: string; variant: 'success' | 'danger' | 'default' }[]).map(s => (
                <li key={s.n} className="flex items-center gap-2 text-sm" style={{ color: 'var(--ink-2)' }}>
                  <span className="w-5 h-5 rounded-full flex items-center justify-center text-[11px] font-semibold shrink-0"
                        style={{ background: s.done ? 'var(--success-muted)' : 'var(--surface-muted)', color: s.done ? 'var(--success)' : 'var(--muted)' }}>
                    {s.done ? '✓' : s.n}
                  </span>
                  {s.label}
                  <span className="ml-auto"><Badge variant={s.variant}>{s.badge}</Badge></span>
                </li>
              ))}
            </ol>

            {insufficientFunds && <AlertBox variant="danger">You need {displayTotal} USDC but have {balanceFormatted}. Add USDC on Arc, then try again.</AlertBox>}
            {lowGas && <AlertBox variant="danger">Your wallet does not have enough USDC to pay the network fee. On Arc, gas is paid in USDC.</AlertBox>}
            {needsCheck && !hasBlocklisted && !checkDone && <AlertBox variant="warning">Run the blocklist check to catch blocked addresses before approving.</AlertBox>}

            {/* The check button appears once. After it has run it is gone; the step list above shows the result. */}
            {step === 'idle' && !checkDone && (
              <GhostButton onClick={() => { void handleCheck() }} disabled={isChecking || insufficientFunds}>
                <ShieldAlert size={15} aria-hidden="true" />
                {isChecking ? 'Checking…' : 'Check blocklist'}
              </GhostButton>
            )}
            {approvalMode && (
              <>
                <PrimaryButton onClick={handleRequest} loading={requestBusy} disabled={!canRequest}>
                  {propose.signing ? 'Waiting for wallet…' : propose.confirming ? 'Confirming…' : 'Create approval request'}
                </PrimaryButton>
                {!canRequest && !requestBusy && requestHint && <p className="text-xs" style={{ color: 'var(--muted)' }}>{requestHint}</p>}
                {propose.signing && !propose.error && <TxStatus isPending />}
                {propose.confirming && !propose.error && <TxStatus isConfirming hash={propose.hash} explorerUrl={explorerTx} />}
                {propose.error && (
                  <>
                    <TxStatus isError errorMsg={propose.error} />
                    <GhostButton onClick={propose.clearError}>Try again</GhostButton>
                  </>
                )}
              </>
            )}
            {canApprove && (
              <PrimaryButton onClick={handleApprove} loading={isApproving} disabled={insufficientFunds || lowGas}>
                {isApproving ? 'Waiting for wallet…' : rows.length > CHUNK_SIZE ? `Allow USDC (${numChunks} chunks)` : 'Allow USDC'}
              </PrimaryButton>
            )}
            {step === 'approving' && !approveError && (
              <TxStatus isPending={isApproving} isConfirming={!isApproving} hash={approveHash} explorerUrl={explorerTx} successMsg="Allowance confirmed" />
            )}
            {step === 'approving' && approveError && (
              <>
                <TxStatus isError errorMsg={friendlyTxError(approveError)} />
                <GhostButton onClick={() => setStep('idle')}>Try again</GhostButton>
              </>
            )}
            {canPay && (
              <PrimaryButton onClick={handleBatchPay} loading={isPaying || batchLoading} disabled={lowGas}>
                {isPaying ? 'Waiting for wallet…' : batchLoading ? 'Confirming…' : isChunked ? `Send chunk ${currentChunk + 1}/${chunks.length}` : 'Send batch'}
              </PrimaryButton>
            )}
            {step === 'paying' && !payError && (isPaying || batchLoading) && (
              <TxStatus isPending={isPaying} isConfirming={!isPaying && batchLoading} hash={batchHash} explorerUrl={explorerTx} />
            )}
            {step === 'paying' && payError && (
              <>
                <TxStatus isError errorMsg={friendlyTxError(payError)} />
                <GhostButton onClick={() => setStep('approved')}>Try again</GhostButton>
              </>
            )}
            <p className="text-xs" style={{ color: 'var(--muted)' }}>
              Your wallet asks you to sign each step. Nothing is sent until you confirm, and a payment is only shown as complete after the network confirms it.
            </p>
          </Card>
        </div>
      </div>
    </div>
  )
}
