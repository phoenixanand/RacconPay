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
        sans:    ['Inter', 'system-ui', 'sans-serif'],
        display: ['Inter', 'system-ui', 'sans-serif'],
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
        'warm-sm': 'var(--shadow-sm)',
        'warm-md': 'var(--shadow-md)',
        'warm-lg': 'var(--shadow-md)',
        'pay': 'none',
        'vest': 'none',
        'split': 'none',
        'receipt': 'none',
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
