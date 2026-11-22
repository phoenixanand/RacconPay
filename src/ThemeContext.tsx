/**
 * ThemeContext, light / dark mode toggle.
 * Persists to localStorage. Applies data-theme="light"|"dark" on <html>.
 */
import React, { createContext, useContext, useEffect, useState } from 'react'
import { Sun, Moon } from 'lucide-react'

type Theme = 'dark' | 'light'

const ThemeContext = createContext<{ theme: Theme; toggle: () => void }>({
  theme: 'light',
  toggle: () => {},
})

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [theme, setTheme] = useState<Theme>(() => {
    if (typeof window !== 'undefined') {
      return (localStorage.getItem('racconpay-theme') as Theme) ?? 'light'
    }
    return 'light'
  })

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme)
    localStorage.setItem('racconpay-theme', theme)
  }, [theme])

  const toggle = () => setTheme(t => (t === 'dark' ? 'light' : 'dark'))

  return (
    <ThemeContext.Provider value={{ theme, toggle }}>
      {children}
    </ThemeContext.Provider>
  )
}

export function useTheme() {
  return useContext(ThemeContext)
}

/** Drop-in toggle button for the sidebar / top bar */
export function ThemeToggle({ className = '' }: { className?: string }) {
  const { theme, toggle } = useTheme()
  return (
    <button
      onClick={toggle}
      aria-label={theme === 'dark' ? 'Switch to light theme' : 'Switch to dark theme'}
      className={`flex items-center justify-center w-9 h-9 rounded-lg transition-colors hover:bg-[var(--surface-hover)] ${className}`}
      style={{ border: '1px solid var(--border)', color: 'var(--muted)', background: 'var(--surface)' }}
    >
      {theme === 'dark' ? <Sun size={14} /> : <Moon size={14} />}
    </button>
  )
}
