/**
 * RacconPay — Warm Earth Layout
 * Desktop: sticky full-width top navbar (logo · nav · wallet)
 * Mobile:  slim top bar + scrollable bottom tab nav
 */
import { Link, useLocation } from 'react-router-dom'
import { ConnectKitButton } from 'connectkit'
import {
  Send, Clock, Users, Home,
  FileText, ShieldCheck, BookOpen, PieChart,
} from 'lucide-react'
import { ThemeToggle } from '../ThemeContext'
import PPLogo from './PPLogo'

const YEAR = new Date().getFullYear()

const NAV = [
  { to: '/',           label: 'Home',       icon: Home,        accent: 'var(--accent)'          },
  { to: '/pay',        label: 'Batch Pay',  icon: Send,        accent: 'var(--pay-accent)'      },
  { to: '/multisig',   label: 'Multi-Sig',  icon: ShieldCheck, accent: 'var(--pay-accent)'      },
  { to: '/vesting',    label: 'Vesting',    icon: Clock,       accent: 'var(--vest-accent)'     },
  { to: '/split',      label: 'Bill Split', icon: Users,       accent: 'var(--split-accent)'    },
  { to: '/invoice',    label: 'Invoices',  icon: FileText, accent: 'var(--receipt-accent)' },
  { to: '/dashboard',  label: 'Dashboard',  icon: PieChart,    accent: 'var(--accent)'          },
  { to: '/docs',       label: 'Docs',       icon: BookOpen,    accent: 'var(--accent)'          },
]

function TopNavLink({ to, label, accent, active }: {
  to: string; label: string; accent: string; active: boolean
}) {
  return (
    <Link
      to={to}
      className={`relative px-3 py-1.5 text-sm font-medium rounded-lg transition-all duration-150 whitespace-nowrap ${active ? 'nav-item-active' : ''}`}
      style={{
        '--item-accent': accent,
        color:      active ? 'var(--ink)'  : 'var(--muted)',
        background: active ? `color-mix(in srgb, ${accent} 10%, transparent)` : 'transparent',
      } as React.CSSProperties}
    >
      {label}
    </Link>
  )
}

export default function Layout({ children }: { children: React.ReactNode }) {
  const { pathname } = useLocation()

  return (
    <div
      className="app-shell"
      style={{ background: 'var(--bg)', backgroundImage: 'var(--bg-gradient)', backgroundAttachment: 'fixed' }}
    >
      {/* ── Warm orbs ─────────────────────────────────────────── */}
      <div className="orb orb-a" />
      <div className="orb orb-b" />
      <div className="orb orb-c" />

      {/* ── Paper dot-grid ────────────────────────────────────── */}
      <div className="dot-grid" />

      {/* ── Grain / noise texture ─────────────────────────────── */}
      <div className="grain" />

      {/* ════════════════════════════════════════════════════════
          DESKTOP TOP NAVBAR
          ════════════════════════════════════════════════════════ */}
      <header className="app-topnav">
        <div className="relative z-10 w-full flex items-center justify-between px-6 gap-4">

          {/* Left: Logo */}
          <Link to="/" className="flex items-center gap-2.5 shrink-0">
            <PPLogo size={34} />
            <span className="font-display font-bold text-sm tracking-tight" style={{ color: 'var(--ink)' }}>
              RacconPay
            </span>
          </Link>

          {/* Center: Nav links */}
          <nav className="hidden md:flex items-center gap-0.5 overflow-x-auto no-scrollbar flex-1 justify-center">
            {NAV.map(item => (
              <TopNavLink
                key={item.to}
                to={item.to}
                label={item.label}
                accent={item.accent}
                active={item.to === '/' ? pathname === '/' : pathname.startsWith(item.to)}
              />
            ))}
          </nav>

          {/* Right: Network badge + theme toggle + wallet */}
          <div className="flex items-center gap-2.5 shrink-0">
            <div
              className="hidden lg:flex items-center gap-2 px-3 py-1.5 rounded-xl"
              style={{
                background: 'rgba(74,140,92,0.08)',
                border: '1px solid rgba(74,140,92,0.22)',
              }}
            >
              <span className="relative flex items-center justify-center w-2 h-2 shrink-0">
                <span
                  className="absolute inline-flex h-full w-full rounded-full opacity-75"
                  style={{ background: 'var(--success)', animation: 'pulse-ring 1.8s ease-out infinite' }}
                />
                <span className="relative inline-flex rounded-full w-1.5 h-1.5" style={{ background: 'var(--success)' }} />
              </span>
              <span className="text-xs font-semibold" style={{ color: 'var(--success)' }}>Arc Mainnet</span>
            </div>
            <ThemeToggle />
            <ConnectKitButton />
          </div>
        </div>
      </header>

      {/* ════════════════════════════════════════════════════════
          MOBILE TOP BAR
          ════════════════════════════════════════════════════════ */}
      <header
        className="md:hidden sticky top-0 z-40 flex items-center justify-between px-4 h-14"
        style={{
          background: 'var(--mobile-topbar-bg)',
          backdropFilter: 'blur(16px)',
          borderBottom: '1px solid var(--border)',
        }}
      >
        <Link to="/" className="flex items-center gap-2">
          <PPLogo size={28} wordmark />
        </Link>
        <div className="flex items-center gap-2">
          <ThemeToggle />
          <ConnectKitButton />
        </div>
      </header>

      {/* ════════════════════════════════════════════════════════
          MAIN CONTENT
          ════════════════════════════════════════════════════════ */}
      <div className="app-main flex flex-col">
        <main key={pathname} className="relative z-10 flex-1 w-full max-w-[960px] mx-auto px-3 sm:px-5 py-5 sm:py-8 pb-20 md:pb-10 page-enter">
          {children}
        </main>

        {/* Footer */}
        <footer
          className="relative z-10 border-t"
          style={{ borderColor: 'var(--border)' }}
        >
          {/* Main footer row */}
          <div className="w-full max-w-[960px] mx-auto px-6 py-5 flex flex-col sm:flex-row items-center justify-between gap-4">
            {/* Left: brand */}
            <div className="flex items-center gap-2.5">
              <PPLogo size={22} />
              <span className="text-xs font-semibold" style={{ color: 'var(--ink-2)' }}>RacconPay</span>
              <span className="text-xs" style={{ color: 'var(--subtle)' }}>· Built on Arc Mainnet</span>
            </div>

            {/* Center: nav links */}
            <div className="flex items-center gap-5">
              <Link to="/docs" className="text-xs font-medium transition-opacity hover:opacity-70" style={{ color: 'var(--muted)' }}>Docs</Link>
              <Link to="/privacy" className="text-xs font-medium transition-opacity hover:opacity-70" style={{ color: 'var(--muted)' }}>Privacy</Link>
              <Link to="/terms" className="text-xs font-medium transition-opacity hover:opacity-70" style={{ color: 'var(--muted)' }}>Terms</Link>
            </div>

            {/* Right: social icons */}
            <div className="flex items-center gap-3">
              {/* X / Twitter */}
              <a href="https://x.com/Phoenixa104" target="_blank" rel="noreferrer"
                className="w-8 h-8 rounded-xl flex items-center justify-center transition-all hover:scale-110"
                style={{ background: 'var(--surface-strong)', border: '1px solid var(--border-strong)', color: 'var(--muted)' }}
                title="X / Twitter"
              >
                <svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-4.714-6.231-5.401 6.231H2.736l7.73-8.835L1.254 2.25H8.08l4.259 5.622 5.905-5.622zm-1.161 17.52h1.833L7.084 4.126H5.117z"/>
                </svg>
              </a>
              {/* LinkedIn */}
              <a href="https://www.linkedin.com/in/anand-k02/" target="_blank" rel="noreferrer"
                className="w-8 h-8 rounded-xl flex items-center justify-center transition-all hover:scale-110"
                style={{ background: 'var(--surface-strong)', border: '1px solid var(--border-strong)', color: 'var(--muted)' }}
                title="LinkedIn"
              >
                <svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433a2.062 2.062 0 01-2.063-2.065 2.064 2.064 0 112.063 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z"/>
                </svg>
              </a>
              {/* Personal website */}
              <a href="https://phoenixanand.vercel.app/" target="_blank" rel="noreferrer"
                className="w-8 h-8 rounded-xl flex items-center justify-center transition-all hover:scale-110"
                style={{ background: 'var(--surface-strong)', border: '1px solid var(--border-strong)', color: 'var(--muted)' }}
                title="Personal Website"
              >
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="12" cy="12" r="10"/><line x1="2" y1="12" x2="22" y2="12"/>
                  <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/>
                </svg>
              </a>
            </div>
          </div>

          {/* Bottom bar */}
          <div
            className="w-full border-t px-6 py-3 flex items-center justify-center"
            style={{ borderColor: 'var(--border)' }}
          >
            <span className="text-[11px]" style={{ color: 'var(--subtle)' }}>
              © {YEAR} RacconPay · USDC payments on Arc Mainnet
            </span>
          </div>
        </footer>
      </div>

      {/* ════════════════════════════════════════════════════════
          MOBILE BOTTOM TAB NAV
          ════════════════════════════════════════════════════════ */}
      <nav
        className="md:hidden fixed bottom-0 inset-x-0 z-50 flex items-center overflow-x-auto no-scrollbar"
        style={{
          height: 62,
          paddingBottom: 'env(safe-area-inset-bottom)',
          background: 'var(--mobile-topbar-bg)',
          backdropFilter: 'blur(18px)',
          borderTop: '1px solid var(--border)',
          boxShadow: '0 -1px 0 rgba(160,100,40,0.08)',
        }}
      >
        {NAV.map(({ to, label, icon: Icon, accent }) => {
          const active = to === '/' ? pathname === '/' : pathname.startsWith(to)
          return (
            <Link
              key={to}
              to={to}
              className="flex flex-col items-center justify-center gap-0.5 py-1.5 transition-all shrink-0"
              style={{ minWidth: 52, flex: '1 0 52px', color: active ? accent : 'var(--subtle)' }}
            >
              <span
                className="flex items-center justify-center rounded-xl transition-all"
                style={{
                  width:      active ? 40 : 32,
                  height:     active ? 26 : 22,
                  background: active ? `color-mix(in srgb, ${accent} 16%, transparent)` : 'transparent',
                  border:     active ? `1px solid color-mix(in srgb, ${accent} 28%, transparent)` : '1px solid transparent',
                }}
              >
                <Icon size={active ? 18 : 15} strokeWidth={active ? 2.2 : 1.6} />
              </span>
              <span
                className="font-medium leading-none transition-all"
                style={{
                  fontSize:  active ? 10 : 9,
                  maxWidth:  52,
                  textAlign: 'center',
                  fontWeight: active ? 700 : 500,
                }}
              >
                {label}
              </span>
            </Link>
          )
        })}
      </nav>
    </div>
  )
}
