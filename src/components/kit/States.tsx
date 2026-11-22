/** Empty, error and loading states shared by every page. */
import React from 'react'
import { AlertCircle, Inbox, RefreshCw } from 'lucide-react'
import { Card, GhostButton } from '../ui'

export function EmptyState({ icon: Icon = Inbox, title, body, action }: {
  icon?: React.ElementType; title: string; body?: string; action?: React.ReactNode
}) {
  return (
    <div className="flex flex-col items-center gap-3 text-center py-10 px-4">
      <span className="w-11 h-11 rounded-full flex items-center justify-center" style={{ background: 'var(--surface-muted)' }}>
        <Icon size={20} style={{ color: 'var(--muted)' }} aria-hidden="true" />
      </span>
      <div className="flex flex-col gap-1">
        <p className="text-sm font-semibold" style={{ color: 'var(--ink)' }}>{title}</p>
        {body && <p className="text-sm max-w-sm" style={{ color: 'var(--muted)' }}>{body}</p>}
      </div>
      {action}
    </div>
  )
}

export function ErrorState({ title = 'Something went wrong', body, onRetry }: {
  title?: string; body?: string; onRetry?: () => void
}) {
  return (
    <div role="alert" className="flex flex-col items-center gap-3 text-center py-10 px-4">
      <span className="w-11 h-11 rounded-full flex items-center justify-center" style={{ background: 'var(--danger-muted)' }}>
        <AlertCircle size={20} style={{ color: 'var(--danger)' }} aria-hidden="true" />
      </span>
      <div className="flex flex-col gap-1">
        <p className="text-sm font-semibold" style={{ color: 'var(--ink)' }}>{title}</p>
        {body && <p className="text-sm max-w-sm" style={{ color: 'var(--muted)' }}>{body}</p>}
      </div>
      {onRetry && (
        <GhostButton onClick={onRetry}><RefreshCw size={14} aria-hidden="true" /> Try again</GhostButton>
      )}
    </div>
  )
}

export function Skeleton({ className = '', height = 16 }: { className?: string; height?: number }) {
  return <div aria-hidden="true" className={`skeleton w-full ${className}`} style={{ height }} />
}

/** Placeholder for a whole card while data loads. */
export function CardSkeleton({ rows = 3 }: { rows?: number }) {
  return (
    <Card className="p-5 flex flex-col gap-3" >
      <span className="sr-only">Loading</span>
      <Skeleton height={14} className="max-w-[40%]" />
      {Array.from({ length: rows }, (_, i) => <Skeleton key={i} height={12} />)}
    </Card>
  )
}
