/**
 * Withdrawable balances held by the escrow for you: dispute payouts, and payouts that could not be
 * sent directly (for example when a token issuer blocked the recipient). Shown only when non-zero.
 */
import { useEffect } from 'react'
import { useReadContracts, useWaitForTransactionReceipt, useWriteContract } from 'wagmi'
import { toast } from 'sonner'
import { Card, PrimaryButton } from '../ui'
import { ARC_CHAIN_ID, ESCROW_ADDRESS } from '../../constants'
import { ESCROW_ABI } from '../../abisEscrow'
import { TOKEN_LIST, tokenAddress } from '../../tokens'
import { formatToken } from '../../utils'

export default function EscrowCredits({ address }: { address: `0x${string}` }) {
  const tokens = TOKEN_LIST.flatMap(t => {
    const addr = tokenAddress(t.symbol, ARC_CHAIN_ID)
    return addr ? [{ ...t, addr }] : []
  })

  const { data, refetch } = useReadContracts({
    contracts: tokens.map(t => ({
      address: ESCROW_ADDRESS, abi: ESCROW_ABI, functionName: 'creditOf' as const,
      args: [address, t.addr] as const, chainId: ARC_CHAIN_ID,
    })),
    query: { refetchInterval: 20_000 },
  })

  const { writeContract, data: hash, isPending, reset } = useWriteContract()
  const { isLoading: confirming, isSuccess } = useWaitForTransactionReceipt({ hash })
  useEffect(() => {
    if (!isSuccess) return
    toast.success('Withdrawal confirmed')
    void refetch()
    reset()
  }, [isSuccess, refetch, reset])

  const rows = tokens
    .map((t, i) => ({ t, amount: data?.[i]?.status === 'success' ? data[i].result : 0n }))
    .filter(r => r.amount > 0n)

  if (rows.length === 0) return null

  return (
    <Card className="p-4 flex flex-col gap-3">
      <p className="text-[10px] font-bold uppercase tracking-[0.12em]" style={{ color: 'var(--subtle)' }}>
        Ready to withdraw
      </p>
      {rows.map(({ t, amount }) => (
        <div key={t.symbol} className="flex items-center justify-between gap-3">
          <span className="font-display font-bold tabular-nums" style={{ color: 'var(--ink)' }}>
            {formatToken(amount, t.decimals)} {t.symbol}
          </span>
          <div className="w-40">
            <PrimaryButton
              loading={isPending || confirming}
              onClick={() => writeContract({
                address: ESCROW_ADDRESS, abi: ESCROW_ABI, functionName: 'withdraw',
                args: [t.addr], chainId: ARC_CHAIN_ID,
              })}
            >
              Withdraw
            </PrimaryButton>
          </div>
        </div>
      ))}
    </Card>
  )
}
