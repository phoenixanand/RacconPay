/**
 * wagmi configuration, RacconPay
 *
 * Wallets: injected (MetaMask etc.) and WalletConnect (mobile and other wallets, needs
 * VITE_WALLETCONNECT_PROJECT_ID).
 */

import { http, createConfig } from 'wagmi'
import { mainnet } from 'wagmi/chains'
import { arc, arcTestnet, base, avalanche } from 'viem/chains'
import { injected, walletConnect } from 'wagmi/connectors'
import { registerChain } from './tracing'

// Explicit HTTP RPC, forces HTTP-only polling, no WebSocket.
// Brave Shields blocks WebSocket connections to external domains, which
// silently kills wagmi's tx confirmation subscriptions. HTTP + polling
// works through Brave Shields, firewalls, and corporate proxies.
const ARC_RPC = 'https://rpc.mainnet.arc.io'

// Pre-register chain RPC URLs so trace events show correct chain names immediately
registerChain(arc.id, ARC_RPC)

// Arc Testnet (chain 5042002), used by Vesting V2 (breaks) while it is tested.
const ARC_TESTNET_RPC = 'https://rpc.testnet.arc.io'
registerChain(arcTestnet.id, ARC_TESTNET_RPC)

// Bridge chains (mainnet). Used by the Bridge page to switch the wallet before burning.
const ETHEREUM_RPC = 'https://ethereum-rpc.publicnode.com'
const BASE_RPC = 'https://base-rpc.publicnode.com'
const AVALANCHE_RPC = 'https://api.avax.network/ext/bc/C/rpc'
registerChain(mainnet.id, ETHEREUM_RPC)
registerChain(base.id, BASE_RPC)
registerChain(avalanche.id, AVALANCHE_RPC)

const WALLETCONNECT_PROJECT_ID = import.meta.env.VITE_WALLETCONNECT_PROJECT_ID

export const walletConnectEnabled = Boolean(WALLETCONNECT_PROJECT_ID)

export const config = createConfig({
  chains: [arc, arcTestnet, mainnet, base, avalanche],
  connectors: [
    injected(),
    // Only added when a project ID is set, so the app still works without one.
    ...(WALLETCONNECT_PROJECT_ID
      ? [
          walletConnect({
            projectId: WALLETCONNECT_PROJECT_ID,
            showQrModal: false, // ConnectKit renders the QR code
            metadata: {
              name: 'RacconPay',
              description: 'USDC money tools on Arc',
              url: window.location.origin,
              icons: [],
            },
          }),
        ]
      : []),
  ],
  transports: {
    [arc.id]: http(ARC_RPC, { batch: true }),
    [arcTestnet.id]: http(ARC_TESTNET_RPC, { batch: true }),
    [mainnet.id]: http(ETHEREUM_RPC, { batch: true }),
    [base.id]: http(BASE_RPC, { batch: true }),
    [avalanche.id]: http(AVALANCHE_RPC, { batch: true }),
  },
  // Poll every 2s for tx receipts instead of WebSocket push.
  // Ensures confirmations work in Brave with Shields enabled.
  pollingInterval: 2_000,
})
