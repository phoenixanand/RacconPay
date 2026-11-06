/**
 * Bulk stream creation from a CSV: address, amount (USDC), days, optional label.
 * One USDC approval for the total, then one transaction per stream with live status.
 * Labels are saved to this browser only, never on-chain.
 */
import { useRef, useState } from 'react'
import Papa from 'papaparse'
import { useReadContract, useWriteContract, usePublicClient } from 'wagmi'
import { toast } from 'sonner'
import { Upload, Download, CheckCircle2, XCircle, Loader2, AlertTriangle, ExternalLink } from 'lucide-react'

import { Card, Label, PrimaryButton, GhostButton } from '../ui'
import { USDC_ADDRESS, explorerTxFor } from '../../constants'
import { ERC20_ABI } from '../../abis'
import { VESTING_STREAM_V2_ABI } from '../../abisV2'
import { parseUsdc, formatUsdc, shortAddr } from '../../utils'
import { friendlyError } from './shared'
import { useLabels } from './labels'
import { downloadText } from './exportCsv'

const MAX_ROWS = 200
const TEMPLATE = 'address,amount_usdc,days,label\n0x0000000000000000000000000000000000000001,1200.00,365,Example employee\n'

interface Row { line: number; address: string; amount: bigint; days: number; label: string; error?: string }
type RowState = { phase: 'idle' | 'signing' | 'confirming' | 'done' | 'failed'; hash?: string; error?: string }

function parseRows(data: string[][]): Row[] {
  let start = 0
  if (data[0] && !/^0x[0-9a-fA-F]{40}$/.test((data[0][0] ?? '').trim())) start = 1 // header row
  const seen = new Set<string>()
  return data.slice(start, start + MAX_ROWS).map((cells, i) => {
    const address = (cells[0] ?? '').trim()
    const row: Row = { line: start + i + 1, address, amount: 0n, days: 0, label: (cells[3] ?? '').trim().slice(0, 80) }
    if (!/^0x[0-9a-fA-F]{40}$/.test(address) || /^0x0{40}$/.test(address)) row.error = 'Invalid address'
    else if (seen.has(address.toLowerCase())) row.error = 'Duplicate address in this file'
    seen.add(address.toLowerCase())
    try { row.amount = parseUsdc((cells[1] ?? '').trim()); if (row.amount === 0n) row.error ??= 'Amount must be more than zero' }
    catch { row.error ??= 'Invalid amount' }
    const days = Number((cells[2] ?? '').trim())
    if (!Number.isFinite(days) || days <= 0 || days > 3650) row.error ??= 'Days must be between 0 and 3650'
    else row.days = days
    return row
  })
}

export default function BulkCreate({ address, chainId, vestingAddress, onCreated }: {
  address: `0x${string}`
  chainId: number
  vestingAddress: `0x${string}`
  onCreated: () => void
}) {
  const [rows, setRows] = useState<Row[]>([])
  const [states, setStates] = useState<Record<number, RowState>>({})
  const [running, setRunning] = useState(false)
  const [fileName, setFileName] = useState('')
  const fileRef = useRef<HTMLInputElement>(null)
  const { setLabel } = useLabels()
  const client = usePublicClient({ chainId })
  const { writeContractAsync } = useWriteContract()

  const { data: balance } = useReadContract({ address: USDC_ADDRESS, abi: ERC20_ABI, functionName: 'balanceOf', args: [address], chainId })
  const { data: allowance, refetch: refetchAllowance } = useReadContract({
    address: USDC_ADDRESS, abi: ERC20_ABI, functionName: 'allowance', args: [address, vestingAddress], chainId,
  })

  const valid = rows.filter(r => !r.error)
  const todo = valid.filter(r => states[r.line]?.phase !== 'done')
  const total = todo.reduce((a, r) => a + r.amount, 0n)
  const insufficient = balance !== undefined && total > balance
  const doneCount = valid.length - todo.length

  function setRow(line: number, s: RowState) { setStates(prev => ({ ...prev, [line]: s })) }

  function onFile(file: File | undefined) {
    if (!file) return
    setFileName(file.name)
    setStates({})
    Papa.parse<string[]>(file, {
      skipEmptyLines: true,
      complete: res => {
        const parsed = parseRows(res.data)
        setRows(parsed)
        if (res.data.length > MAX_ROWS + 1) toast.warning(`Only the first ${MAX_ROWS} rows were read`)
      },
      error: () => toast.error('Could not read that file'),
    })
  }

  async function wait(hash: `0x${string}`) {
    const receipt = await client?.waitForTransactionReceipt({ hash })
    if (!receipt || receipt.status !== 'success') throw new Error('Transaction failed')
  }

  async function run() {
    if (!client || todo.length === 0) return
    setRunning(true)
    try {
      if ((allowance ?? 0n) < total) {
        const hash = await writeContractAsync({ address: USDC_ADDRESS, abi: ERC20_ABI, functionName: 'approve', args: [vestingAddress, total], chainId })
        await wait(hash)
        await refetchAllowance()
      }
      for (const r of todo) {
        setRow(r.line, { phase: 'signing' })
        try {
          const hash = await writeContractAsync({
            address: vestingAddress, abi: VESTING_STREAM_V2_ABI, functionName: 'createStream',
            args: [r.address as `0x${string}`, r.amount, BigInt(Math.floor(r.days * 86400))], chainId,
          })
          setRow(r.line, { phase: 'confirming', hash })
          await wait(hash)
          if (r.label) setLabel(r.address, { name: r.label })
          setRow(r.line, { phase: 'done', hash })
        } catch (e) {
          const msg = friendlyError(e)
          setRow(r.line, { phase: 'failed', error: msg })
          if (msg === 'Cancelled in wallet') break // stop the batch when the user rejects
        }
      }
      onCreated()
    } catch (e) {
      toast.error(friendlyError(e))
    } finally {
      setRunning(false)
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <Card className="p-5 flex flex-col gap-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <Label>Upload payees (CSV)</Label>
            <p className="text-xs mt-1 text-pretty" style={{ color: 'var(--subtle)' }}>
              Columns: address, amount_usdc, days, label (optional). Up to {MAX_ROWS} rows. Labels stay in this browser and are never written on-chain.
            </p>
          </div>
          <div className="flex gap-2">
            <GhostButton onClick={() => downloadText('racconpay-bulk-template.csv', TEMPLATE)}><Download size={13} /> Template</GhostButton>
            <GhostButton onClick={() => fileRef.current?.click()} disabled={running}><Upload size={13} /> {fileName || 'Choose file'}</GhostButton>
            <input ref={fileRef} type="file" accept=".csv,text/csv" className="hidden" onChange={e => onFile(e.target.files?.[0])} />
          </div>
        </div>
      </Card>

      {rows.length > 0 && (
        <>
          <Card className="overflow-x-auto">
            <table className="w-full min-w-[620px] text-sm">
              <thead>
                <tr className="border-b border-[var(--border)] text-left text-[10px] uppercase tracking-[0.1em]" style={{ color: 'var(--subtle)' }}>
                  <th className="px-4 py-2.5">#</th><th className="px-4 py-2.5">Payee</th>
                  <th className="px-4 py-2.5 text-right">USDC</th><th className="px-4 py-2.5 text-right">Days</th><th className="px-4 py-2.5">Status</th>
                </tr>
              </thead>
              <tbody>
                {rows.map(r => {
                  const st = states[r.line]
                  return (
                    <tr key={r.line} className="border-b border-[var(--border)] last:border-0">
                      <td className="px-4 py-2.5 tabular-nums" style={{ color: 'var(--subtle)' }}>{r.line}</td>
                      <td className="px-4 py-2.5">
                        <span style={{ color: 'var(--ink)' }}>{r.label || shortAddr(r.address)}</span>
                        {r.label && <span className="ml-2 font-mono text-xs" style={{ color: 'var(--subtle)' }}>{shortAddr(r.address)}</span>}
                      </td>
                      <td className="px-4 py-2.5 text-right tabular-nums" style={{ color: 'var(--ink)' }}>{r.error ? '—' : formatUsdc(r.amount)}</td>
                      <td className="px-4 py-2.5 text-right tabular-nums" style={{ color: 'var(--ink-2)' }}>{r.error ? '—' : r.days}</td>
                      <td className="px-4 py-2.5 text-xs">
                        {r.error ? <span style={{ color: 'var(--danger)' }}>{r.error}</span>
                          : st?.phase === 'done' ? <span className="inline-flex items-center gap-1" style={{ color: 'var(--success)' }}><CheckCircle2 size={13} /> Created
                              {st.hash && <a href={explorerTxFor(chainId, st.hash)} target="_blank" rel="noreferrer" aria-label="View transaction"><ExternalLink size={11} /></a>}</span>
                          : st?.phase === 'failed' ? <span className="inline-flex items-center gap-1" style={{ color: 'var(--danger)' }}><XCircle size={13} /> {st.error}</span>
                          : st?.phase === 'signing' ? <span className="inline-flex items-center gap-1" style={{ color: 'var(--muted)' }}><Loader2 size={12} className="animate-spin" /> Waiting for wallet</span>
                          : st?.phase === 'confirming' ? <span className="inline-flex items-center gap-1" style={{ color: 'var(--muted)' }}><Loader2 size={12} className="animate-spin" /> Confirming</span>
                          : <span style={{ color: 'var(--subtle)' }}>Ready</span>}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </Card>

          <Card strong className="p-5 flex flex-col gap-3">
            <div className="flex flex-wrap items-center justify-between gap-3 text-sm">
              <span style={{ color: 'var(--muted)' }}>
                {valid.length} valid of {rows.length} rows{doneCount > 0 ? ` · ${doneCount} created` : ''}
              </span>
              <span className="tabular-nums font-semibold" style={{ color: 'var(--ink)' }}>
                {formatUsdc(total)} USDC to lock <span className="font-normal" style={{ color: 'var(--subtle)' }}>· balance {balance !== undefined ? formatUsdc(balance) : '—'}</span>
              </span>
            </div>
            {insufficient && (
              <div className="flex items-start gap-2 rounded-xl px-3 py-2.5 text-xs" style={{ background: 'var(--danger-muted)', color: 'var(--danger)' }}>
                <AlertTriangle size={13} className="shrink-0 mt-0.5" /> Your balance is lower than the total. Add USDC first.
              </div>
            )}
            <p className="text-xs text-pretty" style={{ color: 'var(--subtle)' }}>
              You will sign one USDC approval for the total, then one transaction per stream. If one fails, the rest continue and you can retry the failed rows.
            </p>
            <PrimaryButton onClick={() => void run()} loading={running} disabled={todo.length === 0 || insufficient}>
              {running ? 'Creating streams…' : todo.length === valid.length ? `Create ${todo.length} streams` : `Retry ${todo.length} remaining`}
            </PrimaryButton>
          </Card>
        </>
      )}
    </div>
  )
}
