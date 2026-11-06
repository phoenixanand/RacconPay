/**
 * Create a milestone escrow: choose USDC or EURC, a payee, an optional arbiter and milestone amounts.
 * Two real transactions: approve the exact total, then createEscrow (which funds every milestone).
 */
import { useEffect, useState } from 'react'
import { useAccount, useReadContract, useWaitForTransactionReceipt, useWriteContract } from 'wagmi'
import { erc20Abi, isAddress, zeroAddress } from 'viem'
import { Plus, Trash2, Lock } from 'lucide-react'
import { toast } from 'sonner'
import { Card, Input, PrimaryButton, GhostButton, AlertBox, TxStatus } from '../ui'
import { ARC_CHAIN_ID, ESCROW_ADDRESS, explorerTxFor } from '../../constants'
import { ESCROW_ABI } from '../../abisEscrow'
import { TOKEN_LIST, TOKENS, tokenAddress, type TokenSymbol } from '../../tokens'
import { formatToken, parseToken } from '../../utils'
import { useNow } from './useEscrows'

const DAY = 86_400
const MAX_MILESTONES = 20

function addDays(days: number): string {
  const d = new Date(Date.now() + days * DAY * 1000)
  return d.toISOString().slice(0, 10)
}

function errorText(e: unknown): string {
  const msg = e instanceof Error ? e.message : String(e)
  if (msg.toLowerCase().includes('user rejected')) return 'Request cancelled in your wallet.'
  return msg.length > 140 ? `${msg.slice(0, 140)}…` : msg
}

export default function CreateEscrow({ onCreated }: { onCreated: () => void }) {
  const { address } = useAccount()
  const [token, setToken] = useState<TokenSymbol>('USDC')
  const [payee, setPayee] = useState('')
  const [arbiter, setArbiter] = useState('')
  const [memo, setMemo] = useState('')
  const [amounts, setAmounts] = useState<string[]>([''])
  const [windowDays, setWindowDays] = useState('7')
  const [deadlineDate, setDeadlineDate] = useState(() => addDays(30))
  const [error, setError] = useState<string | null>(null)

  const tokenAddr = tokenAddress(token, ARC_CHAIN_ID)
  const decimals = TOKENS[token].decimals

  // Parse inputs
  const parsed = amounts.map(a => { try { return a ? parseToken(a, decimals) : 0n } catch { return 0n } })
  const total = parsed.reduce((s, v) => s + v, 0n)
  const allAmountsValid = parsed.length > 0 && parsed.every(v => v > 0n)
  const windowSec = Number(windowDays) * DAY
  const windowValid = Number.isInteger(Number(windowDays)) && Number(windowDays) >= 1 && Number(windowDays) <= 90
  const deadlineSec = Math.floor(new Date(`${deadlineDate}T23:59:59Z`).getTime() / 1000)
  const nowSec = useNow()
  const deadlineValid = Number.isFinite(deadlineSec) && BigInt(deadlineSec) > nowSec
  const payeeValid = isAddress(payee) && payee.toLowerCase() !== address?.toLowerCase()
  const arbiterBlank = arbiter.trim() === ''
  const arbiterValid = arbiterBlank || (
    isAddress(arbiter)
    && arbiter.toLowerCase() !== address?.toLowerCase()
    && arbiter.toLowerCase() !== payee.toLowerCase()
  )
  const formValid = payeeValid && arbiterValid && allAmountsValid && windowValid && deadlineValid && !!tokenAddr

  const { data: balance } = useReadContract({
    address: tokenAddr, abi: erc20Abi, functionName: 'balanceOf',
    args: address ? [address] : undefined, chainId: ARC_CHAIN_ID,
    query: { enabled: !!address && !!tokenAddr },
  })
  const { data: allowance, refetch: refetchAllowance } = useReadContract({
    address: tokenAddr, abi: erc20Abi, functionName: 'allowance',
    args: address ? [address, ESCROW_ADDRESS] : undefined, chainId: ARC_CHAIN_ID,
    query: { enabled: !!address && !!tokenAddr },
  })

  const { writeContract: approve, data: approveHash, isPending: approving, reset: resetApprove } = useWriteContract()
  const { isLoading: approveConfirming, isSuccess: approved } = useWaitForTransactionReceipt({ hash: approveHash })
  const { writeContract: create, data: createHash, isPending: creating, reset: resetCreate } = useWriteContract()
  const { isLoading: createConfirming, isSuccess: created } = useWaitForTransactionReceipt({ hash: createHash })

  useEffect(() => { if (approved) void refetchAllowance() }, [approved, refetchAllowance])
  useEffect(() => {
    if (!created) return
    // The parent closes this form on creation, which clears every field.
    toast.success('Escrow created and funded')
    onCreated()
  }, [created, onCreated])

  const needsApproval = allowance !== undefined && total > 0n && allowance < total
  const insufficient = balance !== undefined && total > balance

  const doApprove = () => {
    if (!tokenAddr) return
    setError(null)
    resetCreate()
    approve(
      { address: tokenAddr, abi: erc20Abi, functionName: 'approve', args: [ESCROW_ADDRESS, total], chainId: ARC_CHAIN_ID },
      { onError: e => setError(errorText(e)) },
    )
  }

  const doCreate = () => {
    if (!tokenAddr || !formValid) return
    setError(null)
    resetApprove()
    create(
      {
        address: ESCROW_ADDRESS, abi: ESCROW_ABI, functionName: 'createEscrow',
        args: [
          payee,
          arbiterBlank ? zeroAddress : (arbiter as `0x${string}`),
          tokenAddr, parsed, BigInt(windowSec), BigInt(deadlineSec), memo.trim(),
        ],
        chainId: ARC_CHAIN_ID,
      },
      { onError: e => setError(errorText(e)) },
    )
  }

  const setAmount = (i: number, v: string) => setAmounts(a => a.map((x, j) => (j === i ? v : x)))

  return (
    <Card className="p-5 flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <h3 className="font-display font-semibold text-base" style={{ color: 'var(--ink)' }}>New escrow</h3>
        <div className="flex gap-2">
          {TOKEN_LIST.map(t => (
            <button
              key={t.symbol}
              type="button"
              onClick={() => setToken(t.symbol)}
              className="px-3 py-1 rounded-full text-xs font-semibold transition-all"
              style={{
                background: token === t.symbol ? 'var(--accent)' : 'var(--surface-strong)',
                color:      token === t.symbol ? '#fff' : 'var(--muted)',
              }}
            >
              {t.symbol}
            </button>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <Input label="Payee (receives funds)" value={payee} onChange={setPayee} placeholder="0x…" mono />
        <Input label="Arbiter (optional, resolves disputes)" value={arbiter} onChange={setArbiter} placeholder="0x… or leave blank" mono />
        <Input label="Review window (days, 1 to 90)" value={windowDays} onChange={setWindowDays} type="number" />
        <Input label="Refund deadline (unstarted milestones)" value={deadlineDate} onChange={setDeadlineDate} type="date" />
        <Input label="Memo" value={memo} onChange={setMemo} placeholder="Website redesign" className="sm:col-span-2" />
      </div>

      {payee && !payeeValid && <AlertBox variant="danger">Enter a valid payee address that is not your own.</AlertBox>}
      {!arbiterValid && <AlertBox variant="danger">Arbiter must be a valid address, different from you and the payee.</AlertBox>}
      {arbiterBlank && (
        <AlertBox variant="info">
          No arbiter: the payer can only approve milestones, and the payee can collect after the review window. Disputes are disabled.
        </AlertBox>
      )}

      <div className="flex flex-col gap-2">
        <p className="text-[10px] font-semibold uppercase tracking-[0.1em]" style={{ color: 'var(--subtle)' }}>
          Milestones ({amounts.length} of {MAX_MILESTONES})
        </p>
        {amounts.map((a, i) => (
          <div key={i} className="flex items-center gap-2">
            <span className="w-6 text-xs tabular-nums" style={{ color: 'var(--subtle)' }}>{i + 1}</span>
            <div className="flex-1">
              <Input value={a} onChange={v => setAmount(i, v)} placeholder={`Amount in ${token}`} type="number" />
            </div>
            <button
              onClick={() => setAmounts(x => x.filter((_, j) => j !== i))}
              disabled={amounts.length === 1}
              className="p-2 rounded-lg disabled:opacity-30"
              style={{ color: 'var(--danger)' }}
              aria-label={`Remove milestone ${i + 1}`}
            >
              <Trash2 size={15} />
            </button>
          </div>
        ))}
        <GhostButton onClick={() => setAmounts(a => [...a, ''])} disabled={amounts.length >= MAX_MILESTONES}>
          <Plus size={14} /> Add milestone
        </GhostButton>
      </div>

      <div className="flex items-center justify-between rounded-xl px-4 py-3"
        style={{ background: 'var(--surface-muted)', border: '1px solid var(--border)' }}>
        <span className="text-sm" style={{ color: 'var(--muted)' }}>Total to lock now</span>
        <span className="font-display font-bold text-lg tabular-nums" style={{ color: 'var(--ink)' }}>
          {formatToken(total, decimals)} {token}
        </span>
      </div>
      {balance !== undefined && (
        <p className="text-xs" style={{ color: insufficient ? 'var(--danger)' : 'var(--subtle)' }}>
          Your {token} balance: {formatToken(balance, decimals)}{insufficient ? ' (not enough)' : ''}
        </p>
      )}

      {error && <AlertBox variant="danger">{error}</AlertBox>}

      {needsApproval ? (
        <PrimaryButton onClick={doApprove} loading={approving || approveConfirming} disabled={!formValid || insufficient}>
          Step 1 of 2: approve {formatToken(total, decimals)} {token}
        </PrimaryButton>
      ) : (
        <PrimaryButton onClick={doCreate} loading={creating || createConfirming} disabled={!formValid || insufficient || !address}>
          <Lock size={14} /> {allowance !== undefined && total > 0n ? 'Step 2 of 2: ' : ''}Lock {formatToken(total, decimals)} {token} in escrow
        </PrimaryButton>
      )}

      <TxStatus
        isPending={approving || creating}
        isConfirming={approveConfirming || createConfirming}
        isSuccess={created}
        hash={createHash}
        explorerUrl={h => explorerTxFor(ARC_CHAIN_ID, h)}
        successMsg="Escrow funded"
      />
    </Card>
  )
}
