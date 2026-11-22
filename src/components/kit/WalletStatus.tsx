/**
 * Wallet and network state for the top bar. Shows disconnected, connecting, wrong network
 * (with a switch button) or the connected address. Reads real wagmi state only.
 */
import { useAccount, useSwitchChain } from 'wagmi'
import { ConnectKitButton } from 'connectkit'
import { AlertTriangle, Loader2 } from 'lucide-react'
import { ARC_CHAIN_ID } from '../../constants'
import { shortAddr } from '../../utils'

export function NetworkPill() {
  const { isConnected, chainId } = useAccount()
  const wrong = isConnected && chainId !== ARC_CHAIN_ID
  const color = wrong ? 'var(--warning)' : 'var(--success)'
  return (
    <span
      className="hidden sm:inline-flex items-center gap-2 px-2.5 py-1.5 rounded-lg text-xs font-medium"
      style={{ background: wrong ? 'var(--warning-muted)' : 'var(--success-muted)', color }}
    >
      <span className="w-1.5 h-1.5 rounded-full" style={{ background: color }} aria-hidden="true" />
      {wrong ? 'Wrong network' : 'Arc Mainnet'}
    </span>
  )
}

export function WalletStatus() {
  const { status, isConnected, chainId, address } = useAccount()
  const { switchChain, isPending } = useSwitchChain()

  if (status === 'connecting' || status === 'reconnecting') {
    return (
      <span className="inline-flex items-center gap-2 min-h-[40px] px-3 rounded-lg text-sm" style={{ border: '1px solid var(--border-strong)', color: 'var(--muted)' }} role="status">
        <Loader2 size={14} className="animate-spin" aria-hidden="true" /> Connecting wallet
      </span>
    )
  }
  if (isConnected && chainId !== ARC_CHAIN_ID) {
    return (
      <button
        type="button"
        onClick={() => switchChain({ chainId: ARC_CHAIN_ID })}
        disabled={isPending}
        className="inline-flex items-center gap-2 min-h-[40px] px-3 rounded-lg text-sm font-medium disabled:opacity-60"
        style={{ background: 'var(--warning-muted)', color: 'var(--warning)', border: '1px solid var(--border-strong)' }}
      >
        {isPending ? <Loader2 size={14} className="animate-spin" aria-hidden="true" /> : <AlertTriangle size={14} aria-hidden="true" />}
        {isPending ? 'Switching network' : 'Switch to Arc Mainnet'}
      </button>
    )
  }
  return (
    <ConnectKitButton.Custom>
      {({ show, isConnected: connected }) => (
        <button
          type="button"
          onClick={show}
          className="inline-flex items-center gap-2 min-h-[40px] px-3.5 rounded-lg text-sm font-semibold transition-colors"
          style={connected
            ? { background: 'var(--surface)', color: 'var(--ink)', border: '1px solid var(--border-strong)' }
            : { background: 'var(--accent)', color: 'var(--on-accent)', border: '1px solid transparent' }}
        >
          {connected && address ? <span className="tabular-nums">{shortAddr(address)}</span> : 'Connect wallet'}
        </button>
      )}
    </ConnectKitButton.Custom>
  )
}
