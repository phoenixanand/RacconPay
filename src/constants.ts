/**
 * RacconPay contract addresses on Arc Mainnet (chain ID 5042).
 *
 * DECIMAL NOTE:
 *   - Arc native USDC (gas): 18 decimals — never used here.
 *   - USDC ERC-20 (transfers): 6 decimals — used everywhere in this app.
 *   Do NOT mix the two decimal systems.
 */

export const ARC_CHAIN_ID = 5042 as const

export const USDC_ADDRESS  = '0x3600000000000000000000000000000000000000' as const
export const USDC_DECIMALS = 6

// BatchPayout v3 — immutable constructor wiring (usdc + receiptNFT), H-3 fix retained (Arc Mainnet)
// v2 archived: 0xAc13856F0238be40b4802ad1203411cA45c90C36 (broken: receiptNFT mismatch)
// v1 archived: 0xfB74B13bac51fb826D1c43bD7Ba013C94E10751B
export const BATCH_PAYOUT_ADDRESS = '0x1Da442B6cd376cBaDA9F86E5F88643ea6Ac8bBC9' as const
// ReceiptNFT v2 — minter = BatchPayout v3 (Arc Mainnet)
// v1 archived: 0x2a3681D762376A41676fE5f5C139d21dC5398321
export const RECEIPT_NFT_ADDRESS  = '0x97BBF37EAd1f3Dd3AF0a2c397085bF35cacf71D1' as const

// VestingStream (Arc Mainnet)
export const VESTING_STREAM_ADDRESS = '0x712c4C15c2d395c4EAa3377751afACfb14eFff03' as const

// BillSplitter v1 (Arc Mainnet — archived)
export const BILL_SPLITTER_V1_ADDRESS = '0x25D67caa97eda46B4b13Ba5512268f24734855D8' as const

// BillSplitter v3 — H-1 fix: MAX_EXPENSES=200 cap, TooManyExpenses error (Arc Mainnet)
// v2 archived: 0xC7A598C67E611F581554DE8b5bAD679f70ef6224
export const BILL_SPLITTER_ADDRESS = '0x1362beC447F1350Eb4b072F2De92FBD29Abb72d3' as const

// MultiSigPayout v3 — per-proposal co-signer model, batchPayout = BatchPayout v3 (Arc Mainnet)
// v2 archived: 0x2C9626c40E34Bd42DA1068302849F89936E5a2C7 (batchPayout pointed at v1)
// MultiSigPayout v4 — reject() + execute() restricted to proposer (Arc Mainnet)
// v3 archived: 0xD640F1C79930Be01ABCa41a28A89eDe9F93380d9
export const MULTISIG_ADDRESS = '0xF5ae83341dfd707f55F8f3818f9B6EACceC3f45e' as const

export const EXPLORER_BASE = 'https://explorer.arc.io'

export function explorerTx(hash: string) {
  return `${EXPLORER_BASE}/tx/${hash}`
}
export function explorerAddr(addr: string) {
  return `${EXPLORER_BASE}/address/${addr}`
}
