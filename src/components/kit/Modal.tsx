/** Accessible dialog: Escape closes, focus moves in and returns, backdrop click closes. */
import React, { useEffect, useRef } from 'react'
import { createPortal } from 'react-dom'
import { X } from 'lucide-react'
import { GhostButton, PrimaryButton } from '../ui'

export function Modal({ open, onClose, title, children, footer }: {
  open: boolean; onClose: () => void; title: string; children: React.ReactNode; footer?: React.ReactNode
}) {
  const panel = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!open) return
    const prev = document.activeElement as HTMLElement | null
    panel.current?.focus()
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
      if (e.key === 'Tab' && panel.current) {
        const f = panel.current.querySelectorAll<HTMLElement>('button,[href],input,select,textarea,[tabindex]:not([tabindex="-1"])')
        if (!f.length) return
        const first = f[0]; const last = f[f.length - 1]
        if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus() }
        else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus() }
      }
    }
    document.addEventListener('keydown', onKey)
    document.body.style.overflow = 'hidden'
    return () => { document.removeEventListener('keydown', onKey); document.body.style.overflow = ''; prev?.focus() }
  }, [open, onClose])
  if (!open) return null
  return createPortal(
    <div className="fixed inset-0 z-[80] flex items-end sm:items-center justify-center p-0 sm:p-4">
      <button type="button" aria-label="Close dialog" tabIndex={-1} className="absolute inset-0 cursor-default" style={{ background: 'rgba(11,18,32,0.55)' }} onClick={onClose} />
      <div
        ref={panel} role="dialog" aria-modal="true" aria-label={title} tabIndex={-1}
        className="relative glass-strong w-full sm:max-w-md max-h-[90dvh] overflow-y-auto rounded-t-2xl sm:rounded-xl p-5 flex flex-col gap-4 outline-none"
      >
        <div className="flex items-start justify-between gap-3">
          <h2 className="text-base font-semibold" style={{ color: 'var(--ink)' }}>{title}</h2>
          <button type="button" onClick={onClose} aria-label="Close" className="w-9 h-9 -mr-2 -mt-1 rounded-lg flex items-center justify-center hover:bg-[var(--surface-hover)]" style={{ color: 'var(--muted)' }}>
            <X size={18} aria-hidden="true" />
          </button>
        </div>
        <div className="text-sm" style={{ color: 'var(--ink-2)' }}>{children}</div>
        {footer && <div className="flex flex-col-reverse sm:flex-row sm:justify-end gap-2">{footer}</div>}
      </div>
    </div>,
    document.body,
  )
}

/** Confirm before anything that moves money or cannot be undone. */
export function ConfirmDialog({ open, onClose, onConfirm, title, body, confirmLabel = 'Confirm', loading }: {
  open: boolean; onClose: () => void; onConfirm: () => void; title: string; body: React.ReactNode
  confirmLabel?: string; loading?: boolean
}) {
  return (
    <Modal
      open={open} onClose={onClose} title={title}
      footer={<>
        <GhostButton onClick={onClose} disabled={loading}>Cancel</GhostButton>
        <PrimaryButton onClick={onConfirm} loading={loading} className="sm:w-auto">{confirmLabel}</PrimaryButton>
      </>}
    >
      {body}
    </Modal>
  )
}
