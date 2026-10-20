/**
 * wagmi configuration — RacconPay
 */

import { http, createConfig } from 'wagmi'
import { mainnet } from 'wagmi/chains'
import { arc } from 'viem/chains'
import { injected } from 'wagmi/connectors'
import { registerChain } from './tracing'

// Explicit HTTP RPC — forces HTTP-only polling, no WebSocket.
// Brave Shields blocks WebSocket connections to external domains, which
// silently kills wagmi's tx confirmation subscriptions. HTTP + polling
// works through Brave Shields, firewalls, and corporate proxies.
const ARC_RPC = 'https://rpc.mainnet.arc.io'

// Pre-register chain RPC URLs so trace events show correct chain names immediately
registerChain(arc.id, ARC_RPC)

export const config = createConfig({
  chains: [arc, mainnet],
  connectors: [injected()],
  transports: {
    [arc.id]: http(ARC_RPC, { batch: true }),
    [mainnet.id]: http(),
  },
  // Poll every 2s for tx receipts instead of WebSocket push.
  // Ensures confirmations work in Brave with Shields enabled.
  pollingInterval: 2_000,
})
