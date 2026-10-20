/**
 * SuccessAnimation — checkmark ring + confetti burst.
 * Self-dismisses after `duration` ms (default 2800).
 * Usage: mount when success=true, unmount or hide after onDone fires.
 */

import { useEffect, useRef, useState } from 'react'

interface Particle {
  x: number; y: number
  vx: number; vy: number
  size: number; color: string
  life: number; decay: number
  rotation: number; rotSpeed: number
}

const COLORS = [
  '#f59e0b', '#fb923c', '#34d399', '#60a5fa',
  '#a78bfa', '#f472b6', '#fbbf24', '#4ade80',
]

function useConfetti(canvas: HTMLCanvasElement | null, active: boolean) {
  const rafRef = useRef<number>(0)
  const particles = useRef<Particle[]>([])

  useEffect(() => {
    if (!active || !canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    // spawn burst
    particles.current = Array.from({ length: 72 }, () => {
      const angle = Math.random() * Math.PI * 2
      const speed = 2.5 + Math.random() * 4.5
      return {
        x: canvas.width / 2,
        y: canvas.height / 2,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed - 2,
        size: 5 + Math.random() * 6,
        color: COLORS[Math.floor(Math.random() * COLORS.length)],
        life: 1,
        decay: 0.012 + Math.random() * 0.014,
        rotation: Math.random() * 360,
        rotSpeed: (Math.random() - 0.5) * 8,
      }
    })

    function frame() {
      if (!ctx || !canvas) return
      ctx.clearRect(0, 0, canvas.width, canvas.height)
      particles.current = particles.current.filter(p => p.life > 0)
      for (const p of particles.current) {
        ctx.save()
        ctx.globalAlpha = p.life
        ctx.translate(p.x, p.y)
        ctx.rotate((p.rotation * Math.PI) / 180)
        ctx.fillStyle = p.color
        ctx.fillRect(-p.size / 2, -p.size / 4, p.size, p.size / 2)
        ctx.restore()
        p.x += p.vx
        p.y += p.vy
        p.vy += 0.12        // gravity
        p.vx *= 0.99        // drag
        p.rotation += p.rotSpeed
        p.life -= p.decay
      }
      if (particles.current.length > 0) {
        rafRef.current = requestAnimationFrame(frame)
      }
    }

    rafRef.current = requestAnimationFrame(frame)
    return () => { cancelAnimationFrame(rafRef.current) }
  }, [active, canvas])
}

interface Props {
  show: boolean
  label?: string
  sublabel?: string
  duration?: number
  onDone?: () => void
}

export default function SuccessAnimation({
  show, label = 'Done!', sublabel, duration = 2800, onDone,
}: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [canvas, setCanvas] = useState<HTMLCanvasElement | null>(null)
  const [ring, setRing]     = useState(false)
  const [check, setCheck]   = useState(false)
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    if (canvasRef.current) setCanvas(canvasRef.current)
  }, [])

  useEffect(() => {
    // All setState calls are inside setTimeout (async) to satisfy lint rule
    if (!show) {
      const t0 = setTimeout(() => { setRing(false); setCheck(false); setVisible(false) }, 0)
      return () => clearTimeout(t0)
    }
    const t0 = setTimeout(() => setVisible(true), 0)
    const t1 = setTimeout(() => setRing(true), 30)
    const t2 = setTimeout(() => setCheck(true), 180)
    const t3 = setTimeout(() => { setVisible(false); onDone?.() }, duration)
    return () => { clearTimeout(t0); clearTimeout(t1); clearTimeout(t2); clearTimeout(t3) }
  }, [show, duration, onDone])

  useConfetti(canvas, show && ring)

  if (!visible && !show) return null

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center pointer-events-none"
      style={{ opacity: visible ? 1 : 0, transition: 'opacity 0.4s ease' }}
    >
      {/* Canvas for confetti */}
      <canvas
        ref={canvasRef}
        width={600}
        height={600}
        className="absolute inset-0 w-full h-full pointer-events-none"
        style={{ mixBlendMode: 'screen' }}
      />

      {/* Card */}
      <div
        className="relative flex flex-col items-center gap-3 px-8 py-7 rounded-3xl shadow-2xl"
        style={{
          background: 'var(--surface-strong)',
          border: '1px solid var(--border-strong)',
          transform: ring ? 'scale(1)' : 'scale(0.7)',
          opacity: ring ? 1 : 0,
          transition: 'transform 0.35s cubic-bezier(0.34,1.56,0.64,1), opacity 0.25s ease',
        }}
      >
        {/* Ring */}
        <div
          style={{
            width: 72, height: 72,
            borderRadius: '50%',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            background: 'var(--success-muted)',
            border: `3px solid var(--success)`,
            boxShadow: '0 0 24px 4px rgba(52,211,153,0.25)',
            transform: ring ? 'scale(1)' : 'scale(0)',
            transition: 'transform 0.4s cubic-bezier(0.34,1.56,0.64,1)',
          }}
        >
          {/* Checkmark SVG — draws via strokeDashoffset animation */}
          <svg width="36" height="36" viewBox="0 0 36 36" fill="none">
            <polyline
              points="7,19 15,27 29,11"
              stroke="var(--success)"
              strokeWidth="3.5"
              strokeLinecap="round"
              strokeLinejoin="round"
              style={{
                strokeDasharray: 40,
                strokeDashoffset: check ? 0 : 40,
                transition: 'stroke-dashoffset 0.4s ease 0.1s',
              }}
            />
          </svg>
        </div>

        <p className="text-base font-semibold" style={{ color: 'var(--ink)' }}>{label}</p>
        {sublabel && (
          <p className="text-xs text-center max-w-[200px]" style={{ color: 'var(--subtle)' }}>
            {sublabel}
          </p>
        )}
      </div>
    </div>
  )
}
