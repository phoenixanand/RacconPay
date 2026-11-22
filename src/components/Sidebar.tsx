/** Sidebar navigation. Used as the fixed desktop rail and inside the mobile drawer. */
import { Link } from 'react-router-dom'
import { ChevronsLeft, ChevronsRight } from 'lucide-react'
import PPLogo from './PPLogo'
import { NAV_GROUPS, isActive, type NavItem } from './nav'

function Item({ item, pathname, collapsed, onNavigate }: {
  item: NavItem; pathname: string; collapsed: boolean; onNavigate?: () => void
}) {
  const active = isActive(item, pathname)
  return (
    <li>
      <Link
        to={item.to}
        onClick={onNavigate}
        title={collapsed ? item.label : undefined}
        aria-current={active ? 'page' : undefined}
        className={`flex items-center gap-3 min-h-[40px] rounded-lg text-sm font-medium transition-colors ${collapsed ? 'justify-center px-0' : 'px-3'} ${active ? '' : 'hover:bg-[var(--surface-hover)]'}`}
        style={{
          background: active ? 'var(--accent-muted)' : undefined,
          color: active ? 'var(--accent)' : 'var(--ink-2)',
        }}
      >
        <item.icon size={18} aria-hidden="true" className="shrink-0" />
        <span className={collapsed ? 'sr-only' : 'truncate'}>{item.label}</span>
      </Link>
    </li>
  )
}

export default function Sidebar({ pathname, collapsed = false, onToggle, onNavigate }: {
  pathname: string; collapsed?: boolean; onToggle?: () => void; onNavigate?: () => void
}) {
  return (
    <div className="flex flex-col h-full" style={{ background: 'var(--sidebar-bg)' }}>
      <div className={`h-16 flex items-center shrink-0 ${collapsed ? 'justify-center' : 'px-4'}`} style={{ borderBottom: '1px solid var(--border)' }}>
        <Link to="/" onClick={onNavigate} aria-label="RacconPay home" className="flex items-center gap-2.5">
          <PPLogo size={30} />
          {!collapsed && <span className="font-semibold text-[15px] tracking-tight" style={{ color: 'var(--ink)' }}>RacconPay</span>}
        </Link>
      </div>

      <nav aria-label="Main" className="flex-1 overflow-y-auto px-3 py-4 flex flex-col gap-5">
        {NAV_GROUPS.map(g => (
          <div key={g.id} className="flex flex-col gap-1.5">
            {!collapsed
              ? <p className="px-3 text-[11px] font-semibold uppercase tracking-wider" style={{ color: 'var(--subtle)' }} id={`nav-${g.id}`}>{g.label}</p>
              : <div className="h-px mx-2" style={{ background: 'var(--border)' }} aria-hidden="true" />}
            <ul className="flex flex-col gap-0.5" aria-labelledby={collapsed ? undefined : `nav-${g.id}`} aria-label={collapsed ? g.label : undefined}>
              {g.items.map(i => <Item key={i.to} item={i} pathname={pathname} collapsed={collapsed} onNavigate={onNavigate} />)}
            </ul>
          </div>
        ))}
      </nav>

      {onToggle && (
        <div className="p-3 shrink-0" style={{ borderTop: '1px solid var(--border)' }}>
          <button
            type="button"
            onClick={onToggle}
            aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
            className={`w-full min-h-[40px] flex items-center gap-3 rounded-lg text-sm font-medium hover:bg-[var(--surface-hover)] ${collapsed ? 'justify-center' : 'px-3'}`}
            style={{ color: 'var(--muted)' }}
          >
            {collapsed ? <ChevronsRight size={18} aria-hidden="true" /> : <><ChevronsLeft size={18} aria-hidden="true" /> Collapse</>}
          </button>
        </div>
      )}
    </div>
  )
}
