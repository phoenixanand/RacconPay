/**
 * BillSplitter page
 *
 * FLOW CHANGE: CreateBillPanel now collects bill name + members + expenses
 * in one form. On submit it calls createBill() then addExpense() for each
 * expense in sequence, showing a live settlement preview before submitting.
 *
 * CONTRACT NOTE: no contract changes — same createBill + addExpense calls,
 * just batched in one UX step.
 *
 * DECIMAL NOTE: All amounts are 6-decimal ERC-20 USDC.
 * TRUST NOTE: Members are trusted to record honest expenses (Splitwise model).
 */

import { useState, useCallback } from 'react'
import { useSearchParams } from 'react-router-dom'
import {
  useAccount, useWriteContract, useWaitForTransactionReceipt, useReadContract,
} from 'wagmi'
import { toast } from 'sonner'
import {
  Users, Plus, CheckCircle2, XCircle, ExternalLink,
  ChevronDown, ChevronUp, Copy, Link, Loader2, QrCode, Trash2,
  Receipt, ArrowRight,
} from 'lucide-react'
import { decodeEventLog } from 'viem'

import ChainGuard from './ChainGuard'
import QRModal from './QRModal'
import { BILL_SPLITTER_ADDRESS, USDC_ADDRESS, ARC_CHAIN_ID, explorerTx, explorerAddr } from '../constants'
import { BILL_SPLITTER_ABI as BILL_SPLITTER_V3_ABI, ERC20_ABI } from '../abis'
import { parseUsdc, formatUsdc, shortAddr } from '../utils'
import { Card, Label, PrimaryButton, GhostButton, Badge, PageHeader } from './ui'

// V3 ABI alias used throughout (matches deployed BillSplitter v3 on Arc Mainnet)
const BILL_SPLITTER_ABI = BILL_SPLITTER_V3_ABI

// ── Types ─────────────────────────────────────────────────────────────
interface Expense { paidBy: `0x${string}`; amount: bigint; description: string }
interface DraftExpense { description: string; amount: string; paidBy: string }

// ── Helpers ───────────────────────────────────────────────────────────
function shareUrl(billId: string | number | bigint) {
  return `${window.location.origin}/split?bill=${billId}`
}
function copyShareLink(billId: string | number | bigint) {
  void navigator.clipboard.writeText(shareUrl(billId)).then(() => toast.success('Link copied!'))
}

// ── Settlement preview calculator ─────────────────────────────────────
function calcPreview(
  allMembers: string[],
  expenses: DraftExpense[],
): { addr: string; paid: number; share: number; net: number }[] {
  if (allMembers.length === 0) return []
  const n = allMembers.length
  const lower = allMembers.map(m => m.toLowerCase())

  const totals: Record<string, number> = {}
  lower.forEach(m => { totals[m] = 0 })

  for (const e of expenses) {
    const amt = parseFloat(e.amount)
    if (!amt || isNaN(amt) || !e.paidBy) continue
    const payer = e.paidBy.toLowerCase()
    if (!(payer in totals)) continue
    totals[payer] = (totals[payer] ?? 0) + amt
  }

  const totalSpent = Object.values(totals).reduce((a, b) => a + b, 0)
  const equalShare = totalSpent / n

  return allMembers.map((addr, i) => {
    const paid = totals[lower[i]] ?? 0
    return { addr, paid, share: equalShare, net: paid - equalShare }
  })
}

// ── Input field ────────────────────────────────────────────────────────
function Field({
  label, value, onChange, placeholder, type = 'text', mono = false,
}: {
  label?: string; value: string; onChange: (v: string) => void
  placeholder?: string; type?: string; mono?: boolean
}) {
  return (
    <div>
      {label && <Label>{label}</Label>}
      <input
        type={type}
        value={value}
        onChange={e => onChange(e.target.value)}
        placeholder={placeholder}
        className={`w-full mt-1.5 rounded-xl px-3.5 py-2.5 text-sm outline-none transition-all placeholder:text-[var(--subtle)] ${mono ? 'font-mono text-xs' : ''}`}
        style={{ background: 'var(--surface-muted)', color: 'var(--ink)', border: '1px solid var(--border)' }}
        onFocus={e => (e.currentTarget.style.borderColor = 'var(--border-strong)')}
        onBlur={e => (e.currentTarget.style.borderColor = 'var(--border)')}
      />
    </div>
  )
}

// ── Create Bill (unified form) ────────────────────────────────────────
function CreateBillPanel({ onCreated }: { onCreated: (billId: bigint) => void }) {
  const { address } = useAccount()

  // Bill details
  const [billName, setBillName]       = useState('')
  const [memberInput, setMemberInput] = useState('')
  const [members, setMembers]         = useState<string[]>([])

  // Expenses (draft — not yet on-chain)
  const [expenses, setExpenses] = useState<DraftExpense[]>([
    { description: '', amount: '', paidBy: address ?? '' },
  ])

  // UI state
  const [qrOpen,              setQrOpen]             = useState(false)
  const [step,                setStep]               = useState<'form' | 'submitting' | 'done'>('form')
  const [progress,            setProgress]           = useState('')
  const [createdId,           setCreatedId]          = useState<bigint | null>(null)
  const [finalizeImmediately, setFinalizeImmediately] = useState(false)

  // Wagmi — createBill
  const { writeContractAsync: createBillAsync } = useWriteContract()
  // Wagmi — addExpense (reused for each expense in sequence)
  const { writeContractAsync: addExpenseAsync } = useWriteContract()
  // Wagmi — finalize
  const { writeContractAsync: finalizeAsync }   = useWriteContract()

  // derived
  const allMembers: string[] = Array.from(
    new Set([...(address ? [address.toLowerCase()] : []), ...members.map(m => m.toLowerCase())])
  )

  const preview = calcPreview(allMembers, expenses)
  const validExpenses = expenses.filter(e => e.description.trim() && parseFloat(e.amount) > 0 && e.paidBy)
  const totalExpense = validExpenses.reduce((s, e) => s + parseFloat(e.amount), 0)

  // Members helpers
  const addMember = () => {
    const addr = memberInput.trim()
    if (!addr.startsWith('0x') || addr.length !== 42) { toast.error('Enter a valid 0x address'); return }
    if (allMembers.map(m => m.toLowerCase()).includes(addr.toLowerCase())) { toast.error('Already in list'); return }
    setMembers(prev => [...prev, addr]); setMemberInput('')
  }

  const removeMember = (i: number) => setMembers(prev => prev.filter((_, idx) => idx !== i))

  // Expense row helpers
  const addExpenseRow = () =>
    setExpenses(prev => [...prev, { description: '', amount: '', paidBy: address ?? '' }])
  const removeExpenseRow = (i: number) =>
    setExpenses(prev => prev.filter((_, idx) => idx !== i))
  const updateExpense = (i: number, patch: Partial<DraftExpense>) =>
    setExpenses(prev => prev.map((e, idx) => idx === i ? { ...e, ...patch } : e))

  // Submit: createBill → addExpense × N
  const handleSubmit = async () => {
    if (!billName.trim()) { toast.error('Enter a bill name'); return }
    if (allMembers.length < 2) { toast.error('Add at least one other member'); return }
    if (validExpenses.length === 0) { toast.error('Add at least one expense'); return }

    setStep('submitting')
    try {
      // 1. Create the bill
      setProgress('Creating bill… (confirm in wallet)')
      const createReceipt = await createBillAsync({
        address: BILL_SPLITTER_ADDRESS,
        abi: BILL_SPLITTER_ABI,
        functionName: 'createBill',
        args: [billName.trim(), allMembers as `0x${string}`[]],
        chainId: ARC_CHAIN_ID,
      })

      // Parse the bill ID from the receipt logs
      // createBillAsync returns the tx hash — we need to wait for the receipt
      // Use a lightweight fetch via viem (already imported in constants)
      // We'll pass the hash and wait for confirmation, then parse
      // Actually wagmi's writeContractAsync returns the tx hash, not receipt.
      // Use a simple polling approach: read billsOf after creation.
      // But we also get the bill ID from the BillCreated event.
      // Since we don't have direct receipt access here, we wait for it via
      // useWaitForTransactionReceipt in the UI. Instead, use a different approach:
      // read the billCount from the contract after creation.

      // Simplest: use the tx hash to wait for receipt inline
      setProgress('Waiting for bill creation…')

      // We'll decode the event from the actual tx receipt via wagmi's provider
      // But we can't useWaitForTransactionReceipt in a callback.
      // Alternative: use a direct RPC call.
      const { createPublicClient, http, defineChain } = await import('viem')
      const arcMainnet = defineChain({
        id: ARC_CHAIN_ID,
        name: 'Arc',
        nativeCurrency: { name: 'USDC', symbol: 'USDC', decimals: 6 },
        rpcUrls: { default: { http: ['https://rpc.mainnet.arc.io'] } },
      })
      const client = createPublicClient({ chain: arcMainnet, transport: http() })
      const txReceipt = await client.waitForTransactionReceipt({ hash: createReceipt })

      let billId: bigint | null = null
      for (const log of txReceipt.logs) {
        try {
          const d = decodeEventLog({ abi: BILL_SPLITTER_ABI, eventName: 'BillCreated', data: log.data, topics: log.topics })
          billId = d.args.billId
          break
        } catch { /* skip */ }
      }

      if (billId === null) throw new Error('Could not parse bill ID from transaction')
      setCreatedId(billId)

      // 2. Add each expense in sequence
      for (let i = 0; i < validExpenses.length; i++) {
        const e = validExpenses[i]
        setProgress(`Adding expense ${i + 1} of ${validExpenses.length}: "${e.description}"… (confirm in wallet)`)
        let raw: bigint
        try { raw = parseUsdc(e.amount) } catch { toast.error(`Invalid amount for "${e.description}"`); continue }

        const expTx = await addExpenseAsync({
          address: BILL_SPLITTER_ADDRESS,
          abi: BILL_SPLITTER_ABI,
          functionName: 'addExpense',
          args: [billId, raw, e.description.trim()],
          chainId: ARC_CHAIN_ID,
        })
        await client.waitForTransactionReceipt({ hash: expTx })
      }

      // 3. Optionally finalize immediately
      if (finalizeImmediately) {
        setProgress('Finalizing bill… (confirm in wallet)')
        const finTx = await finalizeAsync({
          address: BILL_SPLITTER_ADDRESS,
          abi: BILL_SPLITTER_ABI,
          functionName: 'finalize',
          args: [billId],
          chainId: ARC_CHAIN_ID,
        })
        await client.waitForTransactionReceipt({ hash: finTx })
      }

      setStep('done')
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err)
      if (!msg.includes('User rejected')) toast.error('Transaction failed')
      setStep('form')
      setProgress('')
    }
  }

  // ── Done state ─────────────────────────────────────────────────────
  if (step === 'done' && createdId !== null) {
    const billId = createdId
    return (
      <>
        {qrOpen && (
          <QRModal billId={billId} billName={billName} open={qrOpen} onClose={() => setQrOpen(false)} />
        )}
        <div className="flex flex-col items-center gap-5 py-4 text-center">
          <div className="w-14 h-14 rounded-2xl flex items-center justify-center"
               style={{ background: 'var(--success-muted)', border: '1px solid rgba(94,207,138,0.25)' }}>
            <CheckCircle2 size={28} style={{ color: 'var(--success)' }} />
          </div>
          <div>
            <p className="font-display font-bold text-xl" style={{ color: 'var(--ink)', letterSpacing: '-0.02em' }}>
              Bill created!
            </p>
            <p className="text-sm mt-1" style={{ color: 'var(--muted)' }}>
              {validExpenses.length} expense{validExpenses.length !== 1 ? 's' : ''} logged · {allMembers.length} members · {totalExpense.toFixed(2)} USDC total
            </p>
          </div>

          {/* Share strip */}
          <div className="w-full flex flex-col gap-2">
            <div className="flex items-center gap-2 px-3 py-2.5 rounded-xl"
                 style={{ background: 'var(--surface-muted)', border: '1px solid var(--border-strong)' }}>
              <Link size={13} style={{ color: 'var(--subtle)' }} className="shrink-0" />
              <span className="flex-1 text-xs font-mono truncate" style={{ color: 'var(--muted)' }}>
                {shareUrl(billId)}
              </span>
              <button onClick={() => copyShareLink(billId)}
                      className="shrink-0 flex items-center gap-1 text-xs font-semibold"
                      style={{ color: 'var(--accent)' }}>
                <Copy size={12} /> Copy
              </button>
            </div>
            <button
              onClick={() => setQrOpen(true)}
              className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-semibold transition-all hover:bg-white/5"
              style={{ border: '1px solid var(--border-strong)', color: 'var(--ink-2)' }}
            >
              <QrCode size={15} /> Show QR code &amp; invite message
            </button>
          </div>

          <div className="flex gap-2 w-full">
            <GhostButton
              onClick={() => {
                setStep('form'); setBillName(''); setMembers([])
                setExpenses([{ description: '', amount: '', paidBy: address ?? '' }])
                setCreatedId(null)
              }}
              className="flex-1"
            >
              Create another
            </GhostButton>
            <PrimaryButton onClick={() => onCreated(billId)} className="flex-1">
              View bill
            </PrimaryButton>
          </div>
        </div>
      </>
    )
  }

  // ── Submitting state ───────────────────────────────────────────────
  if (step === 'submitting') {
    return (
      <div className="flex flex-col items-center gap-5 py-8 text-center">
        <Loader2 size={32} className="animate-spin" style={{ color: 'var(--accent)' }} />
        <div>
          <p className="font-semibold text-sm" style={{ color: 'var(--ink)' }}>Processing…</p>
          <p className="text-xs mt-1" style={{ color: 'var(--muted)' }}>{progress}</p>
        </div>
        <p className="text-xs px-4" style={{ color: 'var(--subtle)' }}>
          You may need to confirm {validExpenses.length + 1} transaction{validExpenses.length !== 0 ? 's' : ''} in your wallet.
        </p>
      </div>
    )
  }

  // ── Form ───────────────────────────────────────────────────────────
  return (
    <div className="flex flex-col gap-6">

      {/* ── Section 1: Bill details ── */}
      <div className="flex flex-col gap-4">
        <div className="flex items-center gap-2">
          <div className="w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold"
               style={{ background: 'var(--accent)', color: '#fff' }}>1</div>
          <p className="text-sm font-semibold" style={{ color: 'var(--ink)' }}>Bill details</p>
        </div>

        <Field
          label="Bill name"
          value={billName}
          onChange={setBillName}
          placeholder="Weekend trip, dinner, etc."
        />

        {/* Members */}
        <div>
          <Label>
            Members{' '}
            <span className="normal-case font-normal" style={{ color: 'var(--subtle)' }}>
              (you are auto-included)
            </span>
          </Label>
          <div className="flex gap-2 mt-1.5">
            <input
              value={memberInput}
              onChange={e => setMemberInput(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && addMember()}
              placeholder="0x…"
              className="flex-1 font-mono text-xs rounded-xl px-3.5 py-2.5 outline-none transition-all placeholder:text-[var(--subtle)]"
              style={{ background: 'var(--surface-muted)', color: 'var(--ink)', border: '1px solid var(--border)' }}
              onFocus={e => (e.currentTarget.style.borderColor = 'var(--border-strong)')}
              onBlur={e => (e.currentTarget.style.borderColor = 'var(--border)')}
            />
            <button
              onClick={addMember}
              className="px-3 rounded-xl transition-colors hover:bg-white/5"
              style={{ border: '1px solid var(--border-strong)', color: 'var(--ink-2)' }}
            >
              <Plus size={15} />
            </button>
          </div>

          {/* Member pills */}
          {allMembers.length > 0 && (
            <div className="mt-2 flex flex-col gap-1">
              {allMembers.map((m, i) => {
                const isYou = m.toLowerCase() === (address ?? '').toLowerCase()
                return (
                  <div key={m} className="flex items-center justify-between px-3 py-2 rounded-xl"
                       style={{ background: isYou ? 'var(--accent-glow)' : 'var(--surface-muted)', border: `1px solid ${isYou ? 'var(--border-strong)' : 'var(--border)'}` }}>
                    <div className="flex items-center gap-2">
                      <div className="w-5 h-5 rounded-full flex items-center justify-center text-xs font-bold"
                           style={{ background: 'var(--accent)', color: '#fff', opacity: isYou ? 1 : 0.6 }}>
                        {i + 1}
                      </div>
                      <span className="text-xs font-mono" style={{ color: isYou ? 'var(--accent)' : 'var(--ink-2)' }}>
                        {isYou ? `You (${shortAddr(m)})` : m}
                      </span>
                    </div>
                    {!isYou && (
                      <button onClick={() => removeMember(members.indexOf(m))}
                              className="transition-colors hover:opacity-70" style={{ color: 'var(--subtle)' }}>
                        <XCircle size={13} />
                      </button>
                    )}
                  </div>
                )
              })}
            </div>
          )}
        </div>
      </div>

      {/* ── Divider ── */}
      <div style={{ borderTop: '1px solid var(--border)' }} />

      {/* ── Section 2: Expenses ── */}
      <div className="flex flex-col gap-4">
        <div className="flex items-center gap-2">
          <div className="w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold"
               style={{ background: 'var(--accent)', color: '#fff' }}>2</div>
          <p className="text-sm font-semibold" style={{ color: 'var(--ink)' }}>Add expenses</p>
          <span className="text-xs ml-auto" style={{ color: 'var(--muted)' }}>
            Split equally among {allMembers.length} member{allMembers.length !== 1 ? 's' : ''}
          </span>
        </div>

        {/* Column headers */}
        <div className="grid gap-2 px-1 text-xs font-semibold uppercase tracking-wide"
             style={{ gridTemplateColumns: '1fr 130px 110px 36px', color: 'var(--subtle)' }}>
          <span>Description</span>
          <span>Amount (USDC)</span>
          <span>Paid by</span>
          <span />
        </div>

        {/* Expense rows */}
        <div className="flex flex-col gap-2">
          {expenses.map((e, i) => (
            <div key={i} className="grid gap-2 items-center"
                 style={{ gridTemplateColumns: '1fr 130px 110px 36px' }}>
              {/* Description */}
              <input
                value={e.description}
                onChange={ev => updateExpense(i, { description: ev.target.value })}
                placeholder="Hotel, dinner…"
                className="rounded-xl px-3 py-2 text-sm outline-none transition-all placeholder:text-[var(--subtle)]"
                style={{ background: 'var(--surface-muted)', color: 'var(--ink)', border: '1px solid var(--border)' }}
                onFocus={ev => (ev.currentTarget.style.borderColor = 'var(--border-strong)')}
                onBlur={ev => (ev.currentTarget.style.borderColor = 'var(--border)')}
              />
              {/* Amount */}
              <input
                type="number"
                min="0"
                step="0.01"
                value={e.amount}
                onChange={ev => updateExpense(i, { amount: ev.target.value })}
                placeholder="0.00"
                className="rounded-xl px-3 py-2 text-sm outline-none transition-all tabular-nums placeholder:text-[var(--subtle)]"
                style={{ background: 'var(--surface-muted)', color: 'var(--ink)', border: '1px solid var(--border)' }}
                onFocus={ev => (ev.currentTarget.style.borderColor = 'var(--border-strong)')}
                onBlur={ev => (ev.currentTarget.style.borderColor = 'var(--border)')}
              />
              {/* Paid by */}
              <select
                value={e.paidBy}
                onChange={ev => updateExpense(i, { paidBy: ev.target.value })}
                className="rounded-xl px-2 py-2 text-xs outline-none transition-all"
                style={{ background: 'var(--surface-muted)', color: 'var(--ink)', border: '1px solid var(--border)' }}
              >
                <option value="">— who paid?</option>
                {allMembers.map(m => (
                  <option key={m} value={m}>
                    {m.toLowerCase() === (address ?? '').toLowerCase() ? 'You' : shortAddr(m)}
                  </option>
                ))}
              </select>
              {/* Remove */}
              <button
                onClick={() => removeExpenseRow(i)}
                disabled={expenses.length === 1}
                className="flex items-center justify-center w-9 h-9 rounded-xl transition-colors hover:bg-red-500/10 disabled:opacity-20"
                style={{ color: 'var(--danger, #ef4444)' }}
              >
                <Trash2 size={14} />
              </button>
            </div>
          ))}
        </div>

        {/* Add row */}
        <button
          onClick={addExpenseRow}
          className="flex items-center gap-1.5 text-sm font-medium transition-colors hover:opacity-80"
          style={{ color: 'var(--accent)' }}
        >
          <Plus size={14} /> Add another expense
        </button>
      </div>

      {/* ── Divider ── */}
      <div style={{ borderTop: '1px solid var(--border)' }} />

      {/* ── Section 3: Preview ── */}
      {validExpenses.length > 0 && allMembers.length >= 1 && (
        <div className="flex flex-col gap-3">
          <div className="flex items-center gap-2">
            <div className="w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold"
                 style={{ background: 'var(--surface-strong)', color: 'var(--ink)', border: '1px solid var(--border-strong)' }}>3</div>
            <p className="text-sm font-semibold" style={{ color: 'var(--ink)' }}>Settlement preview</p>
            <span className="text-xs ml-auto tabular-nums font-semibold" style={{ color: 'var(--accent)' }}>
              {totalExpense.toFixed(2)} USDC total
            </span>
          </div>

          <div className="rounded-2xl overflow-hidden" style={{ border: '1px solid var(--border)' }}>
            {/* Header */}
            <div className="grid px-4 py-2 text-xs font-semibold uppercase tracking-wide"
                 style={{ gridTemplateColumns: '1fr 70px 70px 80px', background: 'var(--surface-muted)', color: 'var(--subtle)', borderBottom: '1px solid var(--border)' }}>
              <span>Member</span>
              <span className="text-right">Paid</span>
              <span className="text-right">Share</span>
              <span className="text-right">Net</span>
            </div>

            {preview.map((row, i) => {
              const isYou = row.addr.toLowerCase() === (address ?? '').toLowerCase()
              return (
                <div key={row.addr}
                     className="grid px-4 py-3 items-center"
                     style={{
                       gridTemplateColumns: '1fr 70px 70px 80px',
                       background: i % 2 === 0 ? 'var(--surface)' : 'var(--surface-muted)',
                     }}>
                  <span className={`text-xs font-mono ${isYou ? 'font-semibold' : ''}`}
                        style={{ color: isYou ? 'var(--accent)' : 'var(--ink-2)' }}>
                    {isYou ? 'You' : shortAddr(row.addr)}
                  </span>
                  <span className="text-xs text-right tabular-nums" style={{ color: 'var(--muted)' }}>
                    {row.paid.toFixed(2)}
                  </span>
                  <span className="text-xs text-right tabular-nums" style={{ color: 'var(--muted)' }}>
                    {row.share.toFixed(2)}
                  </span>
                  <span className="text-xs text-right tabular-nums font-semibold"
                        style={{ color: row.net > 0.005 ? 'var(--success)' : row.net < -0.005 ? 'var(--danger, #ef4444)' : 'var(--subtle)' }}>
                    {row.net > 0.005 ? '+' : ''}{row.net.toFixed(2)} USDC
                  </span>
                </div>
              )
            })}
          </div>

          <p className="text-xs px-1" style={{ color: 'var(--subtle)' }}>
            Positive = creditor (will receive). Negative = debtor (must settle). Balances are calculated after finalization on-chain.
          </p>
        </div>
      )}

      {/* ── Trust note ── */}
      <p className="text-xs px-1" style={{ color: 'var(--warning)' }}>
        Trust note: any member can record expenses without on-chain proof of payment.
      </p>

      {/* ── Finalize immediately checkbox ── */}
      <label className="flex items-start gap-3 cursor-pointer select-none px-1">
        <input
          type="checkbox"
          checked={finalizeImmediately}
          onChange={e => setFinalizeImmediately(e.target.checked)}
          className="mt-0.5 rounded accent-[var(--accent)] w-4 h-4 shrink-0"
        />
        <div>
          <p className="text-sm font-medium" style={{ color: 'var(--ink)' }}>Finalize bill immediately</p>
          <p className="text-xs mt-0.5" style={{ color: 'var(--subtle)' }}>
            Locks the bill so no more expenses can be added. Members can settle right away. You can always finalize later from the bill card.
          </p>
        </div>
      </label>

      {/* ── Submit ── */}
      <PrimaryButton
        onClick={() => { void handleSubmit() }}
        disabled={!billName.trim() || allMembers.length < 2 || validExpenses.length === 0}
        className="w-full"
      >
        <Receipt size={15} className="mr-1.5" />
        Create Bill &amp; Log {validExpenses.length} Expense{validExpenses.length !== 1 ? 's' : ''}
        {finalizeImmediately && ' + Finalize'}
        <ArrowRight size={14} className="ml-1.5" />
      </PrimaryButton>

      {allMembers.length < 2 && (
        <p className="text-xs text-center" style={{ color: 'var(--subtle)' }}>
          Add at least one other member to create a bill.
        </p>
      )}
    </div>
  )
}

// ── Add Expense (standalone — still available inside BillCard) ────────
function AddExpensePanel({ billId, onDone }: { billId: bigint; onDone: () => void }) {
  const [amount, setAmount] = useState('')
  const [desc, setDesc]     = useState('')

  const { writeContract, data: txHash, isPending, reset } = useWriteContract()
  const { isLoading: isConfirming, isSuccess } = useWaitForTransactionReceipt({ hash: txHash })

  const handleAdd = useCallback(() => {
    let raw: bigint
    try { raw = parseUsdc(amount) } catch { toast.error('Invalid amount'); return }
    if (!desc.trim()) { toast.error('Enter a description'); return }
    writeContract({
      address: BILL_SPLITTER_ADDRESS, abi: BILL_SPLITTER_ABI, functionName: 'addExpense',
      args: [billId, raw, desc.trim()], chainId: ARC_CHAIN_ID,
    })
  }, [amount, desc, billId, writeContract])

  if (isSuccess) {
    return (
      <div className="flex flex-col items-center gap-3 py-4 rounded-xl"
           style={{ background: 'var(--success-muted)', border: '1px solid rgba(94,207,138,0.2)' }}>
        <CheckCircle2 size={22} style={{ color: 'var(--success)' }} />
        <p className="text-sm font-medium" style={{ color: 'var(--success)' }}>Expense recorded</p>
        <button onClick={() => { reset(); setAmount(''); setDesc(''); onDone() }}
                className="text-xs underline" style={{ color: 'var(--muted)' }}>
          Add another / done
        </button>
      </div>
    )
  }

  const busy = isPending || isConfirming

  return (
    <div className="flex flex-col gap-3 p-4 rounded-xl"
         style={{ background: 'var(--surface-muted)', border: '1px solid var(--border-strong)' }}>
      <p className="text-sm font-semibold" style={{ color: 'var(--ink)' }}>Log an expense</p>
      <div>
        <Label>Amount you paid (USDC)</Label>
        <input value={amount} onChange={e => setAmount(e.target.value)} placeholder="e.g. 30"
               type="number" min="0" step="0.01"
               className="w-full mt-1.5 rounded-xl px-3.5 py-2.5 text-sm outline-none transition-all"
               style={{ background: 'var(--surface)', color: 'var(--ink)', border: '1px solid var(--border)' }}
               onFocus={e => (e.currentTarget.style.borderColor = 'var(--border-strong)')}
               onBlur={e => (e.currentTarget.style.borderColor = 'var(--border)')} />
      </div>
      <div>
        <Label>Description</Label>
        <input value={desc} onChange={e => setDesc(e.target.value)} placeholder="Hotel, dinner, transport…"
               className="w-full mt-1.5 rounded-xl px-3.5 py-2.5 text-sm outline-none transition-all"
               style={{ background: 'var(--surface)', color: 'var(--ink)', border: '1px solid var(--border)' }}
               onFocus={e => (e.currentTarget.style.borderColor = 'var(--border-strong)')}
               onBlur={e => (e.currentTarget.style.borderColor = 'var(--border)')} />
      </div>
      <div className="flex gap-2">
        <PrimaryButton onClick={handleAdd} loading={busy} className="flex-1">
          {isPending ? 'Confirm…' : isConfirming ? 'Recording…' : 'Add Expense'}
        </PrimaryButton>
        <GhostButton onClick={onDone}>Cancel</GhostButton>
      </div>
    </div>
  )
}

// ── Bill Card ─────────────────────────────────────────────────────────
function BillCard({ id, walletAddress, refetch, defaultExpanded = false }: {
  id: bigint; walletAddress: `0x${string}`; refetch: () => unknown; defaultExpanded?: boolean
}) {
  const [expanded,    setExpanded]    = useState(defaultExpanded)
  const [showExpense, setShowExpense] = useState(false)
  const [qrOpen,      setQrOpen]      = useState(false)
  // Captured once on mount — stable across re-renders, avoids react-purity lint on Date.now
  const [nowSec] = useState<bigint>(() => BigInt(Math.trunc(Date.now() / 1000)))

  const { data: billData, refetch: refetchBill }         = useReadContract({ address: BILL_SPLITTER_ADDRESS, abi: BILL_SPLITTER_ABI, functionName: 'getBill', args: [id] })
  const { data: expensesData, refetch: refetchExpenses } = useReadContract({ address: BILL_SPLITTER_ADDRESS, abi: BILL_SPLITTER_ABI, functionName: 'getExpenses', args: [id], query: { enabled: expanded } })
  const { data: statusData, refetch: refetchStatus }     = useReadContract({ address: BILL_SPLITTER_ADDRESS, abi: BILL_SPLITTER_ABI, functionName: 'getSettlementStatus', args: [id], query: { enabled: expanded } })
  const { data: claimData, refetch: refetchClaim }       = useReadContract({ address: BILL_SPLITTER_ADDRESS, abi: BILL_SPLITTER_ABI, functionName: 'claimsOf', args: [id, walletAddress], query: { enabled: expanded } })
  const { data: usdcAllowance, refetch: refetchAllowance } = useReadContract({ address: USDC_ADDRESS, abi: ERC20_ABI, functionName: 'allowance', args: [walletAddress, BILL_SPLITTER_ADDRESS], query: { enabled: expanded } })

  const { writeContract: writeApprove, data: approveTx, isPending: approving } = useWriteContract()
  const { isLoading: approveConfirming, isSuccess: approveSuccess } = useWaitForTransactionReceipt({ hash: approveTx })
  const { writeContract: writeAction,  data: actionTx,  isPending: actioning  } = useWriteContract()
  const { isLoading: actionConfirming, isSuccess: actionSuccess   } = useWaitForTransactionReceipt({ hash: actionTx })

  const reload = useCallback(() => {
    void refetchBill(); void refetchExpenses(); void refetchStatus()
    void refetchClaim(); void refetchAllowance(); void refetch()
  }, [refetchBill, refetchExpenses, refetchStatus, refetchClaim, refetchAllowance, refetch])

  if (approveSuccess || actionSuccess) { reload() }

  if (!billData) return (
    <div className="h-16 rounded-2xl animate-pulse" style={{ background: 'var(--surface)' }} />
  )

  const [name, members, finalized] = billData as [string, `0x${string}`[], boolean]
  const expiresAt = 0n  // v3 has no expiry; treat as never expired

  // V3 getSettlementStatus: (members, balances, settled[])
  // balances[i] > 0 → creditor (net owed to them); < 0 not possible in Solidity uint, so negative means debtor
  // Actually v3 returns (address[] members, int256[] balances, bool[] settled)
  // Balance > 0 → creditor; balance represented as uint owed per debtor via separate mapping
  // Use settled[i] to check if member paid, and derive from claimsOf for creditor
  // int256 balances from v3: negative = owes, positive = owed by others, 0 = even
  let myBalance: bigint | null = null  // int256: negative=debtor, positive=creditor
  let myRemaining: bigint | null = null  // absolute amount still owed (0 if creditor/even)
  if (statusData) {
    const [sMembers, sBalances, sSettled] = statusData as [`0x${string}`[], bigint[], boolean[]]
    const idx = sMembers.findIndex(m => m.toLowerCase() === walletAddress.toLowerCase())
    if (idx >= 0) {
      const bal = sBalances[idx] ?? 0n  // int256 as bigint (negative=owes)
      const isSettledAlready = sSettled[idx] ?? false
      myBalance = bal
      myRemaining = isSettledAlready ? 0n : (bal < 0n ? -bal : 0n)
    }
  }

  const pendingClaim = claimData
  const isDebtor = myRemaining !== null && myRemaining > 0n
  const isCreditor = myBalance !== null && myBalance > 0n

  const isExpired = expiresAt > 0n && expiresAt < nowSec

  let myAction: 'finalize' | 'force_finalize' | 'approve_settle' | 'settle' | 'withdraw' | 'done' | 'creditor' | null = null
  if (!finalized) {
    if (isExpired) myAction = 'force_finalize'
    else myAction = 'finalize'
  } else if (isDebtor) {
    myAction = (usdcAllowance ?? 0n) >= (myRemaining ?? 0n) ? 'settle' : 'approve_settle'
  } else if (isCreditor && (pendingClaim ?? 0n) > 0n) {
    myAction = 'withdraw'
  } else if (isCreditor) {
    myAction = 'creditor'
  } else {
    myAction = 'done'
  }

  const qrShareAmt = (myRemaining !== null && myRemaining > 0n)
    ? formatUsdc(myRemaining) : undefined

  const handleFinalize      = () => writeAction({ address: BILL_SPLITTER_ADDRESS, abi: BILL_SPLITTER_ABI, functionName: 'finalize', args: [id], chainId: ARC_CHAIN_ID })
  const handleForceFinalize = () => writeAction({ address: BILL_SPLITTER_ADDRESS, abi: BILL_SPLITTER_ABI, functionName: 'finalize', args: [id], chainId: ARC_CHAIN_ID })
  const handleApprove       = () => { if (!myRemaining) return; writeApprove({ address: USDC_ADDRESS, abi: ERC20_ABI, functionName: 'approve', args: [BILL_SPLITTER_ADDRESS, myRemaining], chainId: ARC_CHAIN_ID }) }
  const handleSettle        = () => writeAction({ address: BILL_SPLITTER_ADDRESS, abi: BILL_SPLITTER_ABI, functionName: 'settle', args: [id], chainId: ARC_CHAIN_ID })
  const handleWithdraw      = () => writeAction({ address: BILL_SPLITTER_ADDRESS, abi: BILL_SPLITTER_ABI, functionName: 'withdrawClaim', args: [id], chainId: ARC_CHAIN_ID })

  return (
    <>
      {qrOpen && (
        <QRModal billId={id} billName={name} shareAmt={qrShareAmt} open={qrOpen} onClose={() => setQrOpen(false)} />
      )}

      <Card className="overflow-hidden">
        {/* Header: expand area (div) + action buttons sit OUTSIDE it to avoid nested <button> */}
        <div className="flex items-center">
          {/* Clickable expand zone */}
          <div role="button" tabIndex={0}
               onClick={() => setExpanded(e => !e)}
               onKeyDown={e => e.key === 'Enter' && setExpanded(v => !v)}
               className="flex-1 flex items-center justify-between px-4 py-3.5 transition-colors hover:bg-white/[0.03] cursor-pointer text-left min-w-0">
            <div className="flex items-center gap-3 min-w-0">
              <div className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0"
                   style={{ background: 'var(--accent-glow)', border: '1px solid var(--border-strong)' }}>
                <Users size={14} style={{ color: 'var(--accent)' }} />
              </div>
              <div className="min-w-0">
                <p className="text-sm font-semibold truncate" style={{ color: 'var(--ink)' }}>{name}</p>
                <p className="text-xs" style={{ color: 'var(--subtle)' }}>
                  {members.length} member{members.length !== 1 ? 's' : ''} · Bill #{id.toString()}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2 pl-2 shrink-0">
              <Badge variant={finalized ? 'success' : 'warning'}>{finalized ? 'Finalized' : 'Open'}</Badge>
              {expanded
                ? <ChevronUp size={15} style={{ color: 'var(--subtle)' }} />
                : <ChevronDown size={15} style={{ color: 'var(--subtle)' }} />}
            </div>
          </div>
          {/* Action buttons — siblings of expand zone, never descendants */}
          <div className="flex items-center gap-0.5 pr-3 shrink-0">
            <button onClick={() => setQrOpen(true)}
                    title="QR code & invite"
                    className="p-1.5 rounded-lg transition-colors hover:bg-white/10"
                    style={{ color: 'var(--subtle)' }}>
              <QrCode size={13} />
            </button>
            <button onClick={() => copyShareLink(id)}
                    title="Copy share link"
                    className="p-1.5 rounded-lg transition-colors hover:bg-white/10"
                    style={{ color: 'var(--subtle)' }}>
              <Copy size={13} />
            </button>
          </div>
        </div>

        {/* Expanded */}
        {expanded && (
          <div className="px-4 pb-4 border-t border-[var(--border)] flex flex-col gap-4">

            {/* My balance banner */}
            {finalized && myRemaining !== null && myRemaining > 0n && (
              <div className="mt-3 rounded-xl px-4 py-3 flex items-center justify-between"
                   style={{ background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.2)' }}>
                <div>
                  <p className="text-xs" style={{ color: 'var(--muted)' }}>You still owe</p>
                  <p className="font-display font-bold text-xl tabular-nums"
                     style={{ color: 'var(--danger, #ef4444)', letterSpacing: '-0.02em' }}>
                    {formatUsdc(myRemaining)} USDC
                  </p>
                </div>
                <button onClick={() => setQrOpen(true)}
                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all hover:bg-white/10"
                        style={{ border: '1px solid var(--border-strong)', color: 'var(--ink-2)' }}>
                  <QrCode size={13} /> Share
                </button>
              </div>
            )}
            {/* Pending claim banner */}
            {finalized && (pendingClaim ?? 0n) > 0n && (
              <div className="mt-3 rounded-xl px-4 py-3 flex items-center justify-between"
                   style={{ background: 'var(--success-muted)', border: '1px solid rgba(94,207,138,0.2)' }}>
                <div>
                  <p className="text-xs" style={{ color: 'var(--muted)' }}>Claimable balance</p>
                  <p className="font-display font-bold text-xl tabular-nums"
                     style={{ color: 'var(--success)', letterSpacing: '-0.02em' }}>
                    {formatUsdc(pendingClaim ?? 0n)} USDC
                  </p>
                </div>
                <PrimaryButton onClick={handleWithdraw} loading={actioning || actionConfirming}>
                  Withdraw
                </PrimaryButton>
              </div>
            )}
            {/* Expiry badge */}
            {isExpired && !finalized && (
              <div className="mt-3 flex items-center gap-2 px-3 py-2 rounded-xl"
                   style={{ background: 'rgba(251,146,60,0.1)', border: '1px solid rgba(251,146,60,0.25)' }}>
                <span className="text-xs font-semibold" style={{ color: '#fb923c' }}>Bill expired — anyone can force-finalize it.</span>
              </div>
            )}

            {/* Members table */}
            {statusData && (() => {
              const [sMembers, sBalances, sSettled] = statusData as [`0x${string}`[], bigint[], boolean[]]
              return (
                <div className="mt-3">
                  <Label>Members</Label>
                  <ul className="flex flex-col gap-1 mt-2">
                    {sMembers.map((m, i) => {
                      const bal = sBalances[i] ?? 0n  // int256: negative=owes, positive=owed
                      const isSettledAlready = sSettled[i] ?? false
                      const isYou = m.toLowerCase() === walletAddress.toLowerCase()
                      const isCreditorMember = bal > 0n
                      const isDebtorMember = bal < 0n
                      const fullySettled = finalized && isSettledAlready
                      return (
                        <li key={m} className="flex items-center justify-between py-2 px-3 rounded-lg"
                            style={{ background: 'var(--surface-muted)', border: '1px solid var(--border)' }}>
                          <div className="flex items-center gap-2">
                            <a href={explorerAddr(m)} target="_blank" rel="noreferrer"
                               className="text-xs font-mono transition-colors hover:opacity-70"
                               style={{ color: isYou ? 'var(--accent)' : 'var(--ink-2)' }}>
                              {isYou ? 'You' : shortAddr(m)}
                            </a>
                            {fullySettled && <CheckCircle2 size={12} style={{ color: 'var(--success)' }} />}
                          </div>
                          {finalized && (
                            <span className="text-xs font-semibold tabular-nums"
                                  style={{ color: isSettledAlready ? 'var(--success)' : isDebtorMember ? 'var(--danger, #ef4444)' : isCreditorMember ? 'var(--success)' : 'var(--subtle)' }}>
                              {isSettledAlready ? 'settled' : isDebtorMember ? `-${formatUsdc(-bal)}` : isCreditorMember ? `+${formatUsdc(bal)}` : 'even'} USDC
                            </span>
                          )}
                        </li>
                      )
                    })}
                  </ul>
                </div>
              )
            })()}

            {/* Expenses */}
            {expensesData && (expensesData as Expense[]).length > 0 && (
              <div>
                <Label>Expenses</Label>
                <ul className="flex flex-col gap-1 mt-2">
                  {(expensesData as Expense[]).map((e, i) => (
                    <li key={i} className="flex items-start justify-between px-3 py-2.5 rounded-lg"
                        style={{ background: 'var(--surface-muted)', border: '1px solid var(--border)' }}>
                      <div>
                        <p className="text-xs font-medium" style={{ color: 'var(--ink-2)' }}>{e.description}</p>
                        <p className="text-xs mt-0.5" style={{ color: 'var(--subtle)' }}>
                          paid by {e.paidBy.toLowerCase() === walletAddress.toLowerCase() ? 'you' : shortAddr(e.paidBy)}
                        </p>
                      </div>
                      <span className="text-xs font-semibold tabular-nums shrink-0 ml-2" style={{ color: 'var(--ink)' }}>
                        {formatUsdc(e.amount)} USDC
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {/* Add expense inline */}
            {!finalized && (
              showExpense
                ? <AddExpensePanel billId={id} onDone={() => { setShowExpense(false); reload() }} />
                : (
                  <button onClick={() => setShowExpense(true)}
                          className="w-full flex items-center justify-center gap-1.5 py-2.5 rounded-xl text-sm font-medium transition-all hover:bg-white/5"
                          style={{ border: '1.5px dashed var(--border-strong)', color: 'var(--muted)' }}>
                    <Plus size={14} /> Log another expense
                  </button>
                )
            )}

            {/* Action CTA */}
            <div className="flex gap-2">
              {myAction === 'finalize' && (
                <PrimaryButton onClick={handleFinalize} loading={actioning || actionConfirming} className="flex-1">
                  {actioning ? 'Confirm…' : actionConfirming ? 'Finalizing…' : 'Finalize Bill'}
                </PrimaryButton>
              )}
              {myAction === 'force_finalize' && (
                <PrimaryButton onClick={handleForceFinalize} loading={actioning || actionConfirming} className="flex-1">
                  {actioning ? 'Confirm…' : actionConfirming ? 'Finalizing…' : 'Force-Finalize (expired)'}
                </PrimaryButton>
              )}
              {myAction === 'approve_settle' && myRemaining !== null && (
                <PrimaryButton onClick={handleApprove} loading={approving || approveConfirming} className="flex-1">
                  {approving ? 'Confirm…' : approveConfirming ? 'Approving…' : `Allow ${formatUsdc(myRemaining)} USDC`}
                </PrimaryButton>
              )}
              {myAction === 'settle' && myRemaining !== null && (
                <PrimaryButton onClick={handleSettle} loading={actioning || actionConfirming} className="flex-1">
                  {actioning ? 'Confirm…' : actionConfirming ? 'Settling…' : `Settle ${formatUsdc(myRemaining)} USDC`}
                </PrimaryButton>
              )}
              {myAction === 'done' && (
                <div className="flex items-center gap-1.5 text-sm" style={{ color: 'var(--success)' }}>
                  <CheckCircle2 size={15} /> All settled
                </div>
              )}
              {myAction === 'creditor' && (
                <div className="flex items-center gap-1.5 text-sm" style={{ color: 'var(--muted)' }}>
                  Awaiting debtors to settle
                </div>
              )}
            </div>

            {actionTx && (
              <a href={explorerTx(actionTx)} target="_blank" rel="noreferrer"
                 className="flex items-center gap-1 text-xs" style={{ color: 'var(--accent)' }}>
                <ExternalLink size={11} /> View last transaction
              </a>
            )}
          </div>
        )}
      </Card>
    </>
  )
}

// ── My Bills ──────────────────────────────────────────────────────────
function MyBillsPanel({ walletAddress, highlightId }: { walletAddress: `0x${string}`; highlightId: bigint | null }) {
  const [lookupInput, setLookupInput] = useState('')
  const [lookedUpId,  setLookedUpId]  = useState<bigint | null>(null)

  const { data: billIds, refetch } = useReadContract({
    address: BILL_SPLITTER_ADDRESS, abi: BILL_SPLITTER_ABI, functionName: 'billsOf', args: [walletAddress],
  })

  const ids = (billIds as bigint[] | undefined) ?? []
  const pinnedId: bigint | null = highlightId ?? lookedUpId
  const displayIds: bigint[] = pinnedId
    ? [pinnedId, ...[...ids].reverse().filter(id => id !== pinnedId)]
    : [...ids].reverse()

  const handleLookup = () => {
    const t = lookupInput.trim()
    if (!t || isNaN(Number(t))) { toast.error('Enter a valid bill ID'); return }
    setLookedUpId(BigInt(t)); setLookupInput('')
  }

  return (
    <div className="flex flex-col gap-4">
      <div>
        <Label>
          Open a bill by ID{' '}
          <span className="normal-case font-normal" style={{ color: 'var(--subtle)' }}>
            (from a share link or QR scan)
          </span>
        </Label>
        <div className="flex gap-2 mt-1.5">
          <input value={lookupInput} onChange={e => setLookupInput(e.target.value)}
                 onKeyDown={e => e.key === 'Enter' && handleLookup()} placeholder="e.g. 3"
                 className="flex-1 rounded-xl px-3.5 py-2.5 text-sm outline-none transition-all placeholder:text-[var(--subtle)]"
                 style={{ background: 'var(--surface-muted)', color: 'var(--ink)', border: '1px solid var(--border)' }}
                 onFocus={e => (e.currentTarget.style.borderColor = 'var(--border-strong)')}
                 onBlur={e => (e.currentTarget.style.borderColor = 'var(--border)')} />
          <button onClick={handleLookup}
                  className="px-4 rounded-xl text-sm font-semibold transition-all hover:scale-[1.01]"
                  style={{ background: 'var(--surface-strong)', color: 'var(--ink-2)', border: '1px solid var(--border-strong)' }}>
            Open
          </button>
        </div>
      </div>

      {displayIds.length === 0 ? (
        <Card className="flex flex-col items-center gap-4 py-14 text-center">
          <div className="w-12 h-12 rounded-2xl flex items-center justify-center"
               style={{ background: 'var(--surface-strong)', border: '1px solid var(--border-strong)' }}>
            <Users size={22} style={{ color: 'var(--subtle)' }} />
          </div>
          <div>
            <p className="text-sm font-semibold" style={{ color: 'var(--ink)' }}>No bills yet</p>
            <p className="text-sm mt-1" style={{ color: 'var(--muted)' }}>Create one or paste a bill ID above.</p>
          </div>
        </Card>
      ) : (
        <div className="flex flex-col gap-3">
          {displayIds.map(id => (
            <BillCard key={id.toString()} id={id} walletAddress={walletAddress} refetch={refetch}
                      defaultExpanded={pinnedId !== null && id === pinnedId} />
          ))}
        </div>
      )}
    </div>
  )
}

// ── Root page ─────────────────────────────────────────────────────────
export default function SplitPage() {
  const { address } = useAccount()
  const [searchParams, setSearchParams] = useSearchParams()
  const [manualTab, setManualTab] = useState<'create' | 'bills' | null>(null)
  const [refreshKey, setRefreshKey] = useState(0)
  const [manualHighlight, setManualHighlight] = useState<bigint | null>(null)

  const urlBillParam = searchParams.get('bill')
  const urlHighlight = urlBillParam && !isNaN(Number(urlBillParam)) ? BigInt(urlBillParam) : null
  const highlightId  = manualHighlight ?? urlHighlight
  const tab: 'create' | 'bills' = manualTab ?? (urlHighlight ? 'bills' : 'bills')
  const setTab = (t: 'create' | 'bills') => setManualTab(t)

  const handleCreated = (billId: bigint) => {
    setManualHighlight(billId); setManualTab('bills'); setRefreshKey(k => k + 1)
    setSearchParams({ bill: billId.toString() })
  }

  return (
    <ChainGuard>
      <div className="flex flex-col gap-6 max-w-2xl mx-auto">
        <PageHeader icon={Users} title="Bill Splitter" subtitle="Split group expenses and settle in USDC — no mental math needed." />

        {/* Tab bar */}
        <div className="flex gap-1 p-1 rounded-xl w-fit" style={{ background: 'var(--surface-muted)', border: '1px solid var(--border)' }}>
          {(['bills', 'create'] as const).map(t => (
            <button key={t} onClick={() => setTab(t)}
                    className="px-4 py-1.5 rounded-lg text-sm font-medium transition-all"
                    style={{
                      background: tab === t ? 'var(--surface-strong)' : 'transparent',
                      color: tab === t ? 'var(--ink)' : 'var(--muted)',
                      border: tab === t ? '1px solid var(--border-strong)' : '1px solid transparent',
                    }}>
              {t === 'create' ? 'Create Bill' : 'My Bills'}
            </button>
          ))}
        </div>

        {/* Panel */}
        <Card strong className="p-5">
          {tab === 'create'
            ? <CreateBillPanel onCreated={handleCreated} />
            : address && <MyBillsPanel key={refreshKey} walletAddress={address} highlightId={highlightId} />
          }
        </Card>
      </div>
    </ChainGuard>
  )
}
