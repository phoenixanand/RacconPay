/**
 * Invoice Generator, create shareable USDC payment requests.
 * Features: fromName, sequential IDs, status tracking, due date, PDF export,
 *           paid detection via RPC, export/import JSON, single-tx payment.
 */
import React, { useState, useEffect, useRef, useCallback } from 'react'
import { useAccount, useWriteContract, useWaitForTransactionReceipt, usePublicClient, useSwitchChain } from 'wagmi'
import {
  FileText, Copy, Check, QrCode, ExternalLink, Plus,
  Trash2, Send, Download, AlertTriangle, CheckCircle2,
  Upload, ArrowDownToLine,
} from 'lucide-react'
import { QRCodeSVG } from 'qrcode.react'
import { toast } from 'sonner'
import jsPDF from 'jspdf'
import {
  Card, PageHeader, Input, PrimaryButton, GhostButton,
  TxStatus, AlertBox, Divider, StatCard,
} from './ui'
import { StatusBadge } from './kit/StatusBadge'
import { EmptyState } from './kit/States'
import { DateField } from './kit/Fields'
import { friendlyTxError } from '../lib/txError'
import { useRecordTx } from '../lib/txlog'
import { ARC_CHAIN_ID, ARC_TESTNET_CHAIN_ID, chainLabel, explorerTxFor } from '../constants'
import { ERC20_ABI } from '../abis'
import { TOKENS, TOKEN_LIST, isTokenSymbol, tokenAddress, type TokenSymbol } from '../tokens'
import { formatToken, parseToken, shortAddr } from '../utils'

/* ── Types ──────────────────────────────────────────────── */
export type InvoiceStatus = 'unpaid' | 'paid' | 'overdue'

const SUPPORTED_CHAINS = [ARC_CHAIN_ID, ARC_TESTNET_CHAIN_ID] as const

/** Invoices created before EURC support carry no token/chain: they are USDC on Arc Mainnet. */
export function invoiceToken(inv: { token?: TokenSymbol }): TokenSymbol { return inv.token ?? 'USDC' }
export function invoiceChain(inv: { chainId?: number }): number { return inv.chainId ?? ARC_CHAIN_ID }

export interface InvoiceData {
  id:         string
  token?:     TokenSymbol  // USDC (default) or EURC
  chainId?:   number       // Arc Mainnet (default) or Arc Testnet
  to:         string   // payee (invoice creator's wallet)
  fromName:   string   // free-text sender name / company
  clientName: string   // free-text client / payer name
  amount:     string
  memo:       string
  dueDate:    string   // ISO date string YYYY-MM-DD or ''
  createdAt:  number
  status:     InvoiceStatus
  paidAt?:    number
  paidTx?:    string
}

/* ── Helpers ────────────────────────────────────────────── */
const LS_KEY     = 'racconpay-invoices'
const LS_CTR_KEY = 'racconpay-invoice-ctr'

function nextId(): string {
  const n = (parseInt(localStorage.getItem(LS_CTR_KEY) ?? '0', 10) || 0) + 1
  localStorage.setItem(LS_CTR_KEY, String(n))
  return `INV-${String(n).padStart(4, '0')}`
}

function buildInvoiceUrl(inv: InvoiceData): string {
  const base = window.location.origin + '/pay-invoice'
  const params = new URLSearchParams({
    to:       inv.to,
    amount:   inv.amount,
    memo:     inv.memo,
    id:       inv.id,
    fromName: inv.fromName,
    token:    invoiceToken(inv),
    chain:    String(invoiceChain(inv)),
  })
  return `${base}?${params.toString()}`
}

function computeStatus(inv: InvoiceData): InvoiceStatus {
  if (inv.status === 'paid') return 'paid'
  if (inv.dueDate && new Date(inv.dueDate) < new Date()) return 'overdue'
  return 'unpaid'
}

function statusBadge(s: InvoiceStatus) {
  return <StatusBadge status={s} />
}

function loadInvoices(): InvoiceData[] {
  try { return JSON.parse(localStorage.getItem(LS_KEY) ?? '[]') as InvoiceData[] } catch { return [] }
}
function saveToStorage(list: InvoiceData[]) {
  localStorage.setItem(LS_KEY, JSON.stringify(list))
}

/* ── PDF Export ─────────────────────────────────────────── */
function exportPDF(inv: InvoiceData) {
  const doc = new jsPDF({ unit: 'pt', format: 'a4' })
  const W = doc.internal.pageSize.getWidth()

  // Header bar
  doc.setFillColor(196, 120, 42)
  doc.rect(0, 0, W, 60, 'F')
  doc.setTextColor(255, 255, 255)
  doc.setFontSize(22)
  doc.setFont('helvetica', 'bold')
  doc.text('RacconPay', 40, 38)
  doc.setFontSize(11)
  doc.setFont('helvetica', 'normal')
  doc.text(`${invoiceToken(inv)} Invoice`, W - 40, 38, { align: 'right' })

  // Invoice ID + status
  doc.setTextColor(40, 30, 20)
  doc.setFontSize(18)
  doc.setFont('helvetica', 'bold')
  doc.text(inv.id, 40, 95)
  doc.setFontSize(10)
  doc.setFont('helvetica', 'normal')
  doc.setTextColor(120, 90, 60)
  doc.text(`Status: ${inv.status.toUpperCase()}`, 40, 112)
  doc.text(`Created: ${new Date(inv.createdAt).toLocaleDateString()}`, 40, 126)
  if (inv.dueDate) doc.text(`Due: ${inv.dueDate}`, 40, 140)
  if (inv.paidAt)  doc.text(`Paid: ${new Date(inv.paidAt).toLocaleDateString()}`, 40, 154)

  // From / To
  doc.setDrawColor(220, 200, 170)
  doc.line(40, 168, W - 40, 168)

  doc.setFontSize(9)
  doc.setTextColor(120, 90, 60)
  doc.text('FROM', 40, 188)
  doc.setFontSize(10)
  doc.setTextColor(40, 30, 20)
  doc.setFont('helvetica', 'bold')
  doc.text(inv.fromName || 'RacconPay User', 40, 202)
  doc.setFont('courier', 'normal')
  doc.setFontSize(9)
  doc.setTextColor(80, 60, 40)
  doc.text(inv.to, 40, 215)

  if (inv.clientName) {
    doc.setFontSize(9)
    doc.setTextColor(120, 90, 60)
    doc.setFont('helvetica', 'normal')
    doc.text('BILL TO', W / 2, 188)
    doc.setFontSize(10)
    doc.setTextColor(40, 30, 20)
    doc.setFont('helvetica', 'bold')
    doc.text(inv.clientName, W / 2, 202)
  }

  // Amount box
  doc.setFillColor(253, 246, 235)
  doc.roundedRect(40, 228, W - 80, 60, 8, 8, 'F')
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(28)
  doc.setTextColor(196, 120, 42)
  doc.text(`${inv.amount} ${invoiceToken(inv)}`, W / 2, 264, { align: 'center' })

  // Memo
  if (inv.memo) {
    doc.setFontSize(10)
    doc.setFont('helvetica', 'normal')
    doc.setTextColor(80, 60, 40)
    doc.text('Description', 40, 310)
    doc.setFontSize(11)
    doc.setTextColor(40, 30, 20)
    doc.text(inv.memo, 40, 326)
  }

  // Paid tx
  if (inv.paidTx) {
    doc.setFontSize(9)
    doc.setTextColor(120, 90, 60)
    doc.text('Payment TX', 40, 356)
    doc.setFont('courier', 'normal')
    doc.setFontSize(8)
    doc.setTextColor(40, 30, 20)
    doc.text(inv.paidTx, 40, 368)
  }

  // Footer
  doc.setFillColor(253, 246, 235)
  doc.rect(0, doc.internal.pageSize.getHeight() - 40, W, 40, 'F')
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(8)
  doc.setTextColor(160, 120, 80)
  doc.text(`Generated by RacconPay · Powered by ${chainLabel(invoiceChain(inv))} · ${invoiceToken(inv)} payments`, W / 2, doc.internal.pageSize.getHeight() - 16, { align: 'center' })

  doc.save(`${inv.id}.pdf`)
  toast.success('PDF downloaded')
}

/* ── Payer Receipt PDF ───────────────────────────────────── */
function exportPayerReceipt({
  invoiceId, fromName, toAddr, payerAddr, amount, memo, txHash, paidAt, token, chainId,
}: {
  invoiceId: string; fromName: string; toAddr: string; payerAddr: string
  amount: string; memo: string; txHash: string; paidAt: number
  token: TokenSymbol; chainId: number
}) {
  const doc = new jsPDF({ unit: 'pt', format: 'a4' })
  const W = doc.internal.pageSize.getWidth()

  // Header bar, green for receipt
  doc.setFillColor(39, 174, 96)
  doc.rect(0, 0, W, 60, 'F')
  doc.setTextColor(255, 255, 255)
  doc.setFontSize(22)
  doc.setFont('helvetica', 'bold')
  doc.text('RacconPay', 40, 38)
  doc.setFontSize(11)
  doc.setFont('helvetica', 'normal')
  doc.text('Payment Receipt', W - 40, 38, { align: 'right' })

  // Invoice ID + paid date
  doc.setTextColor(40, 30, 20)
  doc.setFontSize(18)
  doc.setFont('helvetica', 'bold')
  doc.text(invoiceId, 40, 95)
  doc.setFontSize(10)
  doc.setFont('helvetica', 'normal')
  doc.setTextColor(120, 90, 60)
  doc.text(`Status: PAID`, 40, 112)
  doc.text(`Paid: ${new Date(paidAt).toLocaleString()}`, 40, 126)

  // Divider
  doc.setDrawColor(220, 200, 170)
  doc.line(40, 142, W - 40, 142)

  // Paid by / paid to
  const col2 = W / 2 + 10
  doc.setFontSize(9)
  doc.setTextColor(120, 90, 60)
  doc.text('PAID BY', 40, 162)
  doc.text('PAID TO', col2, 162)

  doc.setFontSize(10)
  doc.setTextColor(40, 30, 20)
  doc.setFont('helvetica', 'bold')
  doc.text('You', 40, 176)
  doc.text(fromName || 'RacconPay User', col2, 176)

  doc.setFont('courier', 'normal')
  doc.setFontSize(8)
  doc.setTextColor(80, 60, 40)
  const payerLine = payerAddr.slice(0, 24) + '…'
  const toLine    = toAddr.slice(0, 24) + '…'
  doc.text(payerLine, 40, 189)
  doc.text(toLine, col2, 189)

  // Amount box
  doc.setFillColor(235, 252, 243)
  doc.roundedRect(40, 204, W - 80, 60, 8, 8, 'F')
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(28)
  doc.setTextColor(39, 174, 96)
  doc.text(`${amount} ${token}`, W / 2, 240, { align: 'center' })

  // Memo
  if (memo) {
    doc.setFontSize(10)
    doc.setFont('helvetica', 'normal')
    doc.setTextColor(80, 60, 40)
    doc.text('Description', 40, 286)
    doc.setFontSize(11)
    doc.setTextColor(40, 30, 20)
    doc.text(memo, 40, 302)
  }

  // Transaction hash
  doc.setFontSize(9)
  doc.setTextColor(120, 90, 60)
  doc.text('Transaction Hash', 40, memo ? 332 : 286)
  doc.setFont('courier', 'normal')
  doc.setFontSize(7.5)
  doc.setTextColor(40, 30, 20)
  doc.text(txHash, 40, memo ? 345 : 299)

  // Arc explorer note
  doc.setFontSize(8)
  doc.setFont('helvetica', 'normal')
  doc.setTextColor(120, 90, 60)
  doc.text(`Verify on Arc Explorer: ${explorerTxFor(chainId, txHash)}`, 40, memo ? 362 : 316)

  // Footer
  doc.setFillColor(235, 252, 243)
  doc.rect(0, doc.internal.pageSize.getHeight() - 40, W, 40, 'F')
  doc.setFontSize(8)
  doc.setTextColor(80, 120, 80)
  doc.text(`Generated by RacconPay · Powered by ${chainLabel(chainId)} · ${token} payments`, W / 2, doc.internal.pageSize.getHeight() - 16, { align: 'center' })

  doc.save(`receipt-${invoiceId}.pdf`)
  toast.success('Receipt PDF downloaded')
}

/* ── Pay Invoice view ────────────────────────────────────── */
function PayInvoiceView() {
  const params    = new URLSearchParams(window.location.search)
  const toAddr    = params.get('to')       ?? ''
  const amountStr = params.get('amount')   ?? '0'
  const memo      = params.get('memo')     ?? ''
  const invoiceId = params.get('id')       ?? ''
  const fromName  = params.get('fromName') ?? ''
  const tokenParam = params.get('token')
  const token: TokenSymbol = isTokenSymbol(tokenParam) ? tokenParam : 'USDC'
  const chainParam = Number(params.get('chain') ?? ARC_CHAIN_ID)
  const invChain = (SUPPORTED_CHAINS as readonly number[]).includes(chainParam) ? chainParam : ARC_CHAIN_ID
  const tokenAddr = tokenAddress(token, invChain)
  const tokenDecimals = TOKENS[token].decimals

  const { address, chainId: walletChain } = useAccount()
  const { switchChain, isPending: switching } = useSwitchChain()
  const wrongChain = !!address && walletChain !== invChain
  const [paidAtMs] = useState(() => Date.now())

  // Single-step: direct ERC-20 transfer (no approve needed, payer sends to creator)
  const { writeContract: transfer, data: transferHash, isPending: transferPending, error: transferError } = useWriteContract()
  const { isSuccess: transferConfirmed, isLoading: transferConfirming } = useWaitForTransactionReceipt({ hash: transferHash })

  const amountRaw = (() => {
    try { return parseToken(amountStr, tokenDecimals) } catch { return 0n }
  })()

  useRecordTx({ address, hash: transferHash, confirmed: transferConfirmed, kind: 'Invoice', detail: `Paid invoice ${invoiceId || ''}`.trim(), amountRaw, token })

  // On payment confirmed, mark invoice paid in localStorage (only if opened by creator)
  useEffect(() => {
    if (transferConfirmed && invoiceId && transferHash) {
      const list = loadInvoices()
      const updated: InvoiceData[] = list.map(i =>
        i.id === invoiceId ? { ...i, status: 'paid', paidAt: Date.now(), paidTx: transferHash } : i
      )
      saveToStorage(updated)
    }
  }, [transferConfirmed, invoiceId, transferHash])

  const handlePay = () => {
    if (!address || !tokenAddr) return
    transfer({
      address: tokenAddr,
      abi: ERC20_ABI,
      functionName: 'transfer',
      args: [toAddr as `0x${string}`, amountRaw],
      chainId: invChain,
    })
  }

  if (transferConfirmed && transferHash) {
    return (
      <div className="max-w-md mx-auto py-10 flex flex-col items-center gap-6 text-center">
        <div className="w-16 h-16 rounded-full flex items-center justify-center" style={{ background: 'var(--success-muted)' }}>
          <CheckCircle2 size={32} style={{ color: 'var(--success)' }} />
        </div>
        <div>
          <h2 className="font-semibold text-2xl" style={{ color: 'var(--ink)' }}>Payment confirmed</h2>
          <p className="text-sm mt-1" style={{ color: 'var(--muted)' }}>
            {formatToken(amountRaw, tokenDecimals)} {token} sent to {fromName || shortAddr(toAddr)} · {invoiceId}
          </p>
        </div>

        {/* Receipt card */}
        <div className="w-full rounded-2xl p-5 text-left flex flex-col gap-3"
             style={{ background: 'var(--surface-muted)', border: '1px solid var(--border-strong)' }}>
          {[
            ['Invoice',     invoiceId],
            ['Amount',      `${formatToken(amountRaw, tokenDecimals)} ${token}`],
            ['Paid to',     fromName ? `${fromName} (${shortAddr(toAddr)})` : shortAddr(toAddr)],
            ['Paid from',   address ? shortAddr(address) : '-'],
            ['Date',        new Date(paidAtMs).toLocaleString()],
          ].map(([k, v]) => (
            <div key={k} className="flex items-center justify-between gap-4 text-sm">
              <span style={{ color: 'var(--subtle)' }}>{k}</span>
              <span className="font-medium text-right" style={{ color: 'var(--ink-2)' }}>{v}</span>
            </div>
          ))}
          <div className="flex items-center justify-between gap-4 text-sm pt-1"
               style={{ borderTop: '1px solid var(--border)' }}>
            <span style={{ color: 'var(--subtle)' }}>Tx hash</span>
            <a href={explorerTxFor(invChain, transferHash)} target="_blank" rel="noreferrer"
               className="font-mono text-xs flex items-center gap-1" style={{ color: 'var(--accent)' }}>
              {transferHash.slice(0, 10)}… <ExternalLink size={11} />
            </a>
          </div>
        </div>

        {/* Download receipt PDF */}
        <button
          onClick={() => exportPayerReceipt({
            invoiceId, fromName, toAddr, payerAddr: address ?? '',
            amount: formatToken(amountRaw, tokenDecimals), memo, txHash: transferHash, paidAt: paidAtMs,
            token, chainId: invChain,
          })}
          className="w-full flex items-center justify-center gap-2 py-3 rounded-xl text-sm font-semibold transition-all hover:scale-[1.01]"
          style={{ background: 'var(--success)', color: '#ffffff' }}
        >
          <Download size={15} /> Download Payment Receipt PDF
        </button>

        <a href={explorerTxFor(invChain, transferHash)} target="_blank" rel="noreferrer"
           className="flex items-center gap-1.5 text-sm" style={{ color: 'var(--muted)' }}>
          <ExternalLink size={13} /> View on explorer
        </a>
      </div>
    )
  }

  return (
    <div className="max-w-md mx-auto py-6">
      <PageHeader
        icon={FileText}
        title="Pay invoice"
        subtitle={invoiceId || `${token} Payment Request`}
        accentColor="var(--receipt-accent)"
      />
      <Card className="p-5 flex flex-col gap-4">
        {fromName && (
          <div className="text-sm px-1" style={{ color: 'var(--ink-2)' }}>
            <span style={{ color: 'var(--subtle)' }}>From: </span>
            <span className="font-semibold">{fromName}</span>
          </div>
        )}
        <div className="flex items-center justify-between py-3 px-4 rounded-xl"
          style={{ background: 'var(--surface-muted)', border: '1px solid var(--border)' }}>
          <span className="text-sm" style={{ color: 'var(--muted)' }}>Amount due</span>
          <span className="font-semibold text-2xl tabular-nums" style={{ color: 'var(--ink)' }}>
            {formatToken(amountRaw, tokenDecimals)} <span className="text-base font-semibold" style={{ color: 'var(--muted)' }}>{token}</span>
          </span>
        </div>
        {memo && <div className="text-sm px-1" style={{ color: 'var(--ink-2)' }}><span style={{ color: 'var(--subtle)' }}>Memo: </span>{memo}</div>}
        <div className="text-sm px-1" style={{ color: 'var(--ink-2)' }}>
          <span style={{ color: 'var(--subtle)' }}>Pay to: </span>
          <span className="font-mono">{shortAddr(toAddr)}</span>
        </div>
        <Divider />
        {!address && <AlertBox variant="info">Connect your wallet to pay this invoice.</AlertBox>}
        {!tokenAddr && <AlertBox variant="danger">{token} is not available on {chainLabel(invChain)}.</AlertBox>}
        {address && wrongChain && (
          <PrimaryButton onClick={() => switchChain({ chainId: invChain })} loading={switching}>
            Switch to {chainLabel(invChain)}
          </PrimaryButton>
        )}
        {address && !wrongChain && (
          <PrimaryButton onClick={handlePay} loading={!!transferHash && transferConfirming} disabled={!!transferHash || !tokenAddr || amountRaw === 0n}>
            Send {formatToken(amountRaw, tokenDecimals)} {token}
          </PrimaryButton>
        )}
        {transferPending && !transferError && <TxStatus isPending />}
        {transferError && <TxStatus isError errorMsg={friendlyTxError(transferError)} />}
        {transferHash && (
          <TxStatus
            isPending={!transferHash}
            isConfirming={!!transferHash && !transferConfirmed}
            hash={transferHash}
            explorerUrl={(h) => explorerTxFor(invChain, h)}
            successMsg="Payment confirmed!"
          />
        )}

      </Card>
    </div>
  )
}

/* ── Invoice Card ───────────────────────────────────────── */
function InvoiceCard({
  inv, onDelete, onMarkPaid,
}: {
  inv: InvoiceData
  onDelete: (id: string) => void
  onMarkPaid: (id: string) => void
}) {
  const [showQR, setShowQR] = useState(false)
  const [copied, setCopied] = useState(false)
  const token = invoiceToken(inv)
  const invChain = invoiceChain(inv)
  const publicClient = usePublicClient({ chainId: invChain })
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const url = buildInvoiceUrl(inv)
  const status = computeStatus(inv)

  // Poll RPC for an incoming transfer of this invoice's token matching its amount
  const checkPaid = useCallback(() => {
    const invToken = invoiceToken(inv)
    const invTokenAddr = tokenAddress(invToken, invoiceChain(inv))
    if (inv.status === 'paid' || !publicClient || !invTokenAddr) return
    void publicClient.getBlockNumber().then(async (latest) => {
      const from = latest - 200n > 0n ? latest - 200n : 0n
      try {
        const amountRaw = parseToken(inv.amount, TOKENS[invToken].decimals)
        const logs = await publicClient.getLogs({
          address: invTokenAddr,
          event: {
            type: 'event',
            name: 'Transfer',
            inputs: [
              { type: 'address', name: 'from', indexed: true },
              { type: 'address', name: 'to',   indexed: true },
              { type: 'uint256', name: 'value', indexed: false },
            ],
          },
          args: { to: inv.to as `0x${string}` },
          fromBlock: from,
          toBlock:   'latest',
        })
        const match = logs.find(l => (l.args as { value?: bigint }).value === amountRaw)
        if (match) {
          onMarkPaid(inv.id)
          if (pollRef.current) clearInterval(pollRef.current)
        }
      } catch { /* ignore */ }
    })
  }, [inv, publicClient, onMarkPaid])

  // Poll every 15s for unpaid invoices
  useEffect(() => {
    if (inv.status === 'paid') return
    checkPaid()
    pollRef.current = setInterval(checkPaid, 15000)
    return () => { if (pollRef.current) clearInterval(pollRef.current) }
  }, [inv.status, checkPaid])

  const copyLink = () => {
    void navigator.clipboard.writeText(url)
    setCopied(true)
    toast.success('Link copied')
    setTimeout(() => setCopied(false), 2000)
  }

  const copyMessage = () => {
    const from = inv.fromName ? `from ${inv.fromName} ` : ''
    const msg = `Hi! Please pay ${inv.amount} ${token} ${from}for "${inv.memo || 'Invoice'}" (${inv.id}).\nPay here: ${url}`
    void navigator.clipboard.writeText(msg)
    toast.success('Message copied')
  }

  return (
    <Card className="p-4 flex flex-col gap-3">
      {/* Header */}
      <div className="flex items-start justify-between gap-2">
        <div className="flex flex-col gap-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-mono text-xs font-semibold" style={{ color: 'var(--accent)' }}>{inv.id}</span>
            {statusBadge(status)}
          </div>
          {inv.fromName && <p className="text-xs font-semibold" style={{ color: 'var(--ink-2)' }}>{inv.fromName}</p>}
          {inv.clientName && <p className="text-xs" style={{ color: 'var(--muted)' }}>To: {inv.clientName}</p>}
          {inv.memo && <p className="text-sm truncate" style={{ color: 'var(--muted)' }}>{inv.memo}</p>}
        </div>
        <div className="flex items-center gap-1 shrink-0">
          <button onClick={() => setShowQR(v => !v)} className="w-11 h-11 rounded-lg flex items-center justify-center hover:bg-[var(--surface-hover)] transition-colors" style={{ color: 'var(--muted)' }} title="QR code" aria-label="Show QR code">
            <QrCode size={15} />
          </button>
          <button onClick={copyLink} className="w-11 h-11 rounded-lg flex items-center justify-center hover:bg-[var(--surface-hover)] transition-colors" style={{ color: copied ? 'var(--success)' : 'var(--muted)' }} title="Copy link" aria-label="Copy payment link">
            {copied ? <Check size={15} /> : <Copy size={15} />}
          </button>
          <button onClick={() => exportPDF(inv)} className="w-11 h-11 rounded-lg flex items-center justify-center hover:bg-[var(--surface-hover)] transition-colors" style={{ color: 'var(--muted)' }} title="Download PDF" aria-label="Download invoice PDF">
            <Download size={15} />
          </button>
          <button onClick={() => onDelete(inv.id)} className="w-11 h-11 rounded-lg flex items-center justify-center hover:bg-[var(--danger-muted)] transition-colors" style={{ color: 'var(--danger)' }} title="Delete invoice" aria-label="Delete invoice">
            <Trash2 size={15} />
          </button>
        </div>
      </div>

      {/* Amount + due date row */}
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <span className="font-semibold text-xl tabular-nums" style={{ color: 'var(--ink)' }}>
          {inv.amount} <span className="text-sm font-medium" style={{ color: 'var(--muted)' }}>{token}</span>
        </span>
        <div className="flex flex-col items-end gap-0.5">
          {inv.dueDate && (
            <span className="text-xs" style={{ color: status === 'overdue' ? 'var(--danger)' : 'var(--subtle)' }}>
              Due {inv.dueDate}
            </span>
          )}
          {inv.paidAt && (
            <span className="text-xs flex items-center gap-1" style={{ color: 'var(--success)' }}>
              <CheckCircle2 size={11} /> Paid {new Date(inv.paidAt).toLocaleDateString()}
            </span>
          )}
        </div>
      </div>

      {/* Paid tx */}
      {inv.paidTx && (
        <a href={explorerTxFor(invChain, inv.paidTx)} target="_blank" rel="noreferrer"
          className="flex items-center gap-1.5 text-xs" style={{ color: 'var(--success)' }}>
          <ExternalLink size={11} /> View payment tx
        </a>
      )}

      {/* QR panel */}
      {showQR && (
        <>
          <Divider />
          <div className="flex flex-col items-center gap-3">
            <div className="p-3 rounded-xl" style={{ background: '#ffffff' }}>
              <QRCodeSVG value={url} size={180} level="M" />
            </div>
            <div className="flex gap-2 w-full">
              <GhostButton onClick={copyLink} className="flex-1 text-xs">
                <Copy size={12} /> Copy link
              </GhostButton>
              <GhostButton onClick={copyMessage} className="flex-1 text-xs">
                <Send size={12} /> Copy message
              </GhostButton>
            </div>
          </div>
        </>
      )}

      {/* Pay link */}
      {inv.status !== 'paid' && (
        <a href={url} target="_blank" rel="noreferrer"
          className="flex items-center gap-1.5 text-xs" style={{ color: 'var(--accent)' }}>
          <ExternalLink size={11} /> Open payment page
        </a>
      )}
    </Card>
  )
}

/* ── Main Invoice Generator ───────────────────────────────── */
export default function InvoiceGenerator() {
  const { address, chainId: walletChain } = useAccount()
  const [form, setForm] = useState({ amount: '', memo: '', dueDate: '', fromName: '', clientName: '' })
  const [token, setToken] = useState<TokenSymbol>('USDC')
  // Invoices are created for the network the wallet is on (Arc Testnet or Arc Mainnet).
  const invoiceChainId = walletChain === ARC_TESTNET_CHAIN_ID ? ARC_TESTNET_CHAIN_ID : ARC_CHAIN_ID
  const [invoices, setInvoices] = useState<InvoiceData[]>(() => {
    const raw = loadInvoices()
    const refreshed = raw.map(i => ({ ...i, status: computeStatus(i) }))
    const changed = refreshed.some((r, idx) => r.status !== raw[idx].status)
    if (changed) saveToStorage(refreshed)
    return changed ? refreshed : raw
  })
  const [filter, setFilter] = useState<'all' | InvoiceStatus>('all')
  const importRef = useRef<HTMLInputElement>(null)

  const markPaid = useCallback((id: string) => {
    setInvoices(prev => {
      const updated: InvoiceData[] = prev.map(i =>
        i.id === id ? { ...i, status: 'paid', paidAt: Date.now() } : i
      )
      saveToStorage(updated)
      toast.success('Invoice marked as paid!')
      return updated
    })
  }, [])

  // If opened as a pay-invoice link, show the pay view
  if (window.location.pathname === '/pay-invoice') return <PayInvoiceView />

  const persist = (list: InvoiceData[]) => {
    setInvoices(list)
    saveToStorage(list)
  }

  const createInvoice = () => {
    if (!form.amount || !address) return
    const inv: InvoiceData = {
      id:         nextId(),
      token,
      chainId:    invoiceChainId,
      to:         address,
      fromName:   form.fromName.trim(),
      clientName: form.clientName.trim(),
      amount:     form.amount,
      memo:       form.memo,
      dueDate:    form.dueDate,
      createdAt:  Date.now(),
      status:     'unpaid',
    }
    persist([inv, ...invoices])
    setForm({ amount: '', memo: '', dueDate: '', fromName: form.fromName, clientName: '' })
    toast.success(`Invoice ${inv.id} created`)
  }

  const deleteInvoice = (id: string) => {
    persist(invoices.filter(i => i.id !== id))
    toast.success('Invoice removed')
  }

  const exportJSON = () => {
    const blob = new Blob([JSON.stringify(invoices, null, 2)], { type: 'application/json' })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = 'racconpay-invoices.json'
    a.click()
    toast.success(`Exported ${invoices.length} invoice${invoices.length !== 1 ? 's' : ''}`)
  }

  const importJSON = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = ev => {
      try {
        const imported = JSON.parse(ev.target?.result as string) as InvoiceData[]
        if (!Array.isArray(imported)) throw new Error('Invalid format')
        // Merge: keep existing, add new ones not already present by id
        const existing = loadInvoices()
        const existingIds = new Set(existing.map(i => i.id))
        const merged = [...existing, ...imported.filter(i => !existingIds.has(i.id))]
        persist(merged)
        toast.success(`Imported ${imported.length} invoice${imported.length !== 1 ? 's' : ''}`)
      } catch {
        toast.error('Invalid invoice file')
      }
    }
    reader.readAsText(file)
    // Reset input so same file can be re-imported if needed
    e.target.value = ''
  }

  const filtered = filter === 'all' ? invoices : invoices.filter(i => computeStatus(i) === filter)
  const unpaidCount  = invoices.filter(i => computeStatus(i) === 'unpaid').length
  const paidCount    = invoices.filter(i => computeStatus(i) === 'paid').length
  const overdueCount = invoices.filter(i => computeStatus(i) === 'overdue').length

  const cur = (t: TokenSymbol) => invoices.filter(i => invoiceToken(i) === t)
  const sumOf = (list: InvoiceData[]) => { let t = 0n; for (const i of list) { try { t += parseToken(i.amount, TOKENS[invoiceToken(i)].decimals) } catch { /* skip invalid */ } } return t }
  const outstanding = TOKEN_LIST.map(t => ({ sym: t.symbol, raw: sumOf(cur(t.symbol).filter(i => computeStatus(i) !== 'paid')) })).filter(x => x.raw > 0n)
  const paidTotals = TOKEN_LIST.map(t => ({ sym: t.symbol, raw: sumOf(cur(t.symbol).filter(i => computeStatus(i) === 'paid')) })).filter(x => x.raw > 0n)
  const money = (rows: { sym: TokenSymbol; raw: bigint }[]) => rows.length ? rows.map(r => `${formatToken(r.raw, TOKENS[r.sym].decimals)} ${r.sym}`).join(' · ') : '0'
  const nextNumber = `INV-${String((parseInt(localStorage.getItem(LS_CTR_KEY) ?? '0', 10) || 0) + 1).padStart(4, '0')}`
  const previewAmount = form.amount && !isNaN(Number(form.amount)) ? form.amount : '0.00'

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        icon={FileText}
        title="Invoices"
        subtitle="Create a USDC or EURC payment request. Share the link, and the payer connects a wallet and pays in one step."
      />

      <section aria-label="Invoice summary" className="grid grid-cols-1 min-[480px]:grid-cols-3 gap-3">
        <StatCard label="Outstanding" value={money(outstanding)} sub={`${unpaidCount + overdueCount} unpaid invoice${unpaidCount + overdueCount === 1 ? '' : 's'}`} icon={FileText} />
        <StatCard label="Paid" value={money(paidTotals)} sub={`${paidCount} invoice${paidCount === 1 ? '' : 's'}`} icon={CheckCircle2} />
        <StatCard label="Overdue" value={overdueCount.toString()} sub="Past their due date" icon={AlertTriangle} />
      </section>

      <div className="grid grid-cols-1 lg:grid-cols-[1fr_360px] gap-5 items-start">
        {/* Create form */}
        <Card className="p-5 flex flex-col gap-4">
          <h2 className="text-sm font-semibold" style={{ color: 'var(--ink)' }}>New invoice</h2>
          {!address && <AlertBox variant="info">Connect your wallet. Its address becomes the payment destination.</AlertBox>}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Input label="Your name or company" value={form.fromName} onChange={v => setForm(f => ({ ...f, fromName: v }))} placeholder="Acme Ltd" />
            <Input label="Client name (optional)" value={form.clientName} onChange={v => setForm(f => ({ ...f, clientName: v }))} placeholder="John Smith" />
            <div className="flex flex-col gap-1.5">
              <span id="invoice-currency" className="text-xs font-medium" style={{ color: 'var(--ink-2)' }}>Currency</span>
              <div role="radiogroup" aria-labelledby="invoice-currency" className="grid grid-cols-2 gap-2">
                {TOKEN_LIST.map(t => {
                  const on = token === t.symbol
                  return (
                    <button key={t.symbol} type="button" role="radio" aria-checked={on} onClick={() => setToken(t.symbol)}
                      className="min-h-[44px] rounded-lg text-sm font-semibold transition-colors"
                      style={{ background: on ? 'var(--accent-muted)' : 'var(--surface)', color: on ? 'var(--accent)' : 'var(--ink-2)', border: `1px solid ${on ? 'var(--accent)' : 'var(--border-strong)'}` }}>
                      {t.symbol}
                    </button>
                  )
                })}
              </div>
            </div>
            <Input label={`Amount (${token})`} value={form.amount} onChange={v => setForm(f => ({ ...f, amount: v }))} placeholder="50.00" type="number" />
            <DateField label="Due date (optional)" value={form.dueDate} onChange={v => setForm(f => ({ ...f, dueDate: v }))} />
            <div className="sm:col-span-2">
              <Input label="Description" value={form.memo} onChange={v => setForm(f => ({ ...f, memo: v }))} placeholder="Design work, March 2026" />
            </div>
          </div>
          <PrimaryButton onClick={createInvoice} disabled={!form.amount || !address}>
            <Plus size={15} aria-hidden="true" /> Create invoice
          </PrimaryButton>
          {(!form.amount || !address) && <p className="text-xs" style={{ color: 'var(--muted)' }}>{!address ? 'Connect a wallet and enter an amount.' : 'Enter an amount to create the invoice.'}</p>}
        </Card>

        {/* Live preview */}
        <div className="lg:sticky lg:top-24">
          <p className="text-xs font-medium mb-2" style={{ color: 'var(--muted)' }}>Invoice preview</p>
          <Card className="p-5 flex flex-col gap-4" >
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-base font-semibold" style={{ color: 'var(--ink)' }}>{form.fromName || 'Your name or company'}</p>
                <p className="text-xs mt-0.5" style={{ color: 'var(--muted)' }}>Invoice {nextNumber}</p>
              </div>
              <StatusBadge status="draft" />
            </div>
            <dl className="flex flex-col text-sm">
              {([
                ['Bill to', form.clientName || 'Client'],
                ['For', form.memo || '-'],
                ['Due', form.dueDate || 'No due date'],
                ['Network', chainLabel(invoiceChainId)],
              ] as [string, string][]).map(([k, v]) => (
                <div key={k} className="flex items-start justify-between gap-3 py-2" style={{ borderTop: '1px solid var(--border)' }}>
                  <dt style={{ color: 'var(--muted)' }}>{k}</dt>
                  <dd className="font-medium text-right break-words min-w-0" style={{ color: 'var(--ink)' }}>{v}</dd>
                </div>
              ))}
            </dl>
            <div className="rounded-lg p-4" style={{ background: 'var(--surface-muted)' }}>
              <p className="text-xs font-medium" style={{ color: 'var(--muted)' }}>Amount due</p>
              <p className="text-3xl font-semibold tabular-nums tracking-tight mt-1" style={{ color: 'var(--ink)' }}>
                {previewAmount}<span className="text-base font-medium ml-1.5" style={{ color: 'var(--muted)' }}>{token}</span>
              </p>
            </div>
            <div>
              <p className="text-xs font-medium" style={{ color: 'var(--muted)' }}>Pay to</p>
              <p className="text-xs font-mono break-all mt-1" style={{ color: 'var(--ink-2)' }}>{address ?? 'Connect a wallet to set the payment address'}</p>
            </div>
          </Card>
        </div>
      </div>

      {/* History */}
      <section aria-label="Invoice history" className="flex flex-col gap-4">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <h2 className="text-sm font-semibold" style={{ color: 'var(--ink)' }}>Invoice history</h2>
          <div className="flex items-center gap-2">
            <button onClick={exportJSON} disabled={invoices.length === 0} className="min-h-[40px] flex items-center gap-1.5 px-3 rounded-lg text-xs font-semibold hover:bg-[var(--surface-hover)] disabled:opacity-40" style={{ color: 'var(--ink-2)', border: '1px solid var(--border-strong)' }}>
              <ArrowDownToLine size={14} aria-hidden="true" /> Export
            </button>
            <button onClick={() => importRef.current?.click()} className="min-h-[40px] flex items-center gap-1.5 px-3 rounded-lg text-xs font-semibold hover:bg-[var(--surface-hover)]" style={{ color: 'var(--ink-2)', border: '1px solid var(--border-strong)' }}>
              <Upload size={14} aria-hidden="true" /> Import
            </button>
            <input ref={importRef} type="file" accept=".json" className="hidden" aria-label="Import invoices JSON file" onChange={importJSON} />
          </div>
        </div>

        {invoices.length > 0 && (
          <div role="tablist" aria-label="Filter invoices" className="flex items-center gap-1 overflow-x-auto no-scrollbar" style={{ borderBottom: '1px solid var(--border)' }}>
            {(['all', 'unpaid', 'paid', 'overdue'] as const).map(f => {
              const n = f === 'all' ? invoices.length : f === 'unpaid' ? unpaidCount : f === 'paid' ? paidCount : overdueCount
              return (
                <button key={f} role="tab" aria-selected={filter === f} onClick={() => setFilter(f)}
                  className="px-4 min-h-[44px] text-sm font-medium whitespace-nowrap -mb-px transition-colors"
                  style={{ color: filter === f ? 'var(--accent)' : 'var(--muted)', borderBottom: `2px solid ${filter === f ? 'var(--accent)' : 'transparent'}` }}>
                  {f.charAt(0).toUpperCase() + f.slice(1)} <span className="tabular-nums">({n})</span>
                </button>
              )
            })}
          </div>
        )}

        {filtered.length > 0
          ? <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">{filtered.map(inv => <InvoiceCard key={inv.id} inv={inv} onDelete={deleteInvoice} onMarkPaid={markPaid} />)}</div>
          : <Card><EmptyState icon={FileText} title={invoices.length ? 'No invoices in this view' : 'No invoices yet'} body={invoices.length ? 'Pick another filter.' : 'Create your first invoice above, or import invoices you exported earlier.'} /></Card>}
      </section>
    </div>
  )
}
