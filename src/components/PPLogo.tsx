/**
 * RacconPay — Raccoon Face Logomark
 *
 * A hand-crafted SVG raccoon face that works at any size.
 * Design elements:
 *  - Rounded square container, amber→terracotta gradient
 *  - Grey face circle
 *  - Two pointed ears with inner pink
 *  - Black bandit mask across the eyes
 *  - Two white eyes with dark pupils
 *  - Small dark snout oval + nose dot
 *  - Subtle whisker lines
 *
 * Props:
 *   size     — px dimension of the square (default 32)
 *   wordmark — show "RacconPay" text beside the mark (default false)
 *   className — extra classes on the wrapper
 */

interface PPLogoProps {
  size?: number
  wordmark?: boolean
  className?: string
}

export default function PPLogo({ size = 32, wordmark = false, className = '' }: PPLogoProps) {
  const s = size
  const cx = s / 2
  const cy = s / 2
  const r  = s * 0.22   // corner radius of the container square

  // Face circle
  const faceR = s * 0.36

  // Ear geometry — two pointed triangular ears
  const earW  = s * 0.17
  const earH  = s * 0.20
  const earLx = cx - s * 0.22
  const earRx = cx + s * 0.22
  const earY  = cy - faceR + s * 0.04

  // Mask — wide ellipse across eye area
  const maskRx = s * 0.32
  const maskRy = s * 0.115
  const maskCy = cy - s * 0.055

  // Eyes
  const eyeOffX = s * 0.115
  const eyeOffY = cy - s * 0.055
  const eyeR    = s * 0.075
  const pupilR  = s * 0.042

  // Snout
  const snoutRx = s * 0.13
  const snoutRy = s * 0.09
  const snoutCy = cy + s * 0.115

  // Nose
  const noseR = s * 0.035

  // Whisker length
  const wLen  = s * 0.21
  const wY1   = cy + s * 0.08
  const wY2   = cy + s * 0.12
  const wLx   = cx - snoutRx - s * 0.01
  const wRx   = cx + snoutRx + s * 0.01

  const gradId = `raccGrad${s}`

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
        aria-label="RacconPay raccoon logo"
        role="img"
      >
        <defs>
          <linearGradient id={gradId} x1="0" y1="0" x2={s} y2={s} gradientUnits="userSpaceOnUse">
            <stop offset="0%"   stopColor="#c4782a" />
            <stop offset="100%" stopColor="#b04a2e" />
          </linearGradient>
          <clipPath id={`raccClip${s}`}>
            <rect width={s} height={s} rx={r} />
          </clipPath>
        </defs>

        {/* ── Background rounded square ── */}
        <rect width={s} height={s} rx={r} fill={`url(#${gradId})`} />

        {/* ── Inner highlight ── */}
        <rect
          width={s} height={s} rx={r}
          fill="none"
          stroke="rgba(255,248,240,0.15)"
          strokeWidth={s * 0.04}
        />

        <g clipPath={`url(#raccClip${s})`}>

          {/* ── Ears (behind face) ── */}
          {/* Left ear — triangle-ish */}
          <polygon
            points={`
              ${earLx - earW * 0.5},${earY + earH}
              ${earLx + earW * 0.5},${earY + earH}
              ${earLx},${earY - earH * 0.6}
            `}
            fill="#6b5a4e"
          />
          {/* Left ear inner pink */}
          <polygon
            points={`
              ${earLx - earW * 0.28},${earY + earH * 0.7}
              ${earLx + earW * 0.28},${earY + earH * 0.7}
              ${earLx},${earY - earH * 0.28}
            `}
            fill="#e8a0a0"
          />

          {/* Right ear */}
          <polygon
            points={`
              ${earRx - earW * 0.5},${earY + earH}
              ${earRx + earW * 0.5},${earY + earH}
              ${earRx},${earY - earH * 0.6}
            `}
            fill="#6b5a4e"
          />
          {/* Right ear inner pink */}
          <polygon
            points={`
              ${earRx - earW * 0.28},${earY + earH * 0.7}
              ${earRx + earW * 0.28},${earY + earH * 0.7}
              ${earRx},${earY - earH * 0.28}
            `}
            fill="#e8a0a0"
          />

          {/* ── Face circle ── */}
          <circle cx={cx} cy={cy} r={faceR} fill="#d4c5b0" />

          {/* ── Bandit mask ── */}
          <ellipse cx={cx} cy={maskCy} rx={maskRx} ry={maskRy} fill="#2a2420" />

          {/* ── Mask highlight (lighter centre strip) ── */}
          <ellipse
            cx={cx} cy={maskCy}
            rx={maskRx * 0.38} ry={maskRy * 0.55}
            fill="rgba(255,255,255,0.06)"
          />

          {/* ── Eyes (white sclera) ── */}
          <circle cx={cx - eyeOffX} cy={eyeOffY} r={eyeR} fill="#f5f0e8" />
          <circle cx={cx + eyeOffX} cy={eyeOffY} r={eyeR} fill="#f5f0e8" />

          {/* ── Pupils ── */}
          <circle cx={cx - eyeOffX} cy={eyeOffY} r={pupilR} fill="#1a1410" />
          <circle cx={cx + eyeOffX} cy={eyeOffY} r={pupilR} fill="#1a1410" />

          {/* ── Eye shine ── */}
          <circle cx={cx - eyeOffX + pupilR * 0.5} cy={eyeOffY - pupilR * 0.5} r={pupilR * 0.35} fill="rgba(255,255,255,0.9)" />
          <circle cx={cx + eyeOffX + pupilR * 0.5} cy={eyeOffY - pupilR * 0.5} r={pupilR * 0.35} fill="rgba(255,255,255,0.9)" />

          {/* ── Cheek patches (lighter fur below mask) ── */}
          <ellipse cx={cx - s * 0.17} cy={cy + s * 0.07} rx={s * 0.10} ry={s * 0.08} fill="#e8dece" />
          <ellipse cx={cx + s * 0.17} cy={cy + s * 0.07} rx={s * 0.10} ry={s * 0.08} fill="#e8dece" />

          {/* ── Snout ── */}
          <ellipse cx={cx} cy={snoutCy} rx={snoutRx} ry={snoutRy} fill="#bfb0a0" />

          {/* ── Nose ── */}
          <ellipse cx={cx} cy={snoutCy - snoutRy * 0.55} rx={noseR * 1.3} ry={noseR} fill="#3a2820" />

          {/* ── Mouth line ── */}
          <path
            d={`M ${cx} ${snoutCy - snoutRy * 0.15} L ${cx} ${snoutCy + snoutRy * 0.55}`}
            stroke="#3a2820"
            strokeWidth={s * 0.018}
            strokeLinecap="round"
          />
          <path
            d={`M ${cx} ${snoutCy + snoutRy * 0.55} Q ${cx - snoutRx * 0.55} ${snoutCy + snoutRy * 0.9} ${cx - snoutRx * 0.8} ${snoutCy + snoutRy * 0.7}`}
            stroke="#3a2820"
            strokeWidth={s * 0.016}
            fill="none"
            strokeLinecap="round"
          />
          <path
            d={`M ${cx} ${snoutCy + snoutRy * 0.55} Q ${cx + snoutRx * 0.55} ${snoutCy + snoutRy * 0.9} ${cx + snoutRx * 0.8} ${snoutCy + snoutRy * 0.7}`}
            stroke="#3a2820"
            strokeWidth={s * 0.016}
            fill="none"
            strokeLinecap="round"
          />

          {/* ── Whiskers left ── */}
          <line x1={wLx} y1={wY1} x2={wLx - wLen} y2={wY1 - s * 0.025} stroke="rgba(50,35,25,0.45)" strokeWidth={s * 0.013} strokeLinecap="round" />
          <line x1={wLx} y1={wY2} x2={wLx - wLen} y2={wY2 + s * 0.015} stroke="rgba(50,35,25,0.45)" strokeWidth={s * 0.013} strokeLinecap="round" />

          {/* ── Whiskers right ── */}
          <line x1={wRx} y1={wY1} x2={wRx + wLen} y2={wY1 - s * 0.025} stroke="rgba(50,35,25,0.45)" strokeWidth={s * 0.013} strokeLinecap="round" />
          <line x1={wRx} y1={wY2} x2={wRx + wLen} y2={wY2 + s * 0.015} stroke="rgba(50,35,25,0.45)" strokeWidth={s * 0.013} strokeLinecap="round" />

        </g>
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
