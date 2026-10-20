/**
 * RacconPay — Privacy Policy
 */
import { Shield } from 'lucide-react'
import { Card } from './ui'

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-2">
      <h2 className="font-display font-semibold text-base" style={{ color: 'var(--ink)' }}>{title}</h2>
      <div className="text-sm leading-relaxed" style={{ color: 'var(--ink-2)' }}>{children}</div>
    </div>
  )
}

export default function PrivacyPage() {
  return (
    <div className="max-w-2xl mx-auto py-10 flex flex-col gap-6 animate-fade-up">
      {/* Header */}
      <div className="flex flex-col gap-2">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-2xl flex items-center justify-center"
            style={{ background: 'color-mix(in srgb, var(--accent) 12%, transparent)', border: '1px solid color-mix(in srgb, var(--accent) 20%, transparent)' }}>
            <Shield size={18} style={{ color: 'var(--accent)' }} />
          </div>
          <h1 className="font-display font-bold text-2xl" style={{ color: 'var(--ink)' }}>Privacy Policy</h1>
        </div>
        <p className="text-sm" style={{ color: 'var(--muted)' }}>Last updated: October 2026</p>
      </div>

      <Card className="p-6 flex flex-col gap-6">
        <Section title="Overview">
          RacconPay is a non-custodial, fully on-chain application. We do not operate a backend server, database, or any centralised data store. Your wallet address, transaction history, and financial data live entirely on the Arc blockchain and not with us.
        </Section>

        <Section title="Data we do not collect">
          <ul className="list-disc pl-4 flex flex-col gap-1.5">
            <li>We do not collect your name, email address, or any personally identifiable information.</li>
            <li>We do not store your wallet address or private key on any server.</li>
            <li>We do not use cookies, tracking pixels, or analytics scripts.</li>
            <li>We do not have access to your funds at any time.</li>
          </ul>
        </Section>

        <Section title="Data stored locally in your browser">
          Some features (Invoices, dark/light theme preference) store data in your browser's <code className="font-mono text-xs px-1 py-0.5 rounded" style={{ background: 'var(--surface-strong)' }}>localStorage</code>. This data never leaves your device unless you choose to export it. You can clear it at any time by clearing your browser's site data.
        </Section>

        <Section title="Blockchain transparency">
          All transactions you initiate through RacconPay are recorded on the Arc Mainnet blockchain, which is a public ledger. Anyone can view on-chain activity including wallet addresses, amounts, and transaction hashes using a block explorer. This is a fundamental property of public blockchains, not a privacy limitation specific to RacconPay.
        </Section>

        <Section title="Third-party services">
          RacconPay connects to the Arc Mainnet RPC endpoint to read and write blockchain state. No personal data is transmitted and only standard Ethereum JSON-RPC calls containing public wallet addresses and signed transactions. ConnectKit is used for wallet connection; its privacy policy applies to that interaction.
        </Section>

        <Section title="Changes to this policy">
          We may update this policy as the application evolves. Material changes will be noted with an updated date at the top of this page.
        </Section>

        <Section title="Contact">
          <span>For privacy questions, reach out via </span>
          <a href="https://x.com/Phoenixa104" target="_blank" rel="noreferrer"
            className="underline transition-opacity hover:opacity-70" style={{ color: 'var(--accent)' }}>
            X (@Phoenixa104)
          </a>
          <span> or </span>
          <a href="https://www.linkedin.com/in/anand-k02/" target="_blank" rel="noreferrer"
            className="underline transition-opacity hover:opacity-70" style={{ color: 'var(--accent)' }}>
            LinkedIn
          </a>.
        </Section>
      </Card>
    </div>
  )
}
