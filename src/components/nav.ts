/** App navigation. One list drives the sidebar, the mobile drawer and the top-bar title. */
import {
  LayoutDashboard, Send, Clock, Users, FileText, History, Settings,
  Repeat, Waypoints, Handshake, BookOpen, Wallet,
} from 'lucide-react'

export interface NavItem {
  to: string
  label: string
  icon: React.ElementType
  /** Extra paths that should highlight this item. */
  alsoMatches?: string[]
}

export interface NavGroup {
  id: 'business' | 'personal' | 'global'
  label: string
  items: NavItem[]
}

export const NAV_GROUPS: NavGroup[] = [
  {
    id: 'business',
    label: 'Business',
    items: [
      { to: '/dashboard', label: 'Overview',     icon: LayoutDashboard },
      { to: '/pay',       label: 'Payouts',      icon: Send, alsoMatches: ['/multisig'] },
      { to: '/vesting',   label: 'Vesting',      icon: Clock },
      { to: '/invoice',   label: 'Invoices',     icon: FileText, alsoMatches: ['/pay-invoice'] },
      { to: '/escrow',    label: 'Escrow',       icon: Handshake },
    ],
  },
  {
    id: 'personal',
    label: 'Personal',
    items: [
      { to: '/personal', label: 'Personal Overview', icon: Wallet },
      { to: '/split',    label: 'Bill Split',        icon: Users },
      { to: '/swap',     label: 'Swap',              icon: Repeat },
      { to: '/bridge',   label: 'Bridge',            icon: Waypoints },
    ],
  },
  {
    id: 'global',
    label: 'Global',
    items: [
      { to: '/history',  label: 'Transaction History', icon: History },
      { to: '/settings', label: 'Settings',            icon: Settings },
      { to: '/docs',     label: 'Docs',                icon: BookOpen },
    ],
  },
]

/** Pages that render on the plain layout without the sidebar. /pay-invoice is opened by payers who are not RacconPay users. */
export const MARKETING_PATHS = ['/', '/privacy', '/terms', '/pay-invoice']

export function isMarketing(pathname: string): boolean {
  return MARKETING_PATHS.includes(pathname)
}

export function isActive(item: NavItem, pathname: string): boolean {
  const match = (to: string) => pathname === to || pathname.startsWith(`${to}/`)
  return match(item.to) || (item.alsoMatches ?? []).some(match)
}

/** Section and title for the top bar. Falls back to the app name for unknown paths. */
export function locate(pathname: string): { section: string | null; title: string } {
  for (const g of NAV_GROUPS) {
    const hit = g.items.find(i => isActive(i, pathname))
    if (hit) return { section: g.label, title: hit.label }
  }
  return { section: null, title: 'RacconPay' }
}

export function titleFor(pathname: string): string {
  return locate(pathname).title
}
