/*
 *  ███████╗ █████╗ ██████╗  ██████╗██████╗ ███████╗███████╗██╗  ██╗
 *  ██╔══██║██╔══██╗██╔══██╗██╔════╝██╔══██╗██╔════╝██╔════╝██║ ██╔╝
 *  ███████║███████║██████╔╝██║     ██║  ██║█████╗  ███████╗█████╔╝
 *  ██╔══██║██╔══██║██╔══██╗██║     ██║  ██║██╔══╝  ╚════██║██╔═██╗
 *  ██║  ██║██║  ██║██║  ██║╚██████╗██████╔╝███████╗███████║██║  ██╗
 *  ╚═╝  ╚═╝╚═╝  ╚═╝╚═╝  ╚═╝ ╚═════╝╚═════╝ ╚══════╝╚══════╝╚═╝  ╚═╝
 *
 *  RacconPay — USDC Money Tools
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
import { ThemeProvider } from './ThemeContext'
import './index.css'

const queryClient = new QueryClient()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <WagmiProvider config={config}>
      <QueryClientProvider client={queryClient}>
        <ConnectKitProvider
          mode="auto"
          customTheme={{
            /* shared */
            "--ck-font-family":                      "'DM Sans', sans-serif",
            "--ck-border-radius":                    "14px",
            "--ck-primary-button-border-radius":     "12px",
            "--ck-focus-color":                      "#c4782a",
            /* light */
            "--ck-body-background":                  "#fdf8f0",
            "--ck-body-background-secondary":        "#f5ede0",
            "--ck-body-background-tertiary":         "#ede4d5",
            "--ck-body-color":                       "#2d1f0e",
            "--ck-body-color-muted":                 "#8a6a4a",
            "--ck-primary-button-background":        "#c4782a",
            "--ck-primary-button-hover-background":  "#d98c38",
            "--ck-primary-button-color":             "#ffffff",
            "--ck-secondary-button-background":      "rgba(196,120,42,0.08)",
            "--ck-secondary-button-hover-background":"rgba(196,120,42,0.14)",
            "--ck-secondary-button-color":           "#c4782a",
            "--ck-overlay-background":               "rgba(45,31,14,0.55)",
            "--ck-modal-box-shadow":                 "0 8px 40px rgba(45,31,14,0.18)",
          }}
        >
          <ThemeProvider>
            <App />
            <Toaster position="top-center" />
          </ThemeProvider>
        </ConnectKitProvider>
      </QueryClientProvider>
    </WagmiProvider>
  </StrictMode>,
)
