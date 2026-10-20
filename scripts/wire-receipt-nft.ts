/**
 * Wires BatchPayout to ReceiptNFT by calling setReceiptNFT().
 * Run once after both contracts are deployed.
 * bun run scripts/wire-receipt-nft.ts
 */
import {
  initiateDeveloperControlledWalletsClient,
} from '@circle-fin/developer-controlled-wallets'

const BATCH_PAYOUT_ADDRESS = '0x7b354df86444c931286ef808c163814a85845258'
const RECEIPT_NFT_ADDRESS  = '0x4da89a38cd3824a9030cc2f4ce67ecc19b6040da'
const DEPLOYER_WALLET_ID   = '3c2464b2-8369-52e2-a782-800bbeca5396'

async function poll(client: ReturnType<typeof initiateDeveloperControlledWalletsClient>, id: string): Promise<string> {
  for (let i = 0; i < 30; i++) {
    const res = await client.getTransaction({ id })
    const state = res.data?.transaction?.state
    console.log(`  tx state: ${state}`)
    if (state === 'COMPLETE') return 'COMPLETE'
    if (state === 'FAILED' || state === 'DENIED' || state === 'CANCELLED') {
      throw new Error(`Transaction ${state}: ${JSON.stringify(res.data?.transaction)}`)
    }
    await new Promise(r => setTimeout(r, 2000))
  }
  throw new Error('Timed out waiting for transaction')
}

async function main() {
  const apiKey = process.env.CIRCLE_API_KEY
  const entitySecret = process.env.CIRCLE_ENTITY_SECRET
  if (!apiKey || !entitySecret) throw new Error('CIRCLE_API_KEY or CIRCLE_ENTITY_SECRET not set')

  const client = initiateDeveloperControlledWalletsClient({ apiKey, entitySecret })

  console.log('Calling setReceiptNFT on BatchPayout...')
  const res = await client.createContractExecutionTransaction({
    walletId: DEPLOYER_WALLET_ID,
    contractAddress: BATCH_PAYOUT_ADDRESS,
    abiFunctionSignature: 'setReceiptNFT(address)',
    abiParameters: [RECEIPT_NFT_ADDRESS],
    fee: { type: 'level', config: { feeLevel: 'MEDIUM' } },
  })

  const txId = res.data?.id
  if (!txId) throw new Error(`No transaction id returned: ${JSON.stringify(res)}`)
  console.log('Transaction id:', txId)

  const finalState = await poll(client, txId)
  console.log('Done. Final state:', finalState)
}

main().catch((err: unknown) => {
  const msg = err instanceof Error ? err.message : String(err)
  console.error('FAILED:', msg)
  process.exit(1)
})
