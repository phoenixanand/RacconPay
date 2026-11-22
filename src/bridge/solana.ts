/**
 * Solana browser wallet support (Phantom and wallets that expose the same provider).
 * Phantom exposes `publicKey` instead of `address`, so it is wrapped before it reaches the adapter.
 */
import type { CreateAdapterFromProviderParams } from '@circle-fin/adapter-solana-kit'

type SolanaProvider = CreateAdapterFromProviderParams['provider']

interface PublicKeyProvider {
  isConnected: boolean
  publicKey: { toString(): string } | null
  connect(): Promise<{ publicKey: { toString(): string } }>
  disconnect(): Promise<void>
  signTransaction(transaction: unknown): Promise<unknown>
  signAllTransactions?(transactions: unknown[]): Promise<unknown[]>
}

declare global {
  interface Window {
    phantom?: { solana?: PublicKeyProvider }
  }
}

export function detectSolanaWallet(): PublicKeyProvider | undefined {
  return window.phantom?.solana
}

export function withAddress(wallet: PublicKeyProvider): SolanaProvider {
  return {
    get isConnected() { return wallet.isConnected },
    get address() { return wallet.publicKey?.toString() },
    connect: async () => ({ address: (await wallet.connect()).publicKey.toString() }),
    disconnect: () => wallet.disconnect(),
    signTransaction: tx => wallet.signTransaction(tx),
    signAllTransactions: wallet.signAllTransactions ? txs => wallet.signAllTransactions!(txs) : undefined,
  }
}

/** The Gateway adapter reads `publicKey` and does not accept `null` for a disconnected wallet. */
export function withPublicKey(wallet: PublicKeyProvider) {
  return {
    get isConnected() { return wallet.isConnected },
    get publicKey() { return wallet.publicKey ?? undefined },
    connect: () => wallet.connect(),
    disconnect: () => wallet.disconnect(),
    signTransaction: (tx: unknown) => wallet.signTransaction(tx),
    signAllTransactions: wallet.signAllTransactions ? (txs: unknown[]) => wallet.signAllTransactions!(txs) : undefined,
  }
}
