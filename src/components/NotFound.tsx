import { Link } from 'react-router-dom'
import { Home, ArrowLeft } from 'lucide-react'
import { PrimaryButton } from './ui'
import PPLogo from './PPLogo'

export default function NotFound() {
  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] text-center gap-6 px-4">
      {/* Big raccoon logo */}
      <div
        className="rounded-3xl p-4"
        style={{ background: 'var(--accent-muted)', border: '1px solid var(--accent-glow)' }}
      >
        <PPLogo size={80} />
      </div>

      <div className="flex flex-col gap-2">
        <h1 className="text-5xl font-extrabold tracking-tight" style={{ color: 'var(--ink)' }}>
          404
        </h1>
        <p className="text-lg font-semibold" style={{ color: 'var(--muted)' }}>
          Page not found
        </p>
        <p className="text-sm max-w-xs mx-auto" style={{ color: 'var(--subtle)' }}>
          The raccoon looked everywhere but couldn't find this page. It may have moved or never existed.
        </p>
      </div>

      <div className="flex items-center gap-3">
        <PrimaryButton onClick={() => window.history.back()}>
          <ArrowLeft size={15} className="mr-1.5" />
          Go back
        </PrimaryButton>
        <Link to="/">
          <button
            className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-semibold transition-all"
            style={{
              background: 'var(--surface)',
              border: '1px solid var(--border)',
              color: 'var(--muted)',
            }}
          >
            <Home size={15} />
            Home
          </button>
        </Link>
      </div>
    </div>
  )
}
