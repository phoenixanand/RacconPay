/**
 * RacconPay — PageHero
 * Thin branded strip at the top of every inner page.
 * Props: icon, title, subtitle, accent color CSS var string, gradient CSS var string
 */
import type { LucideIcon } from 'lucide-react'

interface PageHeroProps {
  icon: LucideIcon
  title: string
  subtitle: string
  accent?: string       // CSS color value e.g. 'var(--pay-accent)'
  gradient?: string     // CSS gradient for ::before overlay
}

export default function PageHero({
  icon: Icon,
  title,
  subtitle,
  accent = 'var(--accent)',
  gradient = 'linear-gradient(120deg, rgba(196,120,42,0.09) 0%, transparent 65%)',
}: PageHeroProps) {
  return (
    <div
      className="page-hero flex items-center gap-4"
      style={{ '--hero-accent-grad': gradient } as React.CSSProperties}
    >
      {/* Icon badge */}
      <div
        className="relative z-10 flex-shrink-0 flex items-center justify-center rounded-2xl"
        style={{
          width: 52, height: 52,
          background: `color-mix(in srgb, ${accent} 12%, transparent)`,
          border: `1px solid color-mix(in srgb, ${accent} 24%, transparent)`,
        }}
      >
        <Icon size={24} style={{ color: accent }} strokeWidth={1.8} />
      </div>

      {/* Text */}
      <div className="relative z-10 min-w-0">
        <h1
          className="text-xl sm:text-2xl font-bold tracking-tight leading-tight truncate"
          style={{ color: 'var(--ink)' }}
        >
          {title}
        </h1>
        <p
          className="text-sm mt-0.5 leading-snug"
          style={{ color: 'var(--muted)' }}
        >
          {subtitle}
        </p>
      </div>
    </div>
  )
}
