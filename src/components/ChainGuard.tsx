/**
 * Renders children only when the wallet is connected and on the required Arc network
 * (Arc Mainnet by default, or the `chainId` you pass). Shows a styled connect/switch
 * prompt otherwise.
 */
import { useAccount, useSwitchChain } from 'wagmi'
import { ConnectKitButton } from 'connectkit'
import { Wallet, AlertTriangle } from 'lucide-react'
import { ARC_CHAIN_ID, chainLabel } from '../constants'
import { Card, PrimaryButton } from './ui'

export default function ChainGuard({ children, chainId: requiredChainId = ARC_CHAIN_ID }: {
  children: React.ReactNode
  chainId?: number
}) {
  const { isConnected, chainId, status } = useAccount()
  const { switchChain, isPending, error } = useSwitchChain()
  const network = chainLabel(requiredChainId)

  if (status === 'connecting' || status === 'reconnecting') {
    return <div role="status" className="py-20 text-center text-sm" style={{ color: 'var(--muted)' }}>Connecting wallet…</div>
  }

  if (!isConnected) {
    return (
      <div className="flex items-center justify-center py-20">
        <Card className="p-8 flex flex-col items-center gap-5 text-center max-w-sm w-full">
          <div
            className="w-14 h-14 rounded-xl flex items-center justify-center"
            style={{ background: 'var(--accent-muted)' }}
          >
            <Wallet size={24} style={{ color: 'var(--accent)' }} />
          </div>
          <div>
            <p className="font-semibold text-base" style={{ color: 'var(--ink)' }}>
              Connect your wallet
            </p>
            <p className="text-sm mt-1" style={{ color: 'var(--muted)' }}>
              A wallet on {network} is needed to use this feature.
            </p>
          </div>
          <ConnectKitButton />
        </Card>
      </div>
    )
  }

  if (chainId !== requiredChainId) {
    return (
      <div className="flex items-center justify-center py-20">
        <Card className="p-8 flex flex-col items-center gap-5 text-center max-w-sm w-full">
          <div
            className="w-14 h-14 rounded-xl flex items-center justify-center"
            style={{ background: 'var(--warning-muted)' }}
          >
            <AlertTriangle size={24} style={{ color: 'var(--warning)' }} />
          </div>
          <div>
            <p className="font-semibold text-base" style={{ color: 'var(--ink)' }}>
              Wrong network
            </p>
            <p className="text-sm mt-1" style={{ color: 'var(--muted)' }}>
              Switch to {network} to use this feature.
            </p>
          </div>
          <PrimaryButton
            onClick={() => switchChain({ chainId: requiredChainId })}
            loading={isPending}
            className="max-w-[240px]"
          >
            {isPending ? 'Switching network…' : `Switch to ${network}`}
          </PrimaryButton>
          {error && <p role="alert" className="text-xs" style={{ color: 'var(--danger)' }}>Your wallet did not switch networks. Approve the request in your wallet or switch manually.</p>}
        </Card>
      </div>
    )
  }

  return <>{children}</>
}
