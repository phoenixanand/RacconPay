/**
 * RacconPay contracts on Arc Mainnet that the home and Bill Split stats read.
 * ReceiptNFT is not scanned: every receipt is minted inside a BatchPayout transaction that is already counted.
 * deployBlock values were resolved from each contract's creation block, so event scans start there (never block 0).
 */
import {
  ARC_CHAIN_ID, BATCH_PAYOUT_ADDRESS, VESTING_STREAM_ADDRESS,
  BILL_SPLITTER_V1_ADDRESS, BILL_SPLITTER_ADDRESS, MULTISIG_ADDRESS,
  VESTING_STREAM_V2_ADDRESS, VESTING_STREAM_V2_YIELD_ADDRESS, ESCROW_ADDRESS,
  VESTING_YIELD_VAULT_ADDRESS,
} from '../constants'

export type StatGroup = 'batch' | 'multisig' | 'vesting' | 'escrow' | 'split'

export interface StatContract {
  label: string
  address: `0x${string}`
  deployBlock: number
  group: StatGroup
  /** Funds held by this contract count towards TVL. */
  holdsFunds: boolean
}

export const STATS_CHAIN_ID = ARC_CHAIN_ID

export const ARC_MAINNET_CONTRACTS: StatContract[] = [
  { label: 'BatchPayout',        address: BATCH_PAYOUT_ADDRESS,             deployBlock: 26_388_652, group: 'batch',    holdsFunds: true },
  { label: 'MultiSigPayout',     address: MULTISIG_ADDRESS,                 deployBlock: 26_742_481, group: 'multisig', holdsFunds: true },
  { label: 'VestingStream',      address: VESTING_STREAM_ADDRESS,           deployBlock: 26_028_059, group: 'vesting',  holdsFunds: true },
  { label: 'VestingStreamV2',    address: VESTING_STREAM_V2_ADDRESS,        deployBlock: 29_902_184, group: 'vesting',  holdsFunds: true },
  { label: 'VestingStreamV2Yield', address: VESTING_STREAM_V2_YIELD_ADDRESS, deployBlock: 29_907_098, group: 'vesting', holdsFunds: true },
  { label: 'MilestoneEscrow',    address: ESCROW_ADDRESS,                   deployBlock: 29_902_433, group: 'escrow',   holdsFunds: true },
  { label: 'BillSplitter v1',    address: BILL_SPLITTER_V1_ADDRESS,         deployBlock: 26_027_908, group: 'split',    holdsFunds: true },
  { label: 'BillSplitter v3',    address: BILL_SPLITTER_ADDRESS,            deployBlock: 26_251_754, group: 'split',    holdsFunds: true },
]

/** The Bill Split page only reads the live BillSplitter. */
export const BILL_SPLITTER_STATS_CONTRACTS = ARC_MAINNET_CONTRACTS.filter(c => c.address === BILL_SPLITTER_ADDRESS)

/** Aave V4 USDC vault (ERC-4626). VestingStreamV2Yield holds vault shares that count towards TVL. */
export const YIELD_VAULT = {
  vault: VESTING_YIELD_VAULT_ADDRESS,
  holder: VESTING_STREAM_V2_YIELD_ADDRESS,
} as const

export function contractsForGroups(groups: StatGroup[]): StatContract[] {
  return ARC_MAINNET_CONTRACTS.filter(c => groups.includes(c.group))
}
