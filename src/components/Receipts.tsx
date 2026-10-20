/**
 * Receipts page — Arc Dark redesign.
 * Shows all ReceiptNFT tokens (soul-bound) for the connected wallet.
 */

import { useAccount, useReadContract, useReadContracts } from 'wagmi'
import { Layers, ExternalLink, Shield } from 'lucide-react'

import ChainGuard from './ChainGuard'
import { RECEIPT_NFT_ADDRESS, ARC_CHAIN_ID, explorerAddr } from '../constants'
import { RECEIPT_NFT_ABI } from '../abis'
import { formatUsdc, shortHash } from '../utils'
import { Card, Label, Badge, PageHeader } from './ui'

export default function ReceiptsPage() {
  return <ChainGuard><Inner /></ChainGuard>
}

function Inner() {
  const { address } = useAccount()

  const { data: tokenIds, isLoading: idsLoading } = useReadContract({
    address: RECEIPT_NFT_ADDRESS, abi: RECEIPT_NFT_ABI, functionName: 'receiptsOf',
    args: [address!], chainId: ARC_CHAIN_ID, query: { enabled: !!address },
  })

  const { data: receipts, isLoading: receiptsLoading } = useReadContracts({
    contracts: (tokenIds ?? []).map(id => ({
      address: RECEIPT_NFT_ADDRESS as `0x${string}`,
      abi: RECEIPT_NFT_ABI,
      functionName: 'getReceipt' as const,
      args: [id] as const,
      chainId: ARC_CHAIN_ID,
    })),
    query: { enabled: (tokenIds?.length ?? 0) > 0 },
  })

  const loading = idsLoading || receiptsLoading

  return (
    <div className="flex flex-col gap-6">
      <PageHeader icon={Layers} title="Receipts" subtitle="Soul-bound NFT proofs minted after each batch payout." />

      {loading && (
        <div className="flex flex-col gap-3">
          {[1, 2, 3].map(i => (
            <div key={i} className="h-28 rounded-2xl animate-pulse" style={{ background: 'var(--surface)' }} />
          ))}
        </div>
      )}

      {!loading && (!tokenIds || tokenIds.length === 0) && (
        <Card className="flex flex-col items-center gap-4 py-16 text-center">
          <div className="w-14 h-14 rounded-2xl flex items-center justify-center"
               style={{ background: 'var(--surface-strong)', border: '1px solid var(--border-strong)' }}>
            <Layers size={24} style={{ color: 'var(--subtle)' }} />
          </div>
          <div>
            <p className="font-semibold text-sm" style={{ color: 'var(--ink)' }}>No receipts yet</p>
            <p className="text-sm mt-1" style={{ color: 'var(--muted)' }}>Send a batch payout to mint your first receipt.</p>
          </div>
        </Card>
      )}

      {!loading && tokenIds && tokenIds.length > 0 && (
        <div className="grid md:grid-cols-2 gap-4">
          {tokenIds.map((id, i) => {
            const result = receipts?.[i]
            if (!result || result.status !== 'success') return null
            const d = result.result
            const date = new Date(Number(d.timestamp) * 1000).toLocaleString()

            return (
              <Card key={id.toString()} className="p-5 flex flex-col gap-4">
                {/* Top row */}
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-2">
                    <div className="w-8 h-8 rounded-lg flex items-center justify-center"
                         style={{ background: 'var(--accent-glow)', border: '1px solid var(--border-strong)' }}>
                      <Layers size={14} style={{ color: 'var(--accent)' }} />
                    </div>
                    <span className="font-mono text-xs" style={{ color: 'var(--subtle)' }}>
                      Receipt #{id.toString()}
                    </span>
                  </div>
                  <a href={explorerAddr(RECEIPT_NFT_ADDRESS)} target="_blank" rel="noreferrer"
                     className="p-1.5 rounded-lg transition-colors hover:bg-white/5"
                     style={{ color: 'var(--subtle)' }}>
                    <ExternalLink size={14} />
                  </a>
                </div>

                {/* Amount hero */}
                <div>
                  <Label>Batch total</Label>
                  <div className="font-display font-bold text-2xl tabular-nums mt-0.5"
                       style={{ color: 'var(--ink)', letterSpacing: '-0.03em' }}>
                    {formatUsdc(d.batchTotal)}
                    <span className="text-base font-normal ml-1.5" style={{ color: 'var(--subtle)' }}>USDC</span>
                  </div>
                </div>

                {/* Metadata grid */}
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label>Recipients</Label>
                    <p className="text-sm font-semibold mt-0.5 tabular-nums" style={{ color: 'var(--ink-2)' }}>
                      {d.recipientCount.toString()}
                    </p>
                  </div>
                  <div>
                    <Label>Date</Label>
                    <p className="text-sm mt-0.5" style={{ color: 'var(--ink-2)' }}>{date}</p>
                  </div>
                  <div className="col-span-2">
                    <Label>List Hash</Label>
                    <p className="font-mono text-xs mt-0.5 break-all" style={{ color: 'var(--muted)' }}>
                      {shortHash(d.listHash)}
                    </p>
                  </div>
                </div>

                {/* Soul-bound badge */}
                <div className="flex items-center gap-1.5">
                  <Shield size={12} style={{ color: 'var(--subtle)' }} />
                  <Badge variant="default">Soul-bound · Non-transferable</Badge>
                </div>
              </Card>
            )
          })}
        </div>
      )}
    </div>
  )
}
