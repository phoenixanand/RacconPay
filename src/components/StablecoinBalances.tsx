/**
 * USDC and EURC balances for the connected wallet on Arc Mainnet and Arc Testnet.
 * Reads the ERC-20 interface only (6 decimals), never the 18-decimal native view.
 */
import { useAccount, useReadContracts } from 'wagmi'
import { erc20Abi } from 'viem'
import { RefreshCw } from 'lucide-react'
import { ARC_CHAIN_ID, ARC_TESTNET_CHAIN_ID, chainLabel } from '../constants'
import { TOKEN_LIST, tokenAddress } from '../tokens'
import { formatToken } from '../utils'
import { Card } from './ui'

const CHAINS = [ARC_CHAIN_ID, ARC_TESTNET_CHAIN_ID] as const

export default function StablecoinBalances({ address }: { address: `0x${string}` }) {
  const { isConnected } = useAccount()

  const calls = CHAINS.flatMap(chainId =>
    TOKEN_LIST.flatMap(t => {
      const addr = tokenAddress(t.symbol, chainId)
      return addr
        ? [{ chainId, symbol: t.symbol, decimals: t.decimals, address: addr }]
        : []
    }),
  )

  const { data, isLoading, refetch } = useReadContracts({
    contracts: calls.map(c => ({
      address: c.address,
      abi: erc20Abi,
      functionName: 'balanceOf' as const,
      args: [address] as const,
      chainId: c.chainId,
    })),
    query: { enabled: isConnected, refetchInterval: 30_000 },
  })

  return (
    <Card className="p-4 flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <p className="text-[10px] font-bold uppercase tracking-[0.12em]" style={{ color: 'var(--subtle)' }}>
          Stablecoin balances
        </p>
        <button
          onClick={() => void refetch()}
          className="flex items-center justify-center w-6 h-6 rounded-full transition-opacity hover:opacity-70"
          style={{ color: 'var(--muted)' }}
          title="Refresh balances"
        >
          <RefreshCw size={12} />
        </button>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {CHAINS.map(chainId => (
          <div key={chainId} className="rounded-xl p-3 flex flex-col gap-2"
            style={{ background: 'var(--surface-muted)', border: '1px solid var(--border)' }}>
            <p className="text-xs font-semibold" style={{ color: 'var(--ink-2)' }}>{chainLabel(chainId)}</p>
            {calls.map((c, i) => {
              if (c.chainId !== chainId) return null
              const r = data?.[i]
              const value = r?.status === 'success' ? formatToken(r.result, c.decimals) : isLoading ? '…' : '-'
              return (
                <div key={c.symbol} className="flex items-center justify-between text-sm">
                  <span style={{ color: 'var(--muted)' }}>{c.symbol}</span>
                  <span className="font-semibold tabular-nums" style={{ color: 'var(--ink)' }}>{value}</span>
                </div>
              )
            })}
          </div>
        ))}
      </div>
    </Card>
  )
}
