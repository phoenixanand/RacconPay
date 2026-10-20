/**
 * One-time setup: transfer ReceiptNFT ownership to BatchPayout.
 * The deployer wallet (3c2464b2-...) currently owns ReceiptNFT and
 * must call transferOwnership(batchPayout) so mint() works.
 *
 * Run once: bun run scripts/transfer-receipt-ownership.ts
 */
import { initiateDeveloperControlledWalletsClient } from '@circle-fin/developer-controlled-wallets'

const DEPLOYER_WALLET_ID = '3c2464b2-8369-52e2-a782-800bbeca5396'
const RECEIPT_NFT_ADDRESS  = '0x75996dc7ed7789b5c148c78978bf92fd7ab956ab'
const BATCH_PAYOUT_ADDRESS = '0x4e7899863f7da16c952436e5b99732dc375ccf0a'

const apiKey       = process.env.CIRCLE_API_KEY      || ''
const entitySecret = process.env.CIRCLE_ENTITY_SECRET || process.env.ENTITY_SECRET || ''

if (!apiKey || !entitySecret) {
  console.error('CIRCLE_API_KEY and CIRCLE_ENTITY_SECRET must be set in .env')
  process.exit(1)
}

const walletsClient = initiateDeveloperControlledWalletsClient({ apiKey, entitySecret })

async function main() {
  console.log('Transferring ReceiptNFT ownership to BatchPayout…')

  const res = await walletsClient.createContractExecutionTransaction({
    walletId: DEPLOYER_WALLET_ID,
    contractAddress: RECEIPT_NFT_ADDRESS,
    abiFunctionSignature: 'transferOwnership(address)',
    abiParameters: [BATCH_PAYOUT_ADDRESS],
    fee: { type: 'level', config: { feeLevel: 'MEDIUM' } },
  })

  const txId = res.data?.id
  if (!txId) { console.error('No tx id returned', res); process.exit(1) }
  console.log('Tx submitted, id:', txId)

  // Poll until terminal
  for (let i = 0; i < 30; i++) {
    await new Promise(r => setTimeout(r, 3000))
    const status = await walletsClient.getTransaction({ id: txId })
    const state  = status.data?.transaction?.state
    console.log('  state:', state)
    if (['COMPLETE', 'FAILED', 'DENIED', 'CANCELLED'].includes(state ?? '')) {
      if (state === 'COMPLETE') {
        console.log('SUCCESS — ReceiptNFT owner is now BatchPayout')
      } else {
        console.error('FAILED — state:', state)
        process.exit(1)
      }
      return
    }
  }
  console.error('Timed out waiting for tx')
  process.exit(1)
}

main().catch(e => { console.error(e); process.exit(1) })
