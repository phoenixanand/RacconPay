/**
 * QRModal — shows a QR code for a bill share link, a copy-link button,
 * and a pre-written invite message the user can paste into any chat.
 *
 * Usage:
 *   <QRModal billId={3n} billName="Weekend trip" shareAmt="12.50" open={open} onClose={() => setOpen(false)} />
 *
 * shareAmt is optional. When provided (debtor's exact share) the invite
 * message includes the amount so the recipient knows what they owe before
 * even opening the link.
 */

import { useEffect, useRef } from 'react'
import { QRCodeSVG } from 'qrcode.react'
import { X, Copy, Check, Link } from 'lucide-react'
import { useState } from 'react'

interface QRModalProps {
  billId:   bigint
  billName: string
  shareAmt?: string   // formatted USDC amount, e.g. "12.50"
  open:     boolean
  onClose:  () => void
}

function shareUrl(billId: bigint) {
  return `${window.location.origin}/split?bill=${billId.toString()}`
}

function inviteText(billName: string, shareAmt: string | undefined, url: string) {
  if (shareAmt) {
    return `Hey! You owe ${shareAmt} USDC for "${billName}" — pay with USDC here:\n${url}`
  }
  return `Hey! You're part of the "${billName}" bill on RacconPay — connect your wallet to see your share:\n${url}`
}

export default function QRModal({ billId, billName, shareAmt, open, onClose }: QRModalProps) {
  const url = shareUrl(billId)
  const text = inviteText(billName, shareAmt, url)
  const backdropRef = useRef<HTMLDivElement>(null)

  const [copiedLink,    setCopiedLink]    = useState(false)
  const [copiedMessage, setCopiedMessage] = useState(false)

  // Close on Escape
  useEffect(() => {
    if (!open) return
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [open, onClose])

  // Trap body scroll
  useEffect(() => {
    if (open) document.body.style.overflow = 'hidden'
    else      document.body.style.overflow = ''
    return () => { document.body.style.overflow = '' }
  }, [open])

  if (!open) return null

  const copyLink = () => {
    void navigator.clipboard.writeText(url).then(() => {
      setCopiedLink(true); setTimeout(() => setCopiedLink(false), 2000)
    })
  }
  const copyMessage = () => {
    void navigator.clipboard.writeText(text).then(() => {
      setCopiedMessage(true); setTimeout(() => setCopiedMessage(false), 2000)
    })
  }

  return (
    /* Backdrop */
    <div
      ref={backdropRef}
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: 'rgba(0,0,0,0.72)', backdropFilter: 'blur(6px)' }}
      onClick={e => { if (e.target === backdropRef.current) onClose() }}
    >
      {/* Panel */}
      <div
        className="relative w-full max-w-sm rounded-2xl flex flex-col gap-5 p-6"
        style={{ background: 'var(--surface-strong)', border: '1px solid var(--border-strong)', boxShadow: '0 24px 64px rgba(0,0,0,0.5)' }}
      >
        {/* Close */}
        <button
          onClick={onClose}
          className="absolute top-4 right-4 p-1.5 rounded-lg transition-colors hover:bg-white/10"
          style={{ color: 'var(--subtle)' }}
        >
          <X size={16} />
        </button>

        {/* Title */}
        <div>
          <p className="font-display font-bold text-lg" style={{ color: 'var(--ink)', letterSpacing: '-0.02em' }}>
            Invite to Bill
          </p>
          <p className="text-sm mt-0.5" style={{ color: 'var(--muted)' }}>
            &ldquo;{billName}&rdquo; · Bill #{billId.toString()}
          </p>
        </div>

        {/* QR code */}
        <div
          className="self-center rounded-2xl p-4"
          style={{ background: '#ffffff' }}
        >
          <QRCodeSVG
            value={url}
            size={200}
            bgColor="#ffffff"
            fgColor="#0a0a0f"
            level="M"
            includeMargin={false}
          />
        </div>

        {shareAmt && (
          <div
            className="rounded-xl px-4 py-3 text-center"
            style={{ background: 'var(--accent-glow)', border: '1px solid var(--border-strong)' }}
          >
            <p className="text-xs" style={{ color: 'var(--muted)' }}>Their share</p>
            <p className="font-display font-bold text-2xl tabular-nums" style={{ color: 'var(--accent)', letterSpacing: '-0.03em' }}>
              {shareAmt} <span className="text-base font-semibold">USDC</span>
            </p>
          </div>
        )}

        {/* URL row */}
        <div
          className="flex items-center gap-2 px-3 py-2.5 rounded-xl"
          style={{ background: 'var(--surface-muted)', border: '1px solid var(--border)' }}
        >
          <Link size={13} style={{ color: 'var(--subtle)' }} className="shrink-0" />
          <span className="flex-1 text-xs font-mono truncate" style={{ color: 'var(--muted)' }}>
            {url}
          </span>
          <button
            onClick={copyLink}
            className="shrink-0 flex items-center gap-1 text-xs font-semibold transition-colors"
            style={{ color: copiedLink ? 'var(--success)' : 'var(--accent)' }}
          >
            {copiedLink ? <><Check size={12} /> Copied!</> : <><Copy size={12} /> Copy</>}
          </button>
        </div>

        {/* Invite message */}
        <div className="flex flex-col gap-2">
          <p className="text-xs font-semibold uppercase tracking-wide" style={{ color: 'var(--subtle)' }}>Invite message</p>
          <div
            className="rounded-xl px-3 py-3 text-xs leading-relaxed whitespace-pre-wrap"
            style={{ background: 'var(--surface-muted)', border: '1px solid var(--border)', color: 'var(--muted)', fontFamily: 'var(--font-mono)' }}
          >
            {text}
          </div>
          <button
            onClick={copyMessage}
            className="flex items-center justify-center gap-1.5 py-2.5 rounded-xl text-sm font-semibold transition-all hover:scale-[1.01]"
            style={{
              background: copiedMessage ? 'var(--success-muted)' : 'var(--surface-strong)',
              color:      copiedMessage ? 'var(--success)'       : 'var(--ink-2)',
              border: `1px solid ${copiedMessage ? 'rgba(94,207,138,0.3)' : 'var(--border-strong)'}`,
            }}
          >
            {copiedMessage ? <><Check size={14} /> Copied to clipboard!</> : <><Copy size={14} /> Copy invite message</>}
          </button>
        </div>
      </div>
    </div>
  )
}
