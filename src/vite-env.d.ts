/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** WalletConnect Cloud project ID */
  readonly VITE_WALLETCONNECT_PROJECT_ID?: string
  readonly VITE_VESTING_V2_ADDRESS_MAINNET?: string
  readonly VITE_VESTING_YIELD_ADDRESS_MAINNET?: string
  readonly VITE_VESTING_V2_DEPLOY_TX_MAINNET?: string
  readonly VITE_VESTING_YIELD_DEPLOY_TX_MAINNET?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
