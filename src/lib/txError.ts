/** Turn a wallet or RPC error into a message a non-technical person can act on. Display only. */
export function friendlyTxError(err: unknown): string {
  const raw = err instanceof Error ? err.message : typeof err === 'string' ? err : ''
  const m = raw.toLowerCase()
  if (!m) return 'The transaction did not go through. Please try again.'
  if (m.includes('user rejected') || m.includes('user denied') || m.includes('rejected the request')) return 'You cancelled the request in your wallet. Nothing was sent.'
  if (m.includes('insufficient funds') || m.includes('exceeds the balance') || m.includes('exceeds balance')) return 'Your wallet does not have enough balance to cover this transaction and its network fee.'
  if (m.includes('transfer amount exceeds balance')) return 'Your USDC balance is lower than the amount you are trying to send.'
  if (m.includes('allowance')) return 'The USDC allowance is too low. Approve the amount again, then retry.'
  if (m.includes('chain') && (m.includes('mismatch') || m.includes('switch'))) return 'Your wallet is on a different network. Switch to Arc Mainnet and try again.'
  if (m.includes('blacklist') || m.includes('blocklist')) return 'One of the addresses is blocked from receiving USDC. Remove it and try again.'
  if (m.includes('reverted') || m.includes('execution reverted')) return 'The contract rejected this transaction. Check the details and try again.'
  if (m.includes('timeout') || m.includes('timed out')) return 'The network took too long to respond. Check the explorer before retrying so you do not pay twice.'
  if (m.includes('network') || m.includes('fetch failed') || m.includes('failed to fetch')) return 'Could not reach the Arc network. Check your connection and try again.'
  return 'The transaction did not go through. Please try again.'
}
