/*
 *  ███████╗ █████╗ ██████╗  ██████╗██████╗ ███████╗███████╗██╗  ██╗
 *  ██╔══██║██╔══██╗██╔══██╗██╔════╝██╔══██╗██╔════╝██╔════╝██║ ██╔╝
 *  ███████║███████║██████╔╝██║     ██║  ██║█████╗  ███████╗█████╔╝
 *  ██╔══██║██╔══██║██╔══██╗██║     ██║  ██║██╔══╝  ╚════██║██╔═██╗
 *  ██║  ██║██║  ██║██║  ██║╚██████╗██████╔╝███████╗███████║██║  ██╗
 *  ╚═╝  ╚═╝╚═╝  ╚═╝╚═╝  ╚═╝ ╚═════╝╚═════╝ ╚══════╝╚══════╝╚═╝  ╚═╝
 *
 *  RacconPay, USDC Money Tools
 */

import './tracing'
import './console-capture'

import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { WagmiProvider } from 'wagmi'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { ConnectKitProvider } from 'connectkit'
import { Toaster } from 'sonner'
import { config } from './config'
import App from './App'
import { ThemeProvider, useTheme } from './ThemeContext'
import './index.css'

const queryClient = new QueryClient()

const CK_THEME = {
  "--ck-font-family":                       "'Inter', system-ui, sans-serif",
  "--ck-border-radius":                     "12px",
  "--ck-primary-button-border-radius":      "10px",
  "--ck-focus-color":                       "#3157d5",
  "--ck-body-background":                   "#ffffff",
  "--ck-body-background-secondary":         "#f7f8fa",
  "--ck-body-background-tertiary":          "#eef0f4",
  "--ck-body-color":                        "#172033",
  "--ck-body-color-muted":                  "#5b6679",
  "--ck-primary-button-background":         "#3157d5",
  "--ck-primary-button-hover-background":   "#2748b8",
  "--ck-primary-button-color":              "#ffffff",
  "--ck-secondary-button-background":       "#eef0f4",
  "--ck-secondary-button-hover-background": "#e5e7eb",
  "--ck-secondary-button-color":            "#172033",
  "--ck-overlay-background":                "rgba(11,18,32,0.55)",
  "--ck-modal-box-shadow":                  "0 8px 40px rgba(16,24,40,0.18)",
}

/** ConnectKit follows the app's own light/dark choice instead of the operating system. */
function Providers({ children }: { children: React.ReactNode }) {
  const { theme } = useTheme()
  return (
    <ConnectKitProvider mode={theme} customTheme={CK_THEME}>
      {children}
      <Toaster position="top-center" theme={theme} />
    </ConnectKitProvider>
  )
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <WagmiProvider config={config}>
      <QueryClientProvider client={queryClient}>
        <ThemeProvider>
          <Providers>
            <App />
          </Providers>
        </ThemeProvider>
      </QueryClientProvider>
    </WagmiProvider>
  </StrictMode>,
)
