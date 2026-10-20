/**
 * RacconPay — Feature Scroll Home
 *
 * Structure:
 *  1. Hero          — full-height opener, big catchphrase, CTA
 *  2. Stats strip   — 4 live numbers
 *  3. Feature sections (×4) — alternating left/right, each tool gets a full section
 *  4. Manifesto strip — bold single-line statements scrolling through
 *  5. Final CTA     — "Ready to pay?" section
 */
import { Link } from 'react-router-dom'
import { useRef } from 'react'
import {
  Send, Clock, Users, Layers,
  ArrowRight, ArrowDown, Zap, Shield, Globe,
  CheckCircle2, Copy, FileText, ShieldCheck,
} from 'lucide-react'
import { useState, useEffect } from 'react'
import PPLogo from './PPLogo'

/* ── USDC address ─────────────────────────────────────────────────── */
const USDC_FULL = '0x3600000000000000000000000000000000000000'
const USDC_SHORT = '0x3600…0000'

/* ══════════════════════════════════════════════════════════════════════
   FEATURE SECTIONS DATA
   ══════════════════════════════════════════════════════════════════════ */
const FEATURES = [
  {
    to:        '/pay',
    icon:      Send,
    eyebrow:   'Batch Payout',
    headline:  'Pay 100 people\n In One Transaction.',
    sub:       'Stop opening your wallet 100 times. Upload a CSV, check the list, approve once. Everyone gets their USDC at the same time and A soul-bound receipt NFT is minted to your wallet as permanent proof.',
    bullets:   ['CSV upload or manual entry', 'Soul-bound ERC-721 receipt', 'Up to 100 people per payment. Need more? Send in batches', 'Permanent on-chain receipt for your records'],
    accent:    'var(--pay-accent)',
    glow:      'rgba(196,120,42,0.12)',
    mockBg:    'rgba(196,120,42,0.06)',
    flip:      false,
    MockUI:    BatchMock,
  },
  {
    to:        '/vesting',
    icon:      Clock,
    eyebrow:   'Vesting Streams',
    headline:  'Set it,\nLock it,\nLet it flow.',
    sub:       'Lock USDC for a team member or contractor and release it linearly over any duration. They pull their vested share whenever they want. If plans change, cancel anytime, they keep what they’ve earned, and the rest comes back to you.',
    bullets:   ['Linear vesting over any duration', 'Recipient withdraws earned USDC anytime', 'Cancel anytime, with a fair split of the money', 'Dashboards for both sender and recipient'],
    accent:    'var(--vest-accent)',
    glow:      'rgba(124,90,46,0.12)',
    mockBg:    'rgba(124,90,46,0.06)',
    flip:      true,
    MockUI:    VestingMock,
  },
  {
    to:        '/split',
    icon:      Users,
    eyebrow:   'Bill Splitter',
    headline:  'Dinner was $120,\nNobody has cash,\nSolved.',
    sub:       'Add the bill, split it equally, and share a QR code or link. Each friend pays their share straight to you in USDC. No chasing, no IOUs. Works best for groups who already hold USDC.',
    bullets:   ['Equal split across everyone in the group', 'Share by QR code or invite link', 'Each share goes straight to the person who paid', 'See who has paid and who hasn’t'],
    accent:    'var(--split-accent)',
    glow:      'rgba(90,122,74,0.12)',
    mockBg:    'rgba(90,122,74,0.06)',
    flip:      false,
    MockUI:    SplitMock,
  },
  {
    to:        '/dashboard?tab=receipts',
    icon:      Layers,
    eyebrow:   'Audit Trail · Receipts',
    headline:  'Proof of payment,\nForever on-chain.',
    sub:       'Every batch payout mints a soul-bound NFT to your wallet. Non-transferable.Every batch payout gives you a receipt saved on-chain. It shows who you paid, how much, and when. It can’t be edited or deleted, and it can’t be sent to anyone else.',
    bullets:   ['Soul-bound ERC-721 (non-transferable)', 'Stores payer, recipients, amounts', 'Timestamp + tx hash on-chain', 'Find all your receipts when you connect your wallet'],
    accent:    'var(--receipt-accent)',
    glow:      'rgba(176,74,46,0.12)',
    mockBg:    'rgba(176,74,46,0.06)',
    flip:      true,
    MockUI:    ReceiptMock,
  },
]

const MANIFESTO = [
  'Pay many people in one transaction',
  'Fees in USDC. No other token needed',
  'Receipts that can’t be edited or deleted',
  'Salaries paid as they’re earned, not from a spreadsheet',
  'Split the bill without chasing anyone',
  'No sign-up. No custodian. Just your wallet',
  'RacconPay: send, split, stream and invoice in USDC.',
]

/* ══════════════════════════════════════════════════════════════════════
   MOCK UI ILLUSTRATIONS  (right-side visuals per feature section)
   ══════════════════════════════════════════════════════════════════════ */
function MockCard({ accent, mockBg, children }: { accent: string; mockBg: string; children: React.ReactNode }) {
  return (
    <div
      className="rounded-2xl p-5 flex flex-col gap-3 w-full"
      style={{ background: mockBg, border: `1px solid ${accent}30`, boxShadow: `0 8px 32px ${accent}15` }}
    >
      {children}
    </div>
  )
}

function MockRow({ label, value, accent }: { label: string; value: string; accent: string }) {
  return (
    <div className="flex items-center justify-between py-2 border-b" style={{ borderColor: `${accent}18` }}>
      <span className="text-xs font-mono" style={{ color: 'var(--muted)' }}>{label}</span>
      <span className="text-xs font-semibold font-mono" style={{ color: 'var(--ink)' }}>{value}</span>
    </div>
  )
}

function MockPill({ label, accent }: { label: string; accent: string }) {
  return (
    <span
      className="text-[10px] font-semibold px-2.5 py-1 rounded-full"
      style={{ background: `${accent}18`, color: accent, border: `1px solid ${accent}30` }}
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
      <div className="flex items-center justify-between mb-1">
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
        style={{ background: accent, color: '#fff8f0' }}
      >
        Approve &amp; Send →
      </div>
    </MockCard>
  )
}

function VestingMock({ accent, mockBg }: { accent: string; mockBg: string }) {
  return (
    <MockCard accent={accent} mockBg={mockBg}>
      <div className="flex items-center justify-between mb-1">
        <span className="text-xs font-semibold" style={{ color: 'var(--ink)' }}>Stream #4 · Active</span>
        <MockPill label="68% vested" accent={accent} />
      </div>
      <div className="flex flex-col gap-1">
        <div className="flex justify-between text-[10px]" style={{ color: 'var(--muted)' }}>
          <span>Progress</span><span>680 / 1,000 USDC</span>
        </div>
        <div className="h-2.5 rounded-full overflow-hidden" style={{ background: `${accent}20` }}>
          <div className="h-full rounded-full transition-all" style={{ width: '68%', background: accent }} />
        </div>
      </div>
      <MockRow label="Beneficiary" value="0x59f3…0699" accent={accent} />
      <MockRow label="Duration" value="365 days" accent={accent} />
      <MockRow label="Claimable now" value="42.50 USDC" accent={accent} />
      <div
        className="w-full text-center py-2.5 rounded-xl text-xs font-bold mt-1"
        style={{ background: accent, color: '#fff8f0' }}
      >
        Claim 42.50 USDC →
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
      <div className="flex items-center justify-between mb-1">
        <span className="text-xs font-semibold" style={{ color: 'var(--ink)' }}>Weekend Trip</span>
        <MockPill label="3 members" accent={accent} />
      </div>
      {members.map(m => (
        <div key={m.name} className="flex items-center justify-between py-1.5 border-b" style={{ borderColor: `${accent}18` }}>
          <span className="text-xs" style={{ color: 'var(--ink)' }}>{m.name}</span>
          <span className="text-xs font-bold font-mono" style={{ color: m.color }}>{m.owed} USDC</span>
        </div>
      ))}
      <div className="flex gap-2 mt-1">
        <div
          className="flex-1 text-center py-2 rounded-xl text-[11px] font-bold"
          style={{ background: accent, color: '#fff8f0' }}
        >
          Settle →
        </div>
        <div
          className="flex-1 text-center py-2 rounded-xl text-[11px] font-semibold"
          style={{ background: `${accent}18`, color: accent, border: `1px solid ${accent}30` }}
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
      <div className="flex items-center justify-between mb-1">
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
   COUNT-UP hook — animates a number from 0 to target when visible
   ══════════════════════════════════════════════════════════════════════ */
function useCountUp(target: number, duration = 1200) {
  const [count, setCount] = useState(0)
  const [started, setStarted] = useState(false)
  const ref = useRef<HTMLSpanElement>(null)

  useEffect(() => {
    const el = ref.current
    if (!el) return
    const obs = new IntersectionObserver(
      ([entry]) => { if (entry.isIntersecting) setStarted(true) },
      { threshold: 0.4 },
    )
    obs.observe(el)
    return () => obs.disconnect()
  }, [])

  useEffect(() => {
    if (!started) return
    const start = performance.now()
    const tick = (now: number) => {
      const p = Math.min((now - start) / duration, 1)
      const ease = 1 - Math.pow(1 - p, 3)
      setCount(Math.round(target * ease))
      if (p < 1) requestAnimationFrame(tick)
    }
    requestAnimationFrame(tick)
  }, [started, target, duration])

  return { ref, count }
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
function FeatureSection({
  to, icon: Icon, eyebrow, headline, sub, bullets, accent, glow, mockBg, flip, MockUI,
}: typeof FEATURES[0]) {
  const { ref, visible } = useFadeIn()
  const lines = headline.split('\n')

  return (
    <section
      ref={ref}
      className="relative py-16 md:py-24"
      style={{
        opacity:    visible ? 1 : 0,
        transform:  visible ? 'none' : 'translateY(32px)',
        transition: 'opacity 0.65s ease, transform 0.65s ease',
      }}
    >
      {/* Section glow blob */}
      <div
        className="absolute pointer-events-none"
        style={{
          width: 480, height: 480,
          borderRadius: '50%',
          background: `radial-gradient(circle, ${glow} 0%, transparent 70%)`,
          filter: 'blur(60px)',
          top: '10%',
          [flip ? 'left' : 'right']: '-10%',
          zIndex: 0,
        }}
      />

      <div className={`relative z-10 flex flex-col ${flip ? 'md:flex-row-reverse' : 'md:flex-row'} gap-12 md:gap-16 items-center`}>

        {/* ── Text column ─────────────────────────────────────── */}
        <div className="flex-1 flex flex-col gap-6">
          {/* Eyebrow */}
          <div className="flex items-center gap-2">
            <span
              className="flex items-center justify-center w-7 h-7 rounded-lg"
              style={{ background: `${accent}20`, border: `1px solid ${accent}35` }}
            >
              <Icon size={14} style={{ color: accent }} />
            </span>
            <span
              className="text-[11px] font-bold uppercase tracking-[0.14em]"
              style={{ color: accent }}
            >
              {eyebrow}
            </span>
          </div>

          {/* Headline — each line large */}
          <h2
            className="font-display font-bold leading-[1.06]"
            style={{ fontSize: 'clamp(2rem, 4vw, 3.2rem)', letterSpacing: '-0.03em', color: 'var(--ink)' }}
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
                  style={{ background: `${accent}20` }}
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
            className="self-start flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-bold transition-all hover:scale-[1.03] active:scale-[0.98]"
            style={{
              background: accent,
              color: '#fff8f0',
              boxShadow: `0 4px 16px ${accent}40`,
            }}
          >
            Open {eyebrow.split(' · ')[1]} <ArrowRight size={14} />
          </Link>
        </div>

        {/* ── Mock UI column ──────────────────────────────────── */}
        <div className="flex-1 w-full max-w-sm">
          <MockUI accent={accent} mockBg={mockBg} />
        </div>

      </div>

      {/* Section divider */}
      <div
        className="absolute bottom-0 left-0 right-0 h-px"
        style={{ background: `linear-gradient(90deg, transparent, ${accent}30, transparent)` }}
      />
    </section>
  )
}

/* ══════════════════════════════════════════════════════════════════════
   STATS STRIP
   ══════════════════════════════════════════════════════════════════════ */
function StatsStrip() {
  const [copied, setCopied] = useState(false)
  const copy = () => {
    void navigator.clipboard.writeText(USDC_FULL).then(() => {
      setCopied(true); setTimeout(() => setCopied(false), 2000)
    })
  }

  return (
    <div
      className="flex flex-wrap gap-4 md:gap-0 divide-y md:divide-y-0 md:divide-x rounded-2xl overflow-hidden"
      style={{ border: '1px solid var(--border)', background: 'var(--surface)' }}
    >
      {[
        {
          label: 'Network',
          value: (
            <span className="flex items-center gap-1.5">
              <span className="relative flex h-2 w-2 shrink-0">
                <span className="absolute inline-flex h-full w-full rounded-full opacity-75"
                      style={{ background: 'var(--success)', animation: 'pulse-ring 1.8s ease-out infinite' }} />
                <span className="relative inline-flex rounded-full h-1.5 w-1.5 mt-0.5 ml-0.5"
                      style={{ background: 'var(--success)' }} />
              </span>
              Arc Mainnet
            </span>
          ),
          sub: 'Chain ID 5042',
        },
        {
          label: 'USDC Token',
          value: (
            <span className="flex items-center gap-1.5">
              <span className="font-mono text-xs">{USDC_SHORT}</span>
              <button onClick={copy} className="transition-opacity hover:opacity-70"
                      style={{ color: copied ? 'var(--success)' : 'var(--subtle)' }}>
                {copied ? <CheckCircle2 size={12} /> : <Copy size={12} />}
              </button>
            </span>
          ),
          sub: '6 decimals · ERC-20',
        },
        {
          label: 'Gas Token',
          value: <span style={{ color: 'var(--pay-accent)' }}>USDC (not ETH)</span>,
          sub: 'Predictable fees',
        },
        {
          label: 'Contracts',
          value: (
            <span className="flex items-center gap-1.5">
              <CheckCircle2 size={14} style={{ color: 'var(--success)' }} />
              5 deployed
            </span>
          ),
          sub: 'Audited · Arc Mainnet',
        },
      ].map(({ label, value, sub }) => (
        <div key={label} className="flex-1 min-w-[140px] flex flex-col gap-1 px-5 py-4">
          <p className="text-[9px] font-bold uppercase tracking-[0.12em]" style={{ color: 'var(--subtle)' }}>{label}</p>
          <div className="text-sm font-semibold" style={{ color: 'var(--ink)' }}>{value}</div>
          <p className="text-[10px]" style={{ color: 'var(--subtle)' }}>{sub}</p>
        </div>
      ))}
    </div>
  )
}

/* ══════════════════════════════════════════════════════════════════════
   MANIFESTO STRIP
   ══════════════════════════════════════════════════════════════════════ */
function ManifestoStrip() {
  const { ref, visible } = useFadeIn()
  return (
    <section
      ref={ref}
      className="py-16 md:py-24 flex flex-col gap-6"
      style={{ opacity: visible ? 1 : 0, transform: visible ? 'none' : 'translateY(24px)', transition: 'opacity 0.6s ease, transform 0.6s ease' }}
    >
      <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-center" style={{ color: 'var(--subtle)' }}>
        Why RacconPay
      </p>
      <div className="flex flex-col gap-3">
        {MANIFESTO.map((line, i) => (
          <p
            key={i}
            className="font-display font-bold text-center leading-tight"
            style={{
              fontSize: 'clamp(1.3rem, 3vw, 2.2rem)',
              letterSpacing: '-0.025em',
              color: i === MANIFESTO.length - 1 ? 'var(--pay-accent)' : 'var(--ink)',
              opacity: 0.55 + (i / MANIFESTO.length) * 0.45,
            }}
          >
            {line}
          </p>
        ))}
      </div>
    </section>
  )
}

/* ══════════════════════════════════════════════════════════════════════
   WHY STRIP
   ══════════════════════════════════════════════════════════════════════ */
function WhyCounter({ n, suffix = '' }: { n: number; suffix?: string }) {
  const { ref, count } = useCountUp(n, 1400)
  return <span ref={ref} className="font-bold" style={{ color: 'var(--accent)' }}>{count}{suffix}</span>
}

function WhyStrip() {
  const { ref, visible } = useFadeIn()
  return (
    <section
      ref={ref}
      className="py-10"
      style={{ opacity: visible ? 1 : 0, transform: visible ? 'none' : 'translateY(24px)', transition: 'opacity 0.6s ease, transform 0.6s ease' }}
    >
      <div className="grid sm:grid-cols-3 gap-6">
        {([
          {
            icon: Zap, color: 'var(--pay-accent)', title: 'USDC as Gas',
            desc: <>Arc uses USDC as its native gas token. No ETH, no price swings, every fee is a predictable dollar amount.</>,
          },
          {
            icon: Shield, color: 'var(--vest-accent)', title: 'Audited Contracts',
            desc: <>Solidity-rule and functional audits before every deployment. Critical findings fixed. <WhyCounter n={154} /> unit tests passing.</>,
          },
          {
            icon: Globe, color: 'var(--split-accent)', title: 'Non-Custodial',
            desc: <>No backend wallet, no custodian. Your MetaMask signs every transaction your keys, your funds, always.</>,
          },
        ] as const).map(({ icon: Icon, color, title, desc }) => (
          <div key={title} className="flex flex-col gap-3">
            <div
              className="w-10 h-10 rounded-xl flex items-center justify-center"
              style={{ background: `color-mix(in srgb, ${color} 14%, transparent)`, border: `1px solid ${color}30` }}
            >
              <Icon size={18} style={{ color }} />
            </div>
            <p className="font-display font-semibold text-sm" style={{ color: 'var(--ink)' }}>{title}</p>
            <p className="text-sm leading-relaxed" style={{ color: 'var(--muted)' }}>{desc}</p>
          </div>
        ))}
      </div>
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
      className="py-20 flex flex-col items-center text-center gap-6"
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
      <div className="flex flex-wrap gap-3 justify-center">
        <Link
          to="/pay"
          className="flex items-center gap-2 px-7 py-3.5 rounded-xl text-sm font-bold transition-all hover:scale-[1.03] active:scale-[0.98]"
          style={{ background: 'linear-gradient(135deg, var(--pay-accent) 0%, var(--receipt-accent) 100%)', color: '#fff8f0', boxShadow: '0 4px 20px rgba(196,120,42,0.3)' }}
        >
          Start with Batch Pay <ArrowRight size={15} />
        </Link>
        <Link
          to="/invoice"
          className="flex items-center gap-2 px-7 py-3.5 rounded-xl text-sm font-semibold transition-all hover:opacity-80"
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
    <div className="flex flex-col">

      {/* ── HERO ────────────────────────────────────────────── */}
      <section
        ref={heroRef}
        className="relative min-h-[80vh] flex flex-col items-center justify-center text-center gap-7 py-16"
        style={{ opacity: heroVisible ? 1 : 0, transform: heroVisible ? 'none' : 'translateY(20px)', transition: 'opacity 0.7s ease, transform 0.7s ease' }}
      >
        {/* Hero local glow orbs */}
        <div className="absolute -top-16 left-1/4 w-80 h-80 rounded-full pointer-events-none"
             style={{ background: 'radial-gradient(circle, rgba(196,120,42,0.12) 0%, transparent 70%)', filter: 'blur(50px)' }} />
        <div className="absolute top-1/4 right-1/4 w-60 h-60 rounded-full pointer-events-none"
             style={{ background: 'radial-gradient(circle, rgba(176,74,46,0.10) 0%, transparent 70%)', filter: 'blur(50px)' }} />

        {/* Logo mark — large in hero */}
        <PPLogo size={72} />

        {/* Eyebrow badge */}
        <div
          className="flex items-center gap-2 px-4 py-1.5 rounded-full text-[11px] font-semibold"
          style={{ background: 'var(--surface)', border: '1px solid var(--border-strong)', color: 'var(--muted)' }}
        >
          <span className="relative flex h-1.5 w-1.5">
            <span className="absolute inline-flex h-full w-full rounded-full opacity-75"
                  style={{ background: 'var(--success)', animation: 'pulse-ring 1.8s ease-out infinite' }} />
            <span className="relative inline-flex rounded-full h-1.5 w-1.5" style={{ background: 'var(--success)' }} />
          </span>
          Live on Arc Mainnet · USDC only
        </div>

        {/* Headline */}
        <h1
          className="font-display font-bold"
          style={{ fontSize: 'clamp(2.6rem, 6vw, 5rem)', letterSpacing: '-0.04em', lineHeight: 1.02, color: 'var(--ink)' }}
        >
          Pay anyone in USDC<br />
          <span style={{
            background: 'linear-gradient(135deg, var(--pay-accent) 0%, var(--receipt-accent) 70%)',
            WebkitBackgroundClip: 'text',
            WebkitTextFillColor: 'transparent',
            backgroundClip: 'text',
          }}>
            Split, stream, invoice.
          </span>
        </h1>

        {/* Sub */}
        <p
          className="text-base md:text-lg max-w-xl"
          style={{ color: 'var(--muted)', lineHeight: 1.8 }}
        >
           Pay your team, split bills, vest salaries and send invoices, all in USDC. 
					 No sign-up. No middleman. You hold your own money, and every payment is recorded on-chain.
        </p>

        {/* CTAs */}
        <div className="flex flex-wrap gap-3 justify-center">
          <Link
            to="/pay"
            className="flex items-center gap-2 px-7 py-3.5 rounded-xl text-sm font-bold transition-all hover:scale-[1.03] active:scale-[0.98]"
            style={{ background: 'linear-gradient(135deg, var(--pay-accent) 0%, var(--receipt-accent) 100%)', color: '#fff8f0', boxShadow: '0 4px 20px rgba(196,120,42,0.28)' }}
          >
            Launch app <ArrowRight size={15} />
          </Link>
          <Link
            to="/split"
            className="flex items-center gap-2 px-7 py-3.5 rounded-xl text-sm font-medium transition-all hover:opacity-80"
            style={{ background: 'var(--surface)', color: 'var(--ink-2)', border: '1px solid var(--border-strong)' }}
          >
            Split a bill
          </Link>
        </div>

        {/* Scroll cue */}
        <div className="flex flex-col items-center gap-1.5 mt-4 animate-bounce opacity-50">
          <span className="text-[10px] uppercase tracking-widest font-semibold" style={{ color: 'var(--subtle)' }}>Scroll</span>
          <ArrowDown size={14} style={{ color: 'var(--subtle)' }} />
        </div>
      </section>

      {/* ── STATS STRIP ─────────────────────────────────────── */}
      <StatsStrip />

      {/* ── FEATURE SECTIONS ────────────────────────────────── */}
      {FEATURES.map(f => <FeatureSection key={f.to} {...f} />)}

      {/* ── MANIFESTO ───────────────────────────────────────── */}
      <ManifestoStrip />

      {/* ── WHY STRIP ───────────────────────────────────────── */}
      <WhyStrip />

      {/* ── FINAL CTA ───────────────────────────────────────── */}
      <FinalCTA />

    </div>
  )
}
