/**
 * Deploy BatchPayout + ReceiptNFT from the user's developer-controlled wallet,
 * then call setReceiptNFT to wire them together.
 *
 * Run: bun run scripts/deploy-and-wire.ts
 *
 * NOTE: BatchPayout is ALREADY deployed at 0xfec641e9…
 *       Use deploy-nft-and-wire.ts instead for the follow-up step.
 *       This script is kept for reference.
 */
import {
  initiateDeveloperControlledWalletsClient,
} from '@circle-fin/developer-controlled-wallets'
import {
  initiateSmartContractPlatformClient,
  type Blockchain,
} from '@circle-fin/smart-contract-platform'
import fs from 'node:fs'
import crypto from 'node:crypto'

const WALLET_ID    = '7d1ff751-50a7-5ea7-b272-268bbe57b446'
const USDC_ADDRESS = '0x3600000000000000000000000000000000000000'
const CHAIN        = 'ARC-TESTNET' as Blockchain

interface ArtifactJson { bytecode: { object: string }; abi: unknown[] }

const batchPayoutArtifact = JSON.parse(
  fs.readFileSync('/home/user/app/contracts/out/BatchPayout.sol/BatchPayout.json', 'utf-8')
) as ArtifactJson
const receiptNFTArtifact = JSON.parse(
  fs.readFileSync('/home/user/app/contracts/out/ReceiptNFT.sol/ReceiptNFT.json', 'utf-8')
) as ArtifactJson

async function pollTx(
  walletClient: ReturnType<typeof initiateDeveloperControlledWalletsClient>,
  id: string
): Promise<void> {
  for (let i = 0; i < 40; i++) {
    await new Promise(r => setTimeout(r, 3000))
    const res   = await walletClient.getTransaction({ id })
    const state = res.data?.transaction?.state
    console.log(`  [tx ${id.slice(0, 8)}…] state: ${state}`)
    if (state === 'COMPLETE') return
    if (['FAILED', 'DENIED', 'CANCELLED'].includes(state ?? '')) {
      throw new Error(`Transaction ${state}`)
    }
  }
  throw new Error('Timeout waiting for transaction')
}

async function pollContract(
  scpClient: ReturnType<typeof initiateSmartContractPlatformClient>,
  id: string
): Promise<string> {
  for (let i = 0; i < 40; i++) {
    await new Promise(r => setTimeout(r, 3000))
    const res    = await scpClient.getContract({ id })
    const c      = res.data?.contract
    // The SDK type exposes contractAddress and status
    const status = (c as Record<string, unknown> | undefined)?.['status'] as string | undefined
    const addr   = c?.contractAddress ?? ''
    console.log(`  [contract ${id.slice(0, 8)}…] status: ${status}, address: ${addr}`)
    if (addr) return addr
    if (status === 'FAILED') {
      throw new Error(`Contract deployment FAILED: ${JSON.stringify(c)}`)
    }
  }
  throw new Error('Timeout waiting for contract deployment')
}

async function main() {
  const apiKey       = process.env.CIRCLE_API_KEY
  const entitySecret = process.env.CIRCLE_ENTITY_SECRET
  if (!apiKey || !entitySecret) throw new Error('Missing CIRCLE_API_KEY or CIRCLE_ENTITY_SECRET')

  const walletClient = initiateDeveloperControlledWalletsClient({ apiKey, entitySecret })
  const scpClient    = initiateSmartContractPlatformClient({ apiKey, entitySecret })

  // 1. Deploy BatchPayout (constructor arg: USDC address)
  console.log('\n--- Deploying BatchPayout ---')
  const bpBytecode = batchPayoutArtifact.bytecode.object
  const bpAbi      = JSON.stringify(batchPayoutArtifact.abi)

  const bpDeployRes = await scpClient.deployContract({
    name: 'BatchPayoutV3',
    walletId: WALLET_ID,
    blockchain: CHAIN,
    idempotencyKey: crypto.randomUUID(),
    abiJson: bpAbi,
    bytecode: bpBytecode.startsWith('0x') ? bpBytecode : `0x${bpBytecode}`,
    constructorParameters: [USDC_ADDRESS],
    fee: { type: 'level' as const, config: { feeLevel: 'MEDIUM' as const } },
  })

  console.log('BatchPayout deploy response:', JSON.stringify(bpDeployRes.data, null, 2))
  const bpContractId = bpDeployRes.data?.contractId
  if (!bpContractId) throw new Error(`No contractId from BatchPayout deploy: ${JSON.stringify(bpDeployRes.data)}`)
  console.log('BatchPayout contract id:', bpContractId)

  const bpAddress = await pollContract(scpClient, bpContractId)
  console.log('BatchPayout deployed at:', bpAddress)

  // 2. Deploy ReceiptNFT with minter = bpAddress
  console.log('\n--- Deploying ReceiptNFT ---')
  const nftBytecode = receiptNFTArtifact.bytecode.object
  const nftAbi      = JSON.stringify(receiptNFTArtifact.abi)

  const nftDeployRes = await scpClient.deployContract({
    name: 'ReceiptNFTV3',
    walletId: WALLET_ID,
    blockchain: CHAIN,
    idempotencyKey: crypto.randomUUID(),
    abiJson: nftAbi,
    bytecode: nftBytecode.startsWith('0x') ? nftBytecode : `0x${nftBytecode}`,
    constructorParameters: [bpAddress],
    fee: { type: 'level' as const, config: { feeLevel: 'MEDIUM' as const } },
  })

  const nftContractId = nftDeployRes.data?.contractId
  if (!nftContractId) throw new Error(`No contractId from ReceiptNFT deploy: ${JSON.stringify(nftDeployRes.data)}`)
  console.log('ReceiptNFT contract id:', nftContractId)

  const nftAddress = await pollContract(scpClient, nftContractId)
  console.log('ReceiptNFT deployed at:', nftAddress)

  // 3. Call setReceiptNFT on BatchPayout
  console.log('\n--- Calling setReceiptNFT ---')
  const wireRes = await walletClient.createContractExecutionTransaction({
    walletId: WALLET_ID,
    contractAddress: bpAddress,
    abiFunctionSignature: 'setReceiptNFT(address)',
    abiParameters: [nftAddress],
    fee: { type: 'level' as const, config: { feeLevel: 'MEDIUM' as const } },
  })

  const wireTxId = wireRes.data?.id
  if (!wireTxId) throw new Error(`No tx id from setReceiptNFT: ${JSON.stringify(wireRes.data)}`)
  console.log('setReceiptNFT tx id:', wireTxId)
  await pollTx(walletClient, wireTxId)

  console.log('\n=== DONE ===')
  console.log('BatchPayout:', bpAddress)
  console.log('ReceiptNFT: ', nftAddress)
  console.log('Update src/constants.ts with these addresses!')
}

main().catch((err: unknown) => {
  const msg = err instanceof Error ? err.message : String(err)
  console.error('\nFATAL:', msg)
  process.exit(1)
})
