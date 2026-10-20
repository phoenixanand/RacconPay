/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        ink:     'var(--ink)',
        ink2:    'var(--ink-2)',
        muted:   'var(--muted)',
        subtle:  'var(--subtle)',
        accent:  'var(--accent)',
        surface: 'var(--surface)',
        success: 'var(--success)',
        danger:  'var(--danger)',
        warning: 'var(--warning)',
        // per-tool
        pay:     'var(--pay-accent)',
        vest:    'var(--vest-accent)',
        split:   'var(--split-accent)',
        receipt: 'var(--receipt-accent)',
      },
      fontFamily: {
        sans:    ['DM Sans', 'Georgia', 'sans-serif'],
        display: ['Space Grotesk', 'Georgia', 'sans-serif'],
        mono:    ['JetBrains Mono', 'Menlo', 'monospace'],
      },
      borderColor: {
        DEFAULT: 'var(--border)',
        strong:  'var(--border-strong)',
      },
      backgroundImage: {
        spectral: 'var(--spectral)',
      },
      boxShadow: {
        'warm-sm':  '0 1px 3px rgba(160,100,40,0.10), 0 2px 8px rgba(160,100,40,0.06)',
        'warm-md':  '0 2px 8px rgba(160,100,40,0.12), 0 8px 24px rgba(160,100,40,0.07)',
        'warm-lg':  '0 4px 16px rgba(160,100,40,0.14), 0 16px 40px rgba(160,100,40,0.08)',
        'pay':      '0 0 20px rgba(196,120,42,0.22)',
        'vest':     '0 0 20px rgba(124,90,46,0.22)',
        'split':    '0 0 20px rgba(90,122,74,0.22)',
        'receipt':  '0 0 20px rgba(176,74,46,0.22)',
      },
      keyframes: {
        'fade-up': {
          '0%':   { opacity: '0', transform: 'translateY(14px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        'fade-in': {
          '0%':   { opacity: '0' },
          '100%': { opacity: '1' },
        },
      },
      animation: {
        'fade-up':   'fade-up 0.42s ease both',
        'fade-up-2': 'fade-up 0.42s 0.08s ease both',
        'fade-up-3': 'fade-up 0.42s 0.16s ease both',
        'fade-in':   'fade-in 0.32s ease both',
      },
    },
  },
  plugins: [],
}
