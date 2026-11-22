/**
 * RacconPay logomark
 *
 * A blue rounded square with a thin white border and a bold white "R".
 *
 * Props:
 *   size    , px dimension of the square (default 32)
 *   wordmark, show "RacconPay" text beside the mark (default false)
 *   className, extra classes on the wrapper
 */

import { useId } from 'react'

interface PPLogoProps {
  size?: number
  wordmark?: boolean
  className?: string
}

export default function PPLogo({ size = 32, wordmark = false, className = '' }: PPLogoProps) {
  const s = size
  const r = s * 0.22          // corner radius of the square
  const bw = s * 0.035        // border width
  // A unique id per logo. Two logos of the same size shared one id, and a gradient defined inside a hidden
  // (display: none) copy does not paint, which left the footer logo's tile empty on desktop.
  const gradId = `ppGrad${useId().replace(/:/g, '')}`

  return (
    <div
      className={`inline-flex items-center gap-2 shrink-0 ${className}`}
      style={{ lineHeight: 0 }}
    >
      <svg
        width={s}
        height={s}
        viewBox={`0 0 ${s} ${s}`}
        xmlns="http://www.w3.org/2000/svg"
        aria-label="RacconPay logo"
        role="img"
      >
        <defs>
          <linearGradient id={gradId} x1="0" y1="0" x2={s} y2={s} gradientUnits="userSpaceOnUse">
            <stop offset="0%"   stopColor="#3157d5" />
            <stop offset="100%" stopColor="#1f3a9e" />
          </linearGradient>
        </defs>

        {/* Background rounded square */}
        <rect width={s} height={s} rx={r} fill={`url(#${gradId})`} />

        {/* The letter R */}
        <text
          x={s / 2} y={s / 2} dy="0.35em" textAnchor="middle"
          fontFamily="Inter, system-ui, -apple-system, 'Segoe UI', sans-serif"
          fontSize={s * 0.62} fontWeight={800} fill="#ffffff"
        >
          R
        </text>

        {/* Thin white border, inset so it is not clipped */}
        <rect
          x={bw / 2} y={bw / 2} width={s - bw} height={s - bw} rx={Math.max(r - bw / 2, 0)}
          fill="none" stroke="#ffffff" strokeWidth={bw}
        />
      </svg>

      {wordmark && (
        <div className="flex flex-col leading-none">
          <span
            className="font-display font-bold tracking-tight"
            style={{ fontSize: size * 0.38, color: 'var(--ink)' }}
          >
            RacconPay
          </span>
          <span
            className="font-semibold uppercase tracking-widest"
            style={{ fontSize: size * 0.22, color: 'var(--accent)' }}
          >
            Mainnet
          </span>
        </div>
      )}
    </div>
  )
}
