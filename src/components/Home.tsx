/**
 * RacconPay, Feature Scroll Home
 *
 * Structure:
 *  1. Hero         , full-height opener, big catchphrase, CTA
 *  2. Stats strip  , 4 live numbers
 *  3. Feature sections (×5), alternating left/right, each tool gets a full section
 *  5. Final CTA    , "Ready to pay?" section
 */
import { Link } from 'react-router-dom'
import { useRef } from 'react'
import {
  Send, Clock, Users, Layers,
  ArrowRight, ArrowDown,
  CheckCircle2, FileText, ShieldCheck, Handshake, Repeat, Waypoints,
} from 'lucide-react'
import { useState, useEffect } from 'react'
import PPLogo from './PPLogo'
import { HomeStats } from './PageStats'

/* ══════════════════════════════════════════════════════════════════════
   FEATURE SECTIONS DATA
   ══════════════════════════════════════════════════════════════════════ */
const FEATURES = [
  {
    to:        '/pay',
    audience:  'enterprise',
    icon:      Send,
    eyebrow:   'Batch Payout',
    headline:  'Pay 100 people\n In One Transaction.',
    sub:       'Stop opening your wallet 100 times. Upload a CSV, check the list and send once, or require approval from two co-signers first. Everyone gets their USDC at the same time, and a soul-bound receipt NFT is minted to your wallet as permanent proof.',
    bullets:   ['CSV upload or manual entry', 'Soul-bound ERC-721 receipt', 'Up to 100 people per payment. Need more? Send in batches', 'Permanent on-chain receipt for your records'],
    accent:    'var(--pay-accent)',
    glow:      'transparent',
    mockBg:    'var(--surface)',
    flip:      false,
    MockUI:    BatchMock,
  },
  {
    to:        '/pay?tab=approvals',
    audience:  'enterprise',
    icon:      ShieldCheck,
    eyebrow:   'Payouts with approval',
    headline:  'No single person\nmoves the money.',
    sub:       'Choose Require approval on a payout and name two co-signers. Both must approve before anyone can execute it, and a proposal that is not completed expires after seven days. Built for finance teams that want a second pair of eyes on every payment.',
    bullets:   ['Two named co-signers per proposal', 'Nothing is sent until both have approved', 'Seven-day expiry with a live countdown', 'Reject or cancel before execution'],
    accent:    'var(--pay-accent)',
    glow:      'transparent',
    mockBg:    'var(--surface)',
    flip:      true,
    MockUI:    MultiSigMock,
  },
  {
    to:        '/vesting',
    audience:  'enterprise',
    icon:      Clock,
    eyebrow:   'Vesting Streams',
    headline:  'Pay your team\nover time,\nwith control.',
    sub:       'A vesting console for finance and HR teams. Lock USDC for employees and contractors and release it linearly. Handle leave with approvals, upload payees in bulk, and export streams and activity for your records. Every cancel pays out what was earned first.',
    bullets:   ['Leave and pauses with approvals', 'Bulk upload payees from a CSV', 'Overview, inbox and CSV reports for finance', 'Optional yield on locked funds, off by default'],
    accent:    'var(--vest-accent)',
    glow:      'transparent',
    mockBg:    'var(--surface)',
    flip:      true,
    MockUI:    VestingMock,
  },
  {
    to:        '/escrow',
    audience:  'enterprise',
    icon:      Handshake,
    eyebrow:   'Milestone Escrow · Arc Mainnet',
    headline:  'Pay for work\nas it gets done,\nnot before.',
    sub:       'Lock USDC or EURC for a freelancer or supplier and split it into milestones. Each one is released when you approve it. Vesting pays out with time; escrow pays out on approval. If you disagree, an arbiter you chose decides the split.',
    bullets:   ['Up to 20 milestones, funded up front in one step', 'Release on approval, or the payee collects after the review window', 'Optional arbiter settles disputes; a silent arbiter means a 50/50 split after 30 days', 'Refund anything the payee never started once the deadline passes'],
    accent:    'var(--pay-accent)',
    glow:      'transparent',
    mockBg:    'var(--surface)',
    flip:      false,
    MockUI:    EscrowMock,
  },
  {
    to:        '/invoice',
    audience:  'enterprise',
    icon:      FileText,
    eyebrow:   'Invoices',
    headline:  'Send a link.\nGet paid in\nUSDC or EURC.',
    sub:       'Create an invoice, share the link or a QR code, and your client pays in one click from their wallet. Invoices are marked paid automatically, and both sides can download a PDF. Choose USDC or EURC per invoice.',
    bullets:   ['USDC or EURC on each invoice', 'Pay link, QR code and PDF export', 'Paid detection straight from the chain', 'Analytics by currency on your dashboard'],
    accent:    'var(--receipt-accent)',
    glow:      'transparent',
    mockBg:    'var(--surface)',
    flip:      false,
    MockUI:    InvoiceMock,
  },
  {
    to:        '/split',
    audience:  'personal',
    icon:      Users,
    eyebrow:   'Bill Split',
    headline:  'Dinner was $120,\nNobody has cash,\nSolved.',
    sub:       'Add the bill, split it equally, and share a QR code or link. Each friend pays their share straight to you in USDC. No chasing, no IOUs. Works best for groups who already hold USDC.',
    bullets:   ['Equal split across everyone in the group', 'Share by QR code or invite link', 'Each share goes straight to the person who paid', 'See who has paid and who hasn’t'],
    accent:    'var(--split-accent)',
    glow:      'transparent',
    mockBg:    'var(--surface)',
    flip:      true,
    MockUI:    SplitMock,
  },
  {
    to:        '/swap',
    audience:  'personal',
    icon:      Repeat,
    eyebrow:   'Swap · Arc Mainnet',
    headline:  'Switch between\ndollars, euros\nand bitcoin.',
    sub:       'Swap USDC, EURC and cirBTC straight from your wallet. You see the estimated amount, the minimum you will receive and the fees before you confirm, and the swap fails rather than filling below that minimum.',
    bullets:   ['Quote review before anything is sent', 'You choose the maximum slippage', 'Minimum received shown up front', 'Arc Mainnet uses real funds, so start small'],
    accent:    'var(--vest-accent)',
    glow:      'transparent',
    mockBg:    'var(--surface)',
    flip:      true,
    MockUI:    SwapMock,
  },
  {
    to:        '/bridge',
    audience:  'personal',
    icon:      Waypoints,
    eyebrow:   'Bridge · Arc Mainnet',
    headline:  'Send USDC and EURC\nto Arc, or\nfrom Arc.',
    sub:       'Move USDC between Arc and Ethereum, Base, Avalanche or Solana in either direction with Circle’s CCTP, keep one USDC balance across chains with Gateway, or use Across. EURC works on the supported EVM routes. You see the route, the fees and the speed before anything is sent.',
    bullets:   ['Choose CCTP, Gateway or Across', 'Ethereum, Base, Avalanche and Solana', 'Pick From and To, and flip the direction in one tap', 'Real funds: start small and check the addresses'],
    accent:    'var(--split-accent)',
    glow:      'transparent',
    mockBg:    'var(--surface)',
    flip:      false,
    MockUI:    BridgeMock,
  },
  {
    to:        '/dashboard?tab=receipts',
    audience:  'enterprise',
    icon:      Layers,
    eyebrow:   'Audit Trail · Receipts',
    headline:  'Proof of payment,\nForever on-chain.',
    sub:       'Every batch payout mints a soul-bound NFT to your wallet. Non-transferable.Every batch payout gives you a receipt saved on-chain. It shows who you paid, how much, and when. It can’t be edited or deleted, and it can’t be sent to anyone else.',
    bullets:   ['Soul-bound ERC-721 (non-transferable)', 'Stores payer, recipients, amounts', 'Timestamp + tx hash on-chain', 'Find all your receipts when you connect your wallet'],
    accent:    'var(--receipt-accent)',
    glow:      'transparent',
    mockBg:    'var(--surface)',
    flip:      false,
    MockUI:    ReceiptMock,
  },
]

const ENTERPRISE_FEATURES = FEATURES.filter(f => f.audience === 'enterprise')
const PERSONAL_FEATURES   = FEATURES.filter(f => f.audience === 'personal')


/* ══════════════════════════════════════════════════════════════════════
   MOCK UI ILLUSTRATIONS  (right-side visuals per feature section)
   ══════════════════════════════════════════════════════════════════════ */
function MockCard({ mockBg, children }: { accent?: string; mockBg: string; children: React.ReactNode }) {
  return (
    <div
      className="rounded-2xl p-4 sm:p-5 flex flex-col gap-3 w-full min-w-0"
      style={{ background: mockBg, border: '1px solid var(--border)', boxShadow: 'var(--shadow-md)' }}
    >
      {children}
    </div>
  )
}

function MockRow({ label, value }: { label: string; value: string; accent?: string }) {
  return (
    <div className="flex items-start justify-between gap-3 py-2 border-b" style={{ borderColor: 'var(--border)' }}>
      <span className="text-xs font-mono shrink-0" style={{ color: 'var(--muted)' }}>{label}</span>
      <span className="text-xs font-semibold font-mono text-right break-words min-w-0" style={{ color: 'var(--ink)' }}>{value}</span>
    </div>
  )
}

function MockPill({ label, accent }: { label: string; accent: string }) {
  return (
    <span
      className="text-[10px] font-semibold px-2.5 py-1 rounded-full"
      style={{ background: 'var(--accent-muted)', color: accent, border: '1px solid var(--border)' }}
    >
      {label}
    </span>
  )
}

function BatchMock({ accent, mockBg }: { accent: string; mockBg: string }) {
  const rows = [
    { addr: '0x59f3…0699', amt: '250.00 USDC' },
    { addr: '0x5B12…Ef42', amt: '150.00 USDC' },
    { addr: '0x6aa4…1ee0', amt: '100.00 USDC' },
  ]
  return (
    <MockCard accent={accent} mockBg={mockBg}>
      <div className="flex flex-wrap items-center justify-between gap-2 mb-1">
        <span className="text-xs font-semibold" style={{ color: 'var(--ink)' }}>Batch Payout · 3 recipients</span>
        <MockPill label="Ready" accent={accent} />
      </div>
      {rows.map(r => <MockRow key={r.addr} label={r.addr} value={r.amt} accent={accent} />)}
      <div className="flex items-center justify-between pt-1">
        <span className="text-xs" style={{ color: 'var(--muted)' }}>Total</span>
        <span className="text-sm font-bold font-mono" style={{ color: accent }}>500.00 USDC</span>
      </div>
      <div
        className="w-full text-center py-2.5 rounded-xl text-xs font-bold mt-1"
        style={{ background: accent, color: 'var(--on-accent)' }}
      >
        Approve &amp; Send →
      </div>
    </MockCard>
  )
}

function VestingMock({ accent, mockBg }: { accent: string; mockBg: string }) {
  return (
    <MockCard accent={accent} mockBg={mockBg}>
      <div className="flex flex-wrap items-center justify-between gap-2 mb-1">
        <span className="text-xs font-semibold" style={{ color: 'var(--ink)' }}>Stream #4 · Active</span>
        <MockPill label="68% vested" accent={accent} />
      </div>
      <div className="flex flex-col gap-1">
        <div className="flex justify-between text-[10px]" style={{ color: 'var(--muted)' }}>
          <span>Progress</span><span>680 / 1,000 USDC</span>
        </div>
        <div className="h-2.5 rounded-full overflow-hidden" style={{ background: 'color-mix(in srgb, var(--accent) 12%, transparent)' }}>
          <div className="h-full rounded-full transition-all" style={{ width: '68%', background: accent }} />
        </div>
      </div>
      <MockRow label="Beneficiary" value="0x59f3…0699" accent={accent} />
      <MockRow label="Duration" value="365 days" accent={accent} />
      <MockRow label="Claimable now" value="42.50 USDC" accent={accent} />
      <div
        className="w-full text-center py-2.5 rounded-xl text-xs font-bold mt-1"
        style={{ background: accent, color: 'var(--on-accent)' }}
      >
        Claim 42.50 USDC →
      </div>
    </MockCard>
  )
}

function MultiSigMock({ accent, mockBg }: { accent: string; mockBg: string }) {
  return (
    <MockCard accent={accent} mockBg={mockBg}>
      <div className="flex flex-wrap items-center justify-between gap-2 mb-1">
        <span className="text-xs font-semibold" style={{ color: 'var(--ink)' }}>Payroll · October</span>
        <MockPill label="1 of 2 approved" accent={accent} />
      </div>
      <MockRow label="Recipients" value="24 wallets" accent={accent} />
      <MockRow label="Total" value="18,400.00 USDC" accent={accent} />
      <MockRow label="Co-signer 1" value="Approved" accent={accent} />
      <MockRow label="Co-signer 2" value="Pending" accent={accent} />
      <MockRow label="Expires in" value="5d 3h" accent={accent} />
      <div
        className="w-full text-center py-2.5 rounded-xl text-xs font-bold mt-1"
        style={{ background: 'var(--accent-muted)', color: accent, border: '1px solid var(--border)' }}
      >
        Waiting for co-signer 2
      </div>
    </MockCard>
  )
}

function InvoiceMock({ accent, mockBg }: { accent: string; mockBg: string }) {
  return (
    <MockCard accent={accent} mockBg={mockBg}>
      <div className="flex flex-wrap items-center justify-between gap-2 mb-1">
        <span className="text-xs font-semibold" style={{ color: 'var(--ink)' }}>INV-0007 · Acme Ltd</span>
        <MockPill label="Paid" accent={accent} />
      </div>
      <MockRow label="Description" value="Design work · March" accent={accent} />
      <MockRow label="Currency" value="EURC" accent={accent} />
      <MockRow label="Amount" value="1,250.00 EURC" accent={accent} />
      <MockRow label="Due" value="Apr 15 2026" accent={accent} />
      <div
        className="flex items-center gap-2 mt-1 px-3 py-2.5 rounded-xl text-[11px]"
        style={{ background: `${accent}12`, border: `1px solid ${accent}25`, color: accent }}
      >
        <CheckCircle2 size={13} />
        Payment detected on-chain · PDF ready
      </div>
    </MockCard>
  )
}

function SwapMock({ accent, mockBg }: { accent: string; mockBg: string }) {
  return (
    <MockCard accent={accent} mockBg={mockBg}>
      <div className="flex flex-wrap items-center justify-between gap-2 mb-1">
        <span className="text-xs font-semibold" style={{ color: 'var(--ink)' }}>Swap · USDC to EURC</span>
        <MockPill label="1% max slippage" accent={accent} />
      </div>
      <MockRow label="You pay" value="100.00 USDC" accent={accent} />
      <MockRow label="Estimated" value="EURC (shown before you confirm)" accent={accent} />
      <MockRow label="Minimum received" value="Shown before you confirm" accent={accent} />
      <MockRow label="Fees" value="Shown before you confirm" accent={accent} />
      <div
        className="w-full text-center py-2.5 rounded-xl text-xs font-bold mt-1"
        style={{ background: accent, color: 'var(--on-accent)' }}
      >
        Review quote →
      </div>
    </MockCard>
  )
}

function EscrowMock({ accent, mockBg }: { accent: string; mockBg: string }) {
  const milestones = [
    { n: 1, label: 'Mockup', amt: '1,000.00', state: 'Released',  done: true  },
    { n: 2, label: 'Build',  amt: '1,000.00', state: 'Submitted', done: false },
    { n: 3, label: 'Launch', amt: '1,000.00', state: 'Funded',    done: false },
  ]
  return (
    <MockCard accent={accent} mockBg={mockBg}>
      <div className="flex flex-wrap items-center justify-between gap-2 mb-1">
        <span className="text-xs font-semibold" style={{ color: 'var(--ink)' }}>Website redesign · 3 milestones</span>
        <MockPill label="3,000 USDC locked" accent={accent} />
      </div>
      {milestones.map(m => (
        <div key={m.n} className="flex items-center justify-between py-1.5 border-b" style={{ borderColor: 'var(--border)' }}>
          <span className="text-xs" style={{ color: 'var(--ink)' }}>#{m.n} {m.label}</span>
          <span className="flex items-center gap-2">
            <span className="text-xs font-mono" style={{ color: 'var(--muted)' }}>{m.amt}</span>
            <span
              className="text-[10px] font-semibold px-2 py-0.5 rounded-full"
              style={m.done
                ? { background: 'var(--success-muted)', color: 'var(--success)' }
                : { background: 'var(--accent-muted)', color: accent }}
            >
              {m.state}
            </span>
          </span>
        </div>
      ))}
      <div className="flex gap-2 mt-1">
        <div className="flex-1 text-center py-2 rounded-xl text-[11px] font-bold" style={{ background: accent, color: 'var(--on-accent)' }}>
          Approve #2 →
        </div>
        <div
          className="flex-1 text-center py-2 rounded-xl text-[11px] font-semibold"
          style={{ background: 'var(--accent-muted)', color: accent, border: '1px solid var(--border)' }}
        >
          Dispute
        </div>
      </div>
    </MockCard>
  )
}

function BridgeMock({ accent, mockBg }: { accent: string; mockBg: string }) {
  return (
    <MockCard accent={accent} mockBg={mockBg}>
      <div className="flex flex-wrap items-center justify-between gap-2 mb-1">
        <span className="text-xs font-semibold" style={{ color: 'var(--ink)' }}>Bridge · Arc to Base</span>
        <MockPill label="Fast" accent={accent} />
      </div>
      <MockRow label="You send" value="25.00 USDC" accent={accent} />
      <MockRow label="Route" value="Arc to Base" accent={accent} />
      <MockRow label="Fees" value="Shown before you confirm" accent={accent} />
      <MockRow label="Recipient" value="Your wallet" accent={accent} />
      <div
        className="w-full text-center py-2.5 rounded-xl text-xs font-bold mt-1"
        style={{ background: accent, color: 'var(--on-accent)' }}
      >
        Review transfer →
      </div>
    </MockCard>
  )
}

function SplitMock({ accent, mockBg }: { accent: string; mockBg: string }) {
  const members = [
    { name: 'Alice', owed: '+45.00', color: 'var(--success)' },
    { name: 'Bob',   owed: '-22.50', color: 'var(--danger)'  },
    { name: 'Carol', owed: '-22.50', color: 'var(--danger)'  },
  ]
  return (
    <MockCard accent={accent} mockBg={mockBg}>
      <div className="flex flex-wrap items-center justify-between gap-2 mb-1">
        <span className="text-xs font-semibold" style={{ color: 'var(--ink)' }}>Weekend Trip</span>
        <MockPill label="3 members" accent={accent} />
      </div>
      {members.map(m => (
        <div key={m.name} className="flex items-center justify-between py-1.5 border-b" style={{ borderColor: 'var(--border)' }}>
          <span className="text-xs" style={{ color: 'var(--ink)' }}>{m.name}</span>
          <span className="text-xs font-bold font-mono" style={{ color: m.color }}>{m.owed} USDC</span>
        </div>
      ))}
      <div className="flex gap-2 mt-1">
        <div
          className="flex-1 text-center py-2 rounded-xl text-[11px] font-bold"
          style={{ background: accent, color: 'var(--on-accent)' }}
        >
          Settle →
        </div>
        <div
          className="flex-1 text-center py-2 rounded-xl text-[11px] font-semibold"
          style={{ background: 'var(--accent-muted)', color: accent, border: '1px solid var(--border)' }}
        >
          Share QR
        </div>
      </div>
    </MockCard>
  )
}

function ReceiptMock({ accent, mockBg }: { accent: string; mockBg: string }) {
  return (
    <MockCard accent={accent} mockBg={mockBg}>
      <div className="flex flex-wrap items-center justify-between gap-2 mb-1">
        <span className="text-xs font-semibold" style={{ color: 'var(--ink)' }}>Receipt #42</span>
        <MockPill label="Soul-bound" accent={accent} />
      </div>
      <MockRow label="Payer" value="0x59f3…0699" accent={accent} />
      <MockRow label="Recipients" value="12 wallets" accent={accent} />
      <MockRow label="Total" value="3,200.00 USDC" accent={accent} />
      <MockRow label="Date" value="Oct 13 2026" accent={accent} />
      <div
        className="flex items-center gap-2 mt-1 px-3 py-2.5 rounded-xl text-[11px]"
        style={{ background: `${accent}12`, border: `1px solid ${accent}25`, color: accent }}
      >
        <ShieldCheck size={13} />
        Non-transferable · Permanently on-chain
      </div>
    </MockCard>
  )
}

/* ══════════════════════════════════════════════════════════════════════
   FADE-IN-ON-SCROLL hook
   ══════════════════════════════════════════════════════════════════════ */
function useFadeIn() {
  const ref = useRef<HTMLDivElement>(null)
  const [visible, setVisible] = useState(false)
  useEffect(() => {
    const el = ref.current
    if (!el) return
    const obs = new IntersectionObserver(
      ([entry]) => { if (entry.isIntersecting) setVisible(true) },
      { threshold: 0.12 },
    )
    obs.observe(el)
    return () => obs.disconnect()
  }, [])
  return { ref, visible }
}

/* ══════════════════════════════════════════════════════════════════════
   FEATURE SECTION
   ══════════════════════════════════════════════════════════════════════ */
function BandHeader({ id, eyebrow, title, sub }: { id: string; eyebrow: string; title: string; sub: string }) {
  return (
    <div id={id} className="scroll-mt-24 pt-10 md:pt-24 flex flex-col items-center text-center gap-3">
      <span
        className="text-[11px] font-bold uppercase tracking-[0.16em] px-3 py-1 rounded-full"
        style={{ background: 'var(--surface)', border: '1px solid var(--border-strong)', color: 'var(--muted)' }}
      >
        {eyebrow}
      </span>
      <h2
        className="font-display font-bold"
        style={{ fontSize: 'clamp(1.6rem, 6vw, 2.6rem)', letterSpacing: '-0.03em', lineHeight: 1.1, color: 'var(--ink)' }}
      >
        {title}
      </h2>
      <p className="text-base max-w-xl" style={{ color: 'var(--muted)', lineHeight: 1.7 }}>{sub}</p>
    </div>
  )
}

function FeatureSection({
  to, icon: Icon, eyebrow, headline, sub, bullets, accent, mockBg, flip, MockUI,
}: typeof FEATURES[0]) {
  const { ref, visible } = useFadeIn()
  const lines = headline.split('\n')

  return (
    <section
      ref={ref}
      className="relative py-10 md:py-24"
      style={{
        opacity:    visible ? 1 : 0,
        transform:  visible ? 'none' : 'translateY(32px)',
        transition: 'opacity 0.65s ease, transform 0.65s ease',
      }}
    >
      <div className={`relative z-10 flex flex-col ${flip ? 'md:flex-row-reverse' : 'md:flex-row'} items-center gap-8 md:gap-16`}>
        {/* ── Text column ─────────────────────────────────────── */}
        <div className="flex-1 flex flex-col gap-5 min-w-0 w-full">
          {/* Eyebrow */}
          <div className="flex items-center gap-2.5">
            <span
              className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0"
              style={{ background: 'color-mix(in srgb, var(--accent) 10%, transparent)' }}
            >
              <Icon size={16} style={{ color: accent }} aria-hidden="true" />
            </span>
            <span
              className="text-xs font-semibold uppercase tracking-[0.1em]"
              style={{ color: accent }}
            >
              {eyebrow}
            </span>
          </div>

          {/* Headline, each line large */}
          <h2
            className="font-display font-bold leading-[1.06]"
            style={{ fontSize: 'clamp(1.75rem, 6vw, 3.2rem)', letterSpacing: '-0.03em', color: 'var(--ink)' }}
          >
            {lines.map((line, i) => (
              <span key={i} className="block">
                {i === 0
                  ? <span style={{ color: accent }}>{line}</span>
                  : line}
              </span>
            ))}
          </h2>

          {/* Sub */}
          <p className="text-base leading-relaxed max-w-md" style={{ color: 'var(--muted)', lineHeight: 1.75 }}>
            {sub}
          </p>

          {/* Bullets */}
          <ul className="flex flex-col gap-2">
            {bullets.map(b => (
              <li key={b} className="flex items-center gap-2.5 text-sm" style={{ color: 'var(--ink-2)' }}>
                <span
                  className="w-4 h-4 rounded-full flex items-center justify-center shrink-0"
                  style={{ background: 'color-mix(in srgb, var(--accent) 12%, transparent)' }}
                >
                  <CheckCircle2 size={10} style={{ color: accent }} />
                </span>
                {b}
              </li>
            ))}
          </ul>

          {/* CTA */}
          <Link
            to={to}
            className="self-start flex items-center gap-2 px-5 py-3 min-h-[44px] rounded-xl text-sm font-bold transition-all hover:scale-[1.03] active:scale-[0.98]"
            style={{
              background: accent,
              color: 'var(--on-accent)',
              boxShadow: 'none',
            }}
          >
            Open {eyebrow.split(' · ')[0]} <ArrowRight size={14} />
          </Link>
        </div>

        {/* ── Mock UI column ──────────────────────────────────── */}
        <div className="flex-1 w-full min-w-0 sm:max-w-sm">
          <MockUI accent={accent} mockBg={mockBg} />
        </div>

      </div>

      {/* Section divider */}
      <div
        className="absolute bottom-0 left-0 right-0 h-px"
        style={{ background: 'var(--border)' }}
      />
    </section>
  )
}

/* ══════════════════════════════════════════════════════════════════════
   FINAL CTA
   ══════════════════════════════════════════════════════════════════════ */
function FinalCTA() {
  const { ref, visible } = useFadeIn()
  return (
    <section
      ref={ref}
      className="py-12 md:py-20 flex flex-col items-center text-center gap-6"
      style={{ opacity: visible ? 1 : 0, transform: visible ? 'none' : 'translateY(24px)', transition: 'opacity 0.6s ease, transform 0.6s ease' }}
    >
      <PPLogo size={56} />
      <h2
        className="font-display font-bold"
        style={{ fontSize: 'clamp(1.8rem, 4vw, 3rem)', letterSpacing: '-0.03em', color: 'var(--ink)' }}
      >
        Ready to pay on-chain?
      </h2>
      <p className="text-base max-w-md" style={{ color: 'var(--muted)', lineHeight: 1.75 }}>
        Connect your wallet and start moving USDC in seconds. No ETH, no friction, no intermediaries.
      </p>
      <div className="flex flex-col sm:flex-row gap-3 justify-center w-full sm:w-auto">
        <Link
          to="/pay"
          className="flex items-center justify-center gap-2 px-7 py-3.5 rounded-xl text-sm font-bold transition-all hover:scale-[1.03] active:scale-[0.98]"
          style={{ background: 'var(--accent)', color: 'var(--on-accent)' }}
        >
          Start with Payouts <ArrowRight size={15} />
        </Link>
        <Link
          to="/invoice"
          className="flex items-center justify-center gap-2 px-7 py-3.5 rounded-xl text-sm font-semibold transition-all hover:opacity-80"
          style={{ background: 'var(--surface)', color: 'var(--ink-2)', border: '1px solid var(--border-strong)' }}
        >
          <FileText size={14} /> Create an invoice
        </Link>
      </div>
    </section>
  )
}

/* ══════════════════════════════════════════════════════════════════════
   PAGE
   ══════════════════════════════════════════════════════════════════════ */
export default function HomePage() {
  const { ref: heroRef, visible: heroVisible } = useFadeIn()

  return (
    <div className="flex flex-col overflow-x-clip">

      {/* ── HERO ────────────────────────────────────────────── */}
      <section
        ref={heroRef}
        className="relative md:min-h-[80vh] flex flex-col items-center justify-center text-center gap-5 md:gap-7 py-8 md:py-16"
        style={{ opacity: heroVisible ? 1 : 0, transform: heroVisible ? 'none' : 'translateY(20px)', transition: 'opacity 0.7s ease, transform 0.7s ease' }}
      >
        {/* Logo mark, large in hero */}
        <div className="md:hidden"><PPLogo size={56} /></div>
        <div className="hidden md:block"><PPLogo size={72} /></div>

        {/* Headline */}
        <h1
          className="font-display font-bold"
          style={{ fontSize: 'clamp(2rem, 8.5vw, 5rem)', letterSpacing: '-0.04em', lineHeight: 1.05, color: 'var(--ink)' }}
        >
          Run business payments<br />
          <span style={{ color: 'var(--accent)' }}>
            Pay, approve, invoice.
          </span>
        </h1>

        {/* Sub */}
        <p
          className="text-base md:text-lg max-w-xl"
          style={{ color: 'var(--muted)', lineHeight: 1.8 }}
        >
          Pay your team in one transaction, add co-signer approval when you need it, vest salaries, release milestone payments and invoice clients in USDC or EURC.
          No sign-up. No middleman. You hold your own money, and every payment is recorded on-chain.
        </p>

        {/* CTAs */}
        <div className="flex flex-col sm:flex-row gap-3 justify-center w-full sm:w-auto">
          <Link
            to="/pay"
            className="flex items-center justify-center gap-2 px-7 py-3.5 rounded-xl text-sm font-bold transition-all hover:scale-[1.03] active:scale-[0.98]"
            style={{ background: 'var(--accent)', color: 'var(--on-accent)' }}
          >
            Launch app <ArrowRight size={15} />
          </Link>
          <a
            href="#individuals"
            className="flex items-center justify-center gap-2 px-7 py-3.5 rounded-xl text-sm font-medium transition-all hover:opacity-80"
            style={{ background: 'var(--surface)', color: 'var(--ink-2)', border: '1px solid var(--border-strong)' }}
          >
            For personal use
          </a>
        </div>

        {/* Scroll cue */}
        <div className="hidden sm:flex flex-col items-center gap-1.5 mt-4 animate-bounce opacity-50">
          <span className="text-[10px] uppercase tracking-widest font-semibold" style={{ color: 'var(--subtle)' }}>Scroll</span>
          <ArrowDown size={14} style={{ color: 'var(--subtle)' }} />
        </div>
      </section>

      {/* ── LIVE STATS ──────────────────────────────────────── */}
      <div className="flex flex-col gap-6 mb-3">
        <HomeStats />
      </div>

      {/* ── FEATURE SECTIONS ────────────────────────────────── */}
      <BandHeader
        id="enterprise"
        eyebrow="Business"
        title="Built for teams and businesses"
        sub="Payroll, vendor payouts, approvals, milestone payments and invoicing, with a permanent record of every payment."
      />
      {ENTERPRISE_FEATURES.map((f, i) => <FeatureSection key={f.to} {...f} flip={i % 2 === 1} />)}

      <BandHeader
        id="individuals"
        eyebrow="Personal"
        title="For individuals"
        sub="Everyday tools for personal use: split bills with friends, swap between USDC, EURC and cirBTC, and bridge funds to and from Arc."
      />
      {PERSONAL_FEATURES.map((f, i) => <FeatureSection key={f.to} {...f} flip={i % 2 === 1} />)}

      {/* ── FINAL CTA ───────────────────────────────────────── */}
      <FinalCTA />

    </div>
  )
}
