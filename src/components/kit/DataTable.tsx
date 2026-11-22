/**
 * Data table with built-in pagination. On narrow screens it scrolls sideways, or shows
 * one card per row when `mobileCard` is given. Presentation only; filtering stays with the caller.
 */
import React, { useState } from 'react'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { Skeleton, EmptyState } from './States'

export interface Column<T> {
  key: string
  header: string
  render: (row: T) => React.ReactNode
  align?: 'left' | 'right'
  className?: string
}

export function DataTable<T>({
  columns, rows, rowKey, loading, empty, pageSize = 10, mobileCard, caption,
}: {
  columns: Column<T>[]; rows: T[]; rowKey: (row: T) => string; loading?: boolean
  empty?: React.ReactNode; pageSize?: number; mobileCard?: (row: T) => React.ReactNode; caption: string
}) {
  const [pageRaw, setPage] = useState(0)
  const pages = Math.max(1, Math.ceil(rows.length / pageSize))
  const page = Math.min(pageRaw, pages - 1)
  const slice = rows.slice(page * pageSize, page * pageSize + pageSize)

  if (loading) {
    return <div className="flex flex-col gap-2 p-4" aria-busy="true">{Array.from({ length: 4 }, (_, i) => <Skeleton key={i} height={40} />)}</div>
  }
  if (!rows.length) return <>{empty ?? <EmptyState title="Nothing here yet" />}</>

  return (
    <div>
      <div className={mobileCard ? 'hidden md:block overflow-x-auto' : 'overflow-x-auto'}>
        <table className="w-full text-sm min-w-[560px]">
          <caption className="sr-only">{caption}</caption>
          <thead>
            <tr style={{ borderBottom: '1px solid var(--border)' }}>
              {columns.map(c => (
                <th key={c.key} scope="col" className={`px-4 py-2.5 text-xs font-medium whitespace-nowrap ${c.align === 'right' ? 'text-right' : 'text-left'}`} style={{ color: 'var(--muted)' }}>
                  {c.header}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {slice.map(row => (
              <tr key={rowKey(row)} className="hover:bg-[var(--surface-hover)]" style={{ borderBottom: '1px solid var(--border)' }}>
                {columns.map(c => (
                  <td key={c.key} className={`px-4 py-3 align-middle ${c.align === 'right' ? 'text-right tabular-nums' : 'text-left'} ${c.className ?? ''}`} style={{ color: 'var(--ink)' }}>
                    {c.render(row)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {mobileCard && (
        <ul className="md:hidden flex flex-col">
          {slice.map(row => (
            <li key={rowKey(row)} className="px-4 py-3" style={{ borderBottom: '1px solid var(--border)' }}>{mobileCard(row)}</li>
          ))}
        </ul>
      )}
      {pages > 1 && (
        <nav className="flex items-center justify-between gap-3 px-4 py-3" aria-label="Pagination">
          <p className="text-xs tabular-nums" style={{ color: 'var(--muted)' }}>
            {page * pageSize + 1}-{Math.min(rows.length, (page + 1) * pageSize)} of {rows.length}
          </p>
          <div className="flex gap-2">
            <button type="button" aria-label="Previous page" disabled={page === 0} onClick={() => setPage(p => p - 1)}
              className="w-9 h-9 rounded-lg flex items-center justify-center disabled:opacity-40 hover:bg-[var(--surface-hover)]" style={{ border: '1px solid var(--border-strong)', color: 'var(--ink-2)' }}>
              <ChevronLeft size={16} aria-hidden="true" />
            </button>
            <button type="button" aria-label="Next page" disabled={page >= pages - 1} onClick={() => setPage(p => p + 1)}
              className="w-9 h-9 rounded-lg flex items-center justify-center disabled:opacity-40 hover:bg-[var(--surface-hover)]" style={{ border: '1px solid var(--border-strong)', color: 'var(--ink-2)' }}>
              <ChevronRight size={16} aria-hidden="true" />
            </button>
          </div>
        </nav>
      )}
    </div>
  )
}
