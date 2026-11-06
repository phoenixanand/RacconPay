/**
 * RacconPay contract addresses on Arc Mainnet (chain ID 5042).
 *
 * DECIMAL NOTE:
 *   - Arc native USDC (gas): 18 decimals, never used here.
 *   - USDC ERC-20 (transfers): 6 decimals, used everywhere in this app.
 *   Do NOT mix the two decimal systems.
 */

export const ARC_CHAIN_ID = 5042 as const

export const USDC_ADDRESS  = '0x3600000000000000000000000000000000000000' as const
export const USDC_DECIMALS = 6

// BatchPayout v3, immutable constructor wiring (usdc + receiptNFT), H-3 fix retained (Arc Mainnet)
// v2 archived: 0xAc13856F0238be40b4802ad1203411cA45c90C36 (broken: receiptNFT mismatch)
// v1 archived: 0xfB74B13bac51fb826D1c43bD7Ba013C94E10751B
export const BATCH_PAYOUT_ADDRESS = '0x1Da442B6cd376cBaDA9F86E5F88643ea6Ac8bBC9' as const
// ReceiptNFT v2, minter = BatchPayout v3 (Arc Mainnet)
// v1 archived: 0x2a3681D762376A41676fE5f5C139d21dC5398321
export const RECEIPT_NFT_ADDRESS  = '0x97BBF37EAd1f3Dd3AF0a2c397085bF35cacf71D1' as const

// VestingStream (Arc Mainnet)
export const VESTING_STREAM_ADDRESS = '0x712c4C15c2d395c4EAa3377751afACfb14eFff03' as const

// BillSplitter v1 (Arc Mainnet, archived)
export const BILL_SPLITTER_V1_ADDRESS = '0x25D67caa97eda46B4b13Ba5512268f24734855D8' as const

// BillSplitter v3, H-1 fix: MAX_EXPENSES=200 cap, TooManyExpenses error (Arc Mainnet)
// v2 archived: 0xC7A598C67E611F581554DE8b5bAD679f70ef6224
export const BILL_SPLITTER_ADDRESS = '0x1362beC447F1350Eb4b072F2De92FBD29Abb72d3' as const

// MultiSigPayout v3, per-proposal co-signer model, batchPayout = BatchPayout v3 (Arc Mainnet)
// v2 archived: 0x2C9626c40E34Bd42DA1068302849F89936E5a2C7 (batchPayout pointed at v1)
// MultiSigPayout v4, reject() + execute() restricted to proposer (Arc Mainnet)
// v3 archived: 0xD640F1C79930Be01ABCa41a28A89eDe9F93380d9
export const MULTISIG_ADDRESS = '0xF5ae83341dfd707f55F8f3818f9B6EACceC3f45e' as const

// ── Arc Testnet (chain ID 5042002) ──────────────────────────────────────
export const ARC_TESTNET_CHAIN_ID = 5042002 as const
export const TESTNET_EXPLORER_BASE = 'https://explorer.testnet.arc.io'

// VestingStreamV2 (breaks / leave), Arc Testnet. Not audited for mainnet.
export const VESTING_STREAM_V2_TESTNET_ADDRESS = '0x57ac4bd8d65e9b32953d35f45383b8b113db984f' as const

// VestingStreamV2Yield, same as V2 plus opt-in yield into one ERC-4626 vault (Arc Testnet only).
export const VESTING_STREAM_V2_YIELD_TESTNET_ADDRESS = '0x6dc957426da30dc98027f3350795793dc5eef13c' as const
// The Earn vault (Morpho VaultV2, USDC) the yield contract above was deployed against.
export const VESTING_YIELD_VAULT_TESTNET_ADDRESS = '0xaabbef1d3971c710276ed41ec791bbe14cdb8e88' as const

// Arc Mainnet: VestingStreamV2 and MilestoneEscrow, deployed by the project owner.
// Not independently audited. Use small amounts first.
export const VESTING_STREAM_V2_ADDRESS = '0x09c6Dc5A8f169e614771920a47B9B4d5e1063900' as const
export const VESTING_STREAM_V2_DEPLOY_TX = '0x215571c9f153c722ffcd2caa43f6f099d370524c8ee1ddbf5d27099d8f2b137f' as const
// VestingStreamV2Yield on Arc Mainnet, deployed against the Aave V4 Core USDC Tokenization Spoke (ERC-4626).
// Not independently audited. Yield is opt-in per stream and paid to the payer.
export const VESTING_STREAM_V2_YIELD_ADDRESS = '0x4bb6D83bFDa8bECc397986EADe909294bB3b31BD' as const
export const VESTING_STREAM_V2_YIELD_DEPLOY_TX = '0x5d51f9c5d240cae68171a3d04687774d36496f6bb20b953a535018d025fb4fae' as const
export const VESTING_YIELD_VAULT_ADDRESS = '0x42EAB64310E1D1c66b4d8aF7C9C4ce253885eB83' as const
export const ESCROW_ADDRESS = '0xcD971ac0cC0664C8e6Db791468eC42C59816b624' as const
export const ESCROW_DEPLOY_TX = '0x59e5d148696d7e77dd6e91ae20e5e9a0ab9a532896764e1aa779f0496ac1d4fa' as const

// MilestoneEscrow on Arc Testnet (kept for reference, the Escrow page now runs on Arc Mainnet).
export const ESCROW_TESTNET_ADDRESS = '0x352deb3ce0eba5016d27b98de877dca7761c3e79' as const
export const ESCROW_TESTNET_DEPLOY_TX = '0x4bbcdae1df1dc3f5ff037dd8dd11b61cfc3c4e3edd0ac9fb19e965c7ebdea493' as const

const ADDRESS_RE = /^0x[0-9a-fA-F]{40}$/
const TX_RE = /^0x[0-9a-fA-F]{64}$/
const envAddress = (v: unknown): `0x${string}` | undefined =>
  typeof v === 'string' && ADDRESS_RE.test(v) ? (v as `0x${string}`) : undefined
const envTx = (v: unknown): `0x${string}` | undefined =>
  typeof v === 'string' && TX_RE.test(v) ? (v as `0x${string}`) : undefined

// Deployment transactions (used to start event scans at the deployment block, never at block 0).
// Mainnet values are written to .env.local by scripts/deploy-mainnet.sh.
export function vestingDeployTx(contract: string): `0x${string}` | undefined {
  const c = contract.toLowerCase()
  const known: Record<string, `0x${string}` | undefined> = {
    [VESTING_STREAM_V2_TESTNET_ADDRESS]: '0x3c34ddfa47a922979675ba37182c1007cfd64517bcea4de58b5deee33516b65e',
    [VESTING_STREAM_V2_YIELD_TESTNET_ADDRESS]: '0xfdc50d9a53a232496a935ed41f192d7ca954fe0dca366cc3937acf4839afffba',
    [VESTING_STREAM_V2_ADDRESS.toLowerCase()]: VESTING_STREAM_V2_DEPLOY_TX,
    [VESTING_STREAM_V2_YIELD_ADDRESS.toLowerCase()]: VESTING_STREAM_V2_YIELD_DEPLOY_TX,
  }
  const mainnetV2 = envAddress(import.meta.env.VITE_VESTING_V2_ADDRESS_MAINNET)
  const mainnetYield = envAddress(import.meta.env.VITE_VESTING_YIELD_ADDRESS_MAINNET)
  if (mainnetV2) known[mainnetV2.toLowerCase()] = envTx(import.meta.env.VITE_VESTING_V2_DEPLOY_TX_MAINNET)
  if (mainnetYield) known[mainnetYield.toLowerCase()] = envTx(import.meta.env.VITE_VESTING_YIELD_DEPLOY_TX_MAINNET)
  return known[c]
}

/**
 * Yield-enabled vesting contract per chain. On Arc Mainnet it is the deployed VESTING_STREAM_V2_YIELD_ADDRESS
 * (Aave V4 vault); VITE_VESTING_YIELD_ADDRESS_MAINNET can override it.
 */
export function vestingYieldAddress(chainId: number): `0x${string}` | undefined {
  if (chainId === ARC_TESTNET_CHAIN_ID) return VESTING_STREAM_V2_YIELD_TESTNET_ADDRESS
  if (chainId === ARC_CHAIN_ID) return envAddress(import.meta.env.VITE_VESTING_YIELD_ADDRESS_MAINNET) ?? VESTING_STREAM_V2_YIELD_ADDRESS
  return undefined
}

/**
 * VestingStreamV2 address per chain. Mainnet is only enabled when you deploy V2
 * yourself (scripts/deploy-mainnet.sh), which sets VITE_VESTING_V2_ADDRESS_MAINNET in .env.local.
 * Without that variable the deployed VESTING_STREAM_V2_ADDRESS is used.
 */
export function vestingV2Address(chainId: number): `0x${string}` | undefined {
  if (chainId === ARC_TESTNET_CHAIN_ID) return VESTING_STREAM_V2_TESTNET_ADDRESS
  if (chainId === ARC_CHAIN_ID) return envAddress(import.meta.env.VITE_VESTING_V2_ADDRESS_MAINNET) ?? VESTING_STREAM_V2_ADDRESS
  return undefined
}

export function chainLabel(chainId: number): string {
  return chainId === ARC_TESTNET_CHAIN_ID ? 'Arc Testnet' : 'Arc Mainnet'
}

export function explorerTxFor(chainId: number, hash: string) {
  const base = chainId === ARC_TESTNET_CHAIN_ID ? TESTNET_EXPLORER_BASE : 'https://explorer.arc.io'
  return `${base}/tx/${hash}`
}

export const EXPLORER_BASE = 'https://explorer.arc.io'

export function explorerTx(hash: string) {
  return `${EXPLORER_BASE}/tx/${hash}`
}
export function explorerAddr(addr: string) {
  return `${EXPLORER_BASE}/address/${addr}`
}
