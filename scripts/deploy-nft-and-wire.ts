/**
 * Deploy ReceiptNFT with minter=BatchPayout, then call setReceiptNFT.
 * BatchPayout is already deployed at BATCH_PAYOUT_ADDRESS.
 */
import { initiateSmartContractPlatformClient, type Blockchain } from '@circle-fin/smart-contract-platform'
import { initiateDeveloperControlledWalletsClient } from '@circle-fin/developer-controlled-wallets'
import fs from 'node:fs'
import crypto from 'node:crypto'

const WALLET_ID            = '7d1ff751-50a7-5ea7-b272-268bbe57b446'
const BATCH_PAYOUT_ADDRESS = '0xfec641e9a91f2361c2022622882bfe2ab819e47b'
const CHAIN                = 'ARC-TESTNET' as Blockchain

interface ArtifactJson { bytecode: { object: string }; abi: unknown[] }

async function pollTx(
  client: ReturnType<typeof initiateDeveloperControlledWalletsClient>,
  id: string
): Promise<void> {
  for (let i = 0; i < 30; i++) {
    await new Promise(r => setTimeout(r, 3000))
    const res   = await client.getTransaction({ id })
    const state = res.data?.transaction?.state
    console.log(`  tx state: ${state}`)
    if (state === 'COMPLETE') return
    if (['FAILED', 'DENIED', 'CANCELLED'].includes(state ?? '')) {
      throw new Error(`Transaction ${state}`)
    }
  }
  throw new Error('Timeout waiting for tx')
}

async function pollContractAddress(
  client: ReturnType<typeof initiateSmartContractPlatformClient>,
  id: string
): Promise<string> {
  for (let i = 0; i < 30; i++) {
    await new Promise(r => setTimeout(r, 3000))
    const res  = await client.getContract({ id })
    const c    = res.data?.contract
    const addr = c?.contractAddress ?? ''
    const status = (c as Record<string, unknown> | undefined)?.['status'] as string | undefined
    console.log(`  contract status: ${status ?? 'pending'}, address: ${addr}`)
    if (addr && addr !== '0x') return addr
  }
  throw new Error('Timeout waiting for contract address')
}

async function main() {
  const apiKey       = process.env.CIRCLE_API_KEY
  const entitySecret = process.env.CIRCLE_ENTITY_SECRET
  if (!apiKey || !entitySecret) throw new Error('Missing env vars')

  const scpClient    = initiateSmartContractPlatformClient({ apiKey, entitySecret })
  const walletClient = initiateDeveloperControlledWalletsClient({ apiKey, entitySecret })

  const artifact = JSON.parse(
    fs.readFileSync('/home/user/app/contracts/out/ReceiptNFT.sol/ReceiptNFT.json', 'utf-8')
  ) as ArtifactJson
  const bytecode = artifact.bytecode.object
  const abiJson  = JSON.stringify(artifact.abi)

  // 1. Deploy ReceiptNFT with minter = BatchPayout
  console.log('\n--- Deploying ReceiptNFT ---')
  const deployRes = await scpClient.deployContract({
    name: 'ReceiptNFTV3',
    walletId: WALLET_ID,
    blockchain: CHAIN,
    idempotencyKey: crypto.randomUUID(),
    abiJson,
    bytecode: bytecode.startsWith('0x') ? bytecode : `0x${bytecode}`,
    constructorParameters: [BATCH_PAYOUT_ADDRESS],
    fee: { type: 'level' as const, config: { feeLevel: 'MEDIUM' as const } },
  })

  const contractId = deployRes.data?.contractId
  if (!contractId) throw new Error(`No contractId: ${JSON.stringify(deployRes.data)}`)
  console.log('ReceiptNFT contract id:', contractId)

  const nftAddress = await pollContractAddress(scpClient, contractId)
  console.log('ReceiptNFT deployed at:', nftAddress)

  // 2. Call setReceiptNFT on BatchPayout
  console.log('\n--- Calling setReceiptNFT ---')
  const wireRes = await walletClient.createContractExecutionTransaction({
    walletId: WALLET_ID,
    contractAddress: BATCH_PAYOUT_ADDRESS,
    abiFunctionSignature: 'setReceiptNFT(address)',
    abiParameters: [nftAddress],
    fee: { type: 'level' as const, config: { feeLevel: 'MEDIUM' as const } },
  })

  const txId = wireRes.data?.id
  if (!txId) throw new Error(`No txId: ${JSON.stringify(wireRes.data)}`)
  console.log('setReceiptNFT tx id:', txId)
  await pollTx(walletClient, txId)

  console.log('\n=== ALL DONE ===')
  console.log('BatchPayout :', BATCH_PAYOUT_ADDRESS)
  console.log('ReceiptNFT  :', nftAddress)
  console.log('\nUpdate src/constants.ts and AGENTS.md with these addresses.')
}

main().catch((err: unknown) => {
  const msg = err instanceof Error ? err.message : String(err)
  console.error('\nFATAL:', msg)
  process.exit(1)
})
