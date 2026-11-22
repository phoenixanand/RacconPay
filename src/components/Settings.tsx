/** Settings: theme, read-only network details, and wallet. */
import ArcLogo from './ArcLogo'
import { Link } from 'react-router-dom'
import { Moon, Settings as SettingsIcon, Sun } from 'lucide-react'
import { useAccount } from 'wagmi'
import { Card, PageHeader, SectionTitle } from './ui'
import { useTheme } from '../ThemeContext'
import { ARC_CHAIN_ID, USDC_ADDRESS, EXPLORER_BASE, explorerAddr } from '../constants'
import { shortAddr } from '../utils'

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1 sm:gap-4 py-3" style={{ borderBottom: '1px solid var(--border)' }}>
      <dt className="text-sm" style={{ color: 'var(--muted)' }}>{label}</dt>
      <dd className="text-sm font-medium break-all sm:text-right" style={{ color: 'var(--ink)' }}>{children}</dd>
    </div>
  )
}

export default function SettingsPage() {
  const { theme, toggle } = useTheme()
  const { address, chainId, isConnected } = useAccount()

  const choice = (value: 'light' | 'dark', label: string, Icon: React.ElementType) => {
    const selected = theme === value
    return (
      <button
        type="button" role="radio" aria-checked={selected}
        onClick={() => { if (!selected) toggle() }}
        className="flex items-center justify-center gap-2 min-h-[44px] rounded-lg text-sm font-medium"
        style={{
          background: selected ? 'var(--accent-muted)' : 'var(--surface)',
          color: selected ? 'var(--accent)' : 'var(--ink-2)',
          border: `1px solid ${selected ? 'var(--accent)' : 'var(--border-strong)'}`,
        }}
      >
        <Icon size={16} aria-hidden="true" /> {label}
      </button>
    )
  }

  return (
    <div className="flex flex-col gap-6 max-w-2xl">
      <PageHeader icon={SettingsIcon} title="Settings" />

      <Card className="p-5">
        <SectionTitle title="Appearance" subtitle="Choose a light or dark theme." />
        <div role="radiogroup" aria-label="Theme" className="grid grid-cols-2 gap-3">
          {choice('light', 'Light', Sun)}
          {choice('dark', 'Dark', Moon)}
        </div>
      </Card>

      <Card className="p-5">
        <SectionTitle title="Network" subtitle="RacconPay runs on Arc Mainnet." />
        <dl>
          <Row label="Network"><span className="inline-flex items-center gap-2"><ArcLogo size={18} />Arc Mainnet</span></Row>
          <Row label="Chain ID">{ARC_CHAIN_ID}</Row>
          <Row label="RPC">rpc.mainnet.arc.io</Row>
          <Row label="Explorer"><a href={EXPLORER_BASE} target="_blank" rel="noreferrer" className="hover:underline" style={{ color: 'var(--accent)' }}>explorer.arc.io</a></Row>
          <Row label="USDC (ERC-20, 6 decimals)"><a href={explorerAddr(USDC_ADDRESS)} target="_blank" rel="noreferrer" className="font-mono hover:underline" style={{ color: 'var(--accent)' }}>{shortAddr(USDC_ADDRESS)}</a></Row>
          <Row label="Gas">Paid in USDC (native balance uses 18 decimals)</Row>
        </dl>
      </Card>

      <Card className="p-5">
        <SectionTitle title="Wallet" />
        <dl>
          <Row label="Status">{isConnected ? 'Connected' : 'Not connected'}</Row>
          <Row label="Address">{address ? <span className="font-mono">{address}</span> : '-'}</Row>
          <Row label="Network in wallet">{isConnected ? (chainId === ARC_CHAIN_ID ? 'Arc Mainnet' : `Other network (chain ${chainId})`) : '-'}</Row>
        </dl>
      </Card>

      <p className="text-xs" style={{ color: 'var(--muted)' }}>
        <Link to="/docs" className="hover:underline">Docs</Link> · <Link to="/privacy" className="hover:underline">Privacy</Link> · <Link to="/terms" className="hover:underline">Terms</Link>
      </p>
    </div>
  )
}
