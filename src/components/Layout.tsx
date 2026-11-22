/**
 * RacconPay app shell.
 * App pages: fixed sidebar (collapsible) on large screens, slide-over drawer below that, and a top bar
 * with the page title, network, theme and wallet. Marketing pages (/, /privacy, /terms) get a plain header.
 */
import { useEffect, useRef, useState } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { useAccount, useDisconnect } from 'wagmi'
import { LogOut, Menu, Settings as SettingsIcon, History, UserRound, X } from 'lucide-react'
import { ThemeToggle } from '../ThemeContext'
import PPLogo from './PPLogo'
import Sidebar from './Sidebar'
import { NetworkPill, WalletStatus } from './kit/WalletStatus'
import { isMarketing, locate } from './nav'

const YEAR = new Date().getFullYear()
const COLLAPSE_KEY = 'racconpay-sidebar-collapsed'

function useEscape(open: boolean, close: () => void) {
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') close() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, close])
}

/** Small account menu: shortcuts plus disconnect. Only shown while a wallet is connected. */
function AccountMenu() {
  const { isConnected } = useAccount()
  const { disconnect } = useDisconnect()
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  useEscape(open, () => setOpen(false))
  useEffect(() => {
    if (!open) return
    const onDown = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false) }
    document.addEventListener('mousedown', onDown)
    return () => document.removeEventListener('mousedown', onDown)
  }, [open])
  if (!isConnected) return null
  const itemClass = 'flex items-center gap-2.5 w-full min-h-[40px] px-3 rounded-lg text-sm hover:bg-[var(--surface-hover)]'
  return (
    <div className="relative" ref={ref}>
      <button
        type="button" onClick={() => setOpen(o => !o)} aria-haspopup="menu" aria-expanded={open} aria-label="Account menu"
        className="w-10 h-10 rounded-lg flex items-center justify-center hover:bg-[var(--surface-hover)]"
        style={{ border: '1px solid var(--border)', color: 'var(--muted)', background: 'var(--surface)' }}
      >
        <UserRound size={17} aria-hidden="true" />
      </button>
      {open && (
        <div role="menu" className="absolute right-0 top-12 z-50 w-56 glass-strong rounded-xl p-1.5 flex flex-col">
          <Link role="menuitem" to="/history" onClick={() => setOpen(false)} className={itemClass} style={{ color: 'var(--ink)' }}>
            <History size={16} aria-hidden="true" /> Transaction history
          </Link>
          <Link role="menuitem" to="/settings" onClick={() => setOpen(false)} className={itemClass} style={{ color: 'var(--ink)' }}>
            <SettingsIcon size={16} aria-hidden="true" /> Settings
          </Link>
          <button role="menuitem" type="button" onClick={() => { disconnect(); setOpen(false) }} className={itemClass} style={{ color: 'var(--danger)' }}>
            <LogOut size={16} aria-hidden="true" /> Disconnect wallet
          </button>
        </div>
      )}
    </div>
  )
}

function AppShell({ pathname, children }: { pathname: string; children: React.ReactNode }) {
  const [collapsed, setCollapsed] = useState(() => localStorage.getItem(COLLAPSE_KEY) === '1')
  const [drawer, setDrawer] = useState(false)
  useEscape(drawer, () => setDrawer(false))
  const toggle = () => setCollapsed(c => { localStorage.setItem(COLLAPSE_KEY, c ? '0' : '1'); return !c })

  return (
    <div className="min-h-dvh" style={{ background: 'var(--bg)' }}>
      <a href="#main" className="skip-link">Skip to content</a>

      {/* Desktop sidebar */}
      <aside
        className={`hidden lg:block fixed inset-y-0 left-0 z-40 transition-[width] duration-200 ${collapsed ? 'w-[72px]' : 'w-64'}`}
        style={{ borderRight: '1px solid var(--border)' }}
      >
        <Sidebar pathname={pathname} collapsed={collapsed} onToggle={toggle} />
      </aside>

      {/* Mobile and tablet drawer */}
      {drawer && (
        <div className="lg:hidden fixed inset-0 z-[70]">
          <button type="button" aria-label="Close menu" className="absolute inset-0 cursor-default" style={{ background: 'rgba(11,18,32,0.55)' }} onClick={() => setDrawer(false)} />
          <div role="dialog" aria-modal="true" aria-label="Navigation" className="absolute inset-y-0 left-0 w-72 max-w-[85vw]" style={{ borderRight: '1px solid var(--border)' }}>
            <Sidebar pathname={pathname} onNavigate={() => setDrawer(false)} />
            <button
              type="button" onClick={() => setDrawer(false)} aria-label="Close menu"
              className="absolute top-3 right-3 w-10 h-10 rounded-lg flex items-center justify-center hover:bg-[var(--surface-hover)]"
              style={{ color: 'var(--muted)' }}
            >
              <X size={18} aria-hidden="true" />
            </button>
          </div>
        </div>
      )}

      <div className={`min-h-dvh flex flex-col transition-[padding] duration-200 ${collapsed ? 'lg:pl-[72px]' : 'lg:pl-64'}`}>
        <header
          className="sticky top-0 z-30 h-16 flex items-center justify-between gap-3 px-4 sm:px-6"
          style={{ background: 'var(--surface)', borderBottom: '1px solid var(--border)' }}
        >
          <div className="flex items-center gap-3 min-w-0">
            <button
              type="button" onClick={() => setDrawer(true)} aria-label="Open menu"
              className="lg:hidden w-10 h-10 -ml-2 rounded-lg flex items-center justify-center hover:bg-[var(--surface-hover)]"
              style={{ color: 'var(--ink-2)' }}
            >
              <Menu size={20} aria-hidden="true" />
            </button>
            <nav aria-label="Breadcrumb" className="min-w-0">
              <ol className="flex items-center gap-2 text-sm min-w-0">
                <li className="hidden sm:block" style={{ color: 'var(--muted)' }}>{locate(pathname).section ?? 'RacconPay'}</li>
                <li className="hidden sm:block" aria-hidden="true" style={{ color: 'var(--subtle)' }}>/</li>
                <li className="font-semibold truncate" aria-current="page" style={{ color: 'var(--ink)' }}>{locate(pathname).title}</li>
              </ol>
            </nav>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <NetworkPill />
            <ThemeToggle />
            <WalletStatus />
            <AccountMenu />
          </div>
        </header>

        <main id="main" key={pathname} tabIndex={-1} className="flex-1 w-full max-w-5xl mx-auto px-4 sm:px-6 py-6 sm:py-8 pb-12 page-enter outline-none">
          {children}
        </main>

        <footer className="px-4 sm:px-6 py-4 text-xs flex flex-wrap items-center justify-between gap-2" style={{ borderTop: '1px solid var(--border)', color: 'var(--muted)' }}>
          <span>© {YEAR} RacconPay · USDC payments on Arc Mainnet</span>
          <span className="flex items-center gap-4">
            <Link to="/docs" className="hover:underline">Docs</Link>
            <Link to="/privacy" className="hover:underline">Privacy</Link>
            <Link to="/terms" className="hover:underline">Terms</Link>
          </span>
        </footer>
      </div>
    </div>
  )
}

function MarketingShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-dvh flex flex-col" style={{ background: 'var(--bg)' }}>
      <a href="#main" className="skip-link">Skip to content</a>
      <header className="sticky top-0 z-40 h-16 flex items-center" style={{ background: 'var(--surface)', borderBottom: '1px solid var(--border)' }}>
        <div className="w-full max-w-5xl mx-auto px-4 sm:px-6 flex items-center justify-between gap-3">
          <Link to="/" aria-label="RacconPay home" className="flex items-center gap-2.5 shrink-0">
            <PPLogo size={30} />
            <span className="font-semibold text-[15px] tracking-tight" style={{ color: 'var(--ink)' }}>RacconPay</span>
          </Link>
          <div className="flex items-center gap-2">
            <Link to="/docs" className="hidden sm:inline-flex min-h-[40px] items-center px-3 rounded-lg text-sm font-medium hover:bg-[var(--surface-hover)]" style={{ color: 'var(--ink-2)' }}>Docs</Link>
            <ThemeToggle />
            <Link
              to="/dashboard"
              className="inline-flex min-h-[40px] items-center px-3.5 rounded-lg text-sm font-semibold"
              style={{ background: 'var(--accent)', color: 'var(--on-accent)' }}
            >
              Open app
            </Link>
          </div>
        </div>
      </header>

      <main id="main" tabIndex={-1} className="flex-1 w-full max-w-[960px] mx-auto px-3 sm:px-5 py-5 sm:py-8 pb-12 page-enter outline-none">
        {children}
      </main>

      <footer style={{ borderTop: '1px solid var(--border)' }}>
        <div className="w-full max-w-[960px] mx-auto px-6 py-5 flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-2.5">
            <PPLogo size={22} />
            <span className="text-xs font-semibold" style={{ color: 'var(--ink-2)' }}>RacconPay</span>
            <span className="text-xs" style={{ color: 'var(--muted)' }}>· Built on Arc Mainnet</span>
          </div>
          <div className="flex items-center gap-5">
            <Link to="/docs" className="text-xs font-medium hover:underline" style={{ color: 'var(--muted)' }}>Docs</Link>
            <Link to="/privacy" className="text-xs font-medium hover:underline" style={{ color: 'var(--muted)' }}>Privacy</Link>
            <Link to="/terms" className="text-xs font-medium hover:underline" style={{ color: 'var(--muted)' }}>Terms</Link>
          </div>
          <div className="flex items-center gap-3">
            <a href="https://x.com/Phoenixa104" target="_blank" rel="noreferrer" aria-label="RacconPay on X"
              className="w-10 h-10 rounded-lg flex items-center justify-center hover:bg-[var(--surface-hover)]" style={{ border: '1px solid var(--border)', color: 'var(--muted)' }}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-4.714-6.231-5.401 6.231H2.736l7.73-8.835L1.254 2.25H8.08l4.259 5.622 5.905-5.622zm-1.161 17.52h1.833L7.084 4.126H5.117z"/>
              </svg>
            </a>
            <a href="https://www.linkedin.com/in/anand-k02/" target="_blank" rel="noreferrer" aria-label="LinkedIn"
              className="w-10 h-10 rounded-lg flex items-center justify-center hover:bg-[var(--surface-hover)]" style={{ border: '1px solid var(--border)', color: 'var(--muted)' }}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                <path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433a2.062 2.062 0 01-2.063-2.065 2.064 2.064 0 112.063 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z"/>
              </svg>
            </a>
            <a href="https://phoenixanand.vercel.app/" target="_blank" rel="noreferrer" aria-label="Personal website"
              className="w-10 h-10 rounded-lg flex items-center justify-center hover:bg-[var(--surface-hover)]" style={{ border: '1px solid var(--border)', color: 'var(--muted)' }}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <circle cx="12" cy="12" r="10"/><line x1="2" y1="12" x2="22" y2="12"/>
                <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/>
              </svg>
            </a>
          </div>
        </div>
        <div className="w-full px-6 py-3 text-center text-[11px]" style={{ borderTop: '1px solid var(--border)', color: 'var(--muted)' }}>
          © {YEAR} RacconPay · USDC payments on Arc Mainnet
        </div>
      </footer>
    </div>
  )
}

export default function Layout({ children }: { children: React.ReactNode }) {
  const { pathname } = useLocation()
  return isMarketing(pathname)
    ? <MarketingShell>{children}</MarketingShell>
    : <AppShell pathname={pathname}>{children}</AppShell>
}
