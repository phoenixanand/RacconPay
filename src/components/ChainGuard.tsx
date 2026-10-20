/**
 * Renders children only when the wallet is connected and on Arc Mainnet.
 * Shows a styled connect/switch prompt otherwise.
 */
import { useAccount, useSwitchChain } from 'wagmi'
import { ConnectKitButton } from 'connectkit'
import { Wallet, AlertTriangle } from 'lucide-react'
import { ARC_CHAIN_ID } from '../constants'
import { Card, PrimaryButton } from './ui'

export default function ChainGuard({ children }: { children: React.ReactNode }) {
  const { isConnected, chainId } = useAccount()
  const { switchChain, isPending } = useSwitchChain()

  if (!isConnected) {
    return (
      <div className="flex items-center justify-center py-20">
        <Card className="p-8 flex flex-col items-center gap-5 text-center max-w-sm w-full">
          <div
            className="w-14 h-14 rounded-2xl flex items-center justify-center"
            style={{ background: 'var(--accent-glow)', border: '1px solid var(--border-strong)' }}
          >
            <Wallet size={24} style={{ color: 'var(--accent)' }} />
          </div>
          <div>
            <p className="font-display font-semibold text-base" style={{ color: 'var(--ink)' }}>
              Connect your wallet
            </p>
            <p className="text-sm mt-1" style={{ color: 'var(--muted)' }}>
              A wallet on Arc Mainnet is needed to use this feature.
            </p>
          </div>
          <ConnectKitButton />
        </Card>
      </div>
    )
  }

  if (chainId !== ARC_CHAIN_ID) {
    return (
      <div className="flex items-center justify-center py-20">
        <Card className="p-8 flex flex-col items-center gap-5 text-center max-w-sm w-full">
          <div
            className="w-14 h-14 rounded-2xl flex items-center justify-center"
            style={{ background: 'var(--warning-muted)', border: '1px solid rgba(245,192,90,0.25)' }}
          >
            <AlertTriangle size={24} style={{ color: 'var(--warning)' }} />
          </div>
          <div>
            <p className="font-display font-semibold text-base" style={{ color: 'var(--ink)' }}>
              Wrong network
            </p>
            <p className="text-sm mt-1" style={{ color: 'var(--muted)' }}>
              Switch to Arc Mainnet to use RacconPay.
            </p>
          </div>
          <PrimaryButton
            onClick={() => switchChain({ chainId: ARC_CHAIN_ID })}
            loading={isPending}
            className="max-w-[200px]"
          >
            Switch to Arc Mainnet
          </PrimaryButton>
        </Card>
      </div>
    )
  }

  return <>{children}</>
}
