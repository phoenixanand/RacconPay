/**
 * Reads every escrow an address takes part in (payer, payee or arbiter) from MilestoneEscrow
 * on Arc Mainnet, together with each escrow's milestones. All values come from contract state.
 */
import { useCallback, useEffect, useState } from 'react'
import { useReadContract, useReadContracts } from 'wagmi'
import { ARC_CHAIN_ID, ESCROW_ADDRESS } from '../../constants'
import { ESCROW_ABI } from '../../abisEscrow'

export const MILESTONE_STATUS = ['Funded', 'Submitted', 'Released', 'Disputed', 'Resolved', 'Refunded'] as const
export type MilestoneStatus = typeof MILESTONE_STATUS[number]

export interface MilestoneView {
  index: number
  amount: bigint
  status: MilestoneStatus
  submittedAt: bigint
  disputedAt: bigint
  evidenceHash: `0x${string}`
}

export interface EscrowView {
  id: bigint
  payer: `0x${string}`
  payee: `0x${string}`
  arbiter: `0x${string}`
  token: `0x${string}`
  reviewWindow: bigint
  deadline: bigint
  memo: string
  payerConfirmed: boolean
  payeeConfirmed: boolean
  cancelled: boolean
  milestones: MilestoneView[]
}

export const DISPUTE_TIMEOUT_SECONDS = 30n * 24n * 60n * 60n

/** Current unix time in seconds, refreshed on an interval so deadline-based buttons stay accurate. */
export function useNow(intervalMs = 15_000): bigint {
  const [now, setNow] = useState(() => BigInt(Math.floor(Date.now() / 1000)))
  useEffect(() => {
    const t = setInterval(() => setNow(BigInt(Math.floor(Date.now() / 1000))), intervalMs)
    return () => clearInterval(t)
  }, [intervalMs])
  return now
}

export function useEscrows(address: `0x${string}`) {
  const idsQ = useReadContract({
    address: ESCROW_ADDRESS, abi: ESCROW_ABI, functionName: 'escrowsOf',
    args: [address], chainId: ARC_CHAIN_ID,
    query: { refetchInterval: 20_000 },
  })
  const ids = idsQ.data ?? []

  const escrowsQ = useReadContracts({
    contracts: ids.map(id => ({
      address: ESCROW_ADDRESS, abi: ESCROW_ABI, functionName: 'getEscrow' as const,
      args: [id] as const, chainId: ARC_CHAIN_ID,
    })),
    query: { enabled: ids.length > 0, refetchInterval: 20_000 },
  })

  const msCalls: { id: bigint; index: number }[] = []
  ids.forEach((id, i) => {
    const r = escrowsQ.data?.[i]
    if (r?.status !== 'success') return
    for (let m = 0; m < Number(r.result.milestoneCount); m++) msCalls.push({ id, index: m })
  })

  const msQ = useReadContracts({
    contracts: msCalls.map(c => ({
      address: ESCROW_ADDRESS, abi: ESCROW_ABI, functionName: 'getMilestone' as const,
      args: [c.id, BigInt(c.index)] as const, chainId: ARC_CHAIN_ID,
    })),
    query: { enabled: msCalls.length > 0, refetchInterval: 20_000 },
  })

  const escrows: EscrowView[] = []
  let cursor = 0
  ids.forEach((id, i) => {
    const r = escrowsQ.data?.[i]
    if (r?.status !== 'success') return
    const e = r.result
    const milestones: MilestoneView[] = []
    for (let m = 0; m < Number(e.milestoneCount); m++) {
      const mr = msQ.data?.[cursor++]
      if (mr?.status !== 'success') continue
      milestones.push({
        index: m,
        amount: mr.result.amount,
        status: MILESTONE_STATUS[mr.result.status] ?? 'Funded',
        submittedAt: mr.result.submittedAt,
        disputedAt: mr.result.disputedAt,
        evidenceHash: mr.result.evidenceHash,
      })
    }
    escrows.push({
      id, payer: e.payer, payee: e.payee, arbiter: e.arbiter, token: e.token,
      reviewWindow: BigInt(e.reviewWindow), deadline: BigInt(e.deadline), memo: e.memo,
      payerConfirmed: e.payerConfirmed, payeeConfirmed: e.payeeConfirmed, cancelled: e.cancelled,
      milestones,
    })
  })

  const refetchIds = idsQ.refetch
  const refetchEscrows = escrowsQ.refetch
  const refetchMs = msQ.refetch
  const refetch = useCallback(() => {
    void refetchIds().then(() => refetchEscrows()).then(() => refetchMs())
  }, [refetchIds, refetchEscrows, refetchMs])

  return {
    escrows: escrows.sort((a, b) => (a.id < b.id ? 1 : -1)),
    isLoading: idsQ.isLoading || (ids.length > 0 && (escrowsQ.isLoading || msQ.isLoading)),
    refetch,
  }
}
