/**
 * RacconPay — Terms of Service
 */
import { ScrollText } from 'lucide-react'
import { Card } from './ui'

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-2">
      <h2 className="font-display font-semibold text-base" style={{ color: 'var(--ink)' }}>{title}</h2>
      <div className="text-sm leading-relaxed" style={{ color: 'var(--ink-2)' }}>{children}</div>
    </div>
  )
}

export default function TermsPage() {
  return (
    <div className="max-w-2xl mx-auto py-10 flex flex-col gap-6 animate-fade-up">
      {/* Header */}
      <div className="flex flex-col gap-2">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-2xl flex items-center justify-center"
            style={{ background: 'color-mix(in srgb, var(--accent) 12%, transparent)', border: '1px solid color-mix(in srgb, var(--accent) 20%, transparent)' }}>
            <ScrollText size={18} style={{ color: 'var(--accent)' }} />
          </div>
          <h1 className="font-display font-bold text-2xl" style={{ color: 'var(--ink)' }}>Terms of Service</h1>
        </div>
        <p className="text-sm" style={{ color: 'var(--muted)' }}>Last updated: October 2026</p>
      </div>

      <Card className="p-6 flex flex-col gap-6">
        <Section title="Acceptance">
          By accessing or using RacconPay, you agree to be bound by these Terms of Service. If you do not agree, do not use the application.
        </Section>

        <Section title="What RacconPay is">
          RacconPay is a non-custodial, open-source interface for interacting with smart contracts deployed on the Arc Mainnet blockchain. It provides tools for batch USDC payments, vesting streams, bill splitting, multi-signature disbursements, and invoice generation. RacconPay does not custody, hold, or control any user funds at any time.
        </Section>

        <Section title="Your responsibilities">
          <ul className="list-disc pl-4 flex flex-col gap-1.5">
            <li>You are solely responsible for the security of your wallet and private keys.</li>
            <li>You are solely responsible for all transactions you initiate. Blockchain transactions are irreversible.</li>
            <li>You must ensure you have sufficient USDC and gas (also USDC on Arc) before initiating any transaction.</li>
            <li>You are responsible for verifying recipient addresses before sending funds. RacconPay cannot recover funds sent to incorrect addresses.</li>
            <li>You must comply with all applicable laws and regulations in your jurisdiction regarding cryptocurrency and payments.</li>
          </ul>
        </Section>

        <Section title="No financial advice">
          Nothing in RacconPay constitutes financial, legal, or investment advice. The application is a tool how you use it is your decision and your responsibility.
        </Section>

        <Section title="Smart contract risk">
          RacconPay's smart contracts have been audited internally, but no audit guarantees the absence of bugs or vulnerabilities. By using RacconPay, you acknowledge and accept the inherent risks of interacting with smart contracts on a public blockchain, including the potential for loss of funds due to bugs, exploits, or user error.
        </Section>

        <Section title="No warranties">
          RacconPay is provided "as is" without warranty of any kind. We make no representations about the availability, accuracy, or reliability of the application. We are not liable for any loss of funds, data, or opportunity arising from your use of the application.
        </Section>

        <Section title="Protocol fees">
          RacconPay does not charge protocol fees on transactions. You pay only the Arc Mainnet gas fee (denominated in USDC) for each on-chain transaction. Gas fees are set by the Arc network and are outside RacconPay's control.
        </Section>

        <Section title="Modifications">
          We reserve the right to modify or discontinue RacconPay at any time. We will not be liable for any modification, suspension, or discontinuation of the service. Smart contracts already deployed on-chain remain accessible independently of this interface.
        </Section>

        <Section title="Governing law">
          These terms are governed by the laws of the applicable jurisdiction. Any disputes shall be resolved in the applicable courts.
        </Section>

        <Section title="Contact">
          <span>For questions about these terms, reach out via </span>
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
