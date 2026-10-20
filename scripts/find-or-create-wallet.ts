/**
 * Find an existing wallet in this Circle account (or create one) for signing.
 */
import {
  initiateDeveloperControlledWalletsClient,
} from '@circle-fin/developer-controlled-wallets'
import crypto from 'node:crypto'

async function main() {
  const apiKey = process.env.CIRCLE_API_KEY
  const entitySecret = process.env.CIRCLE_ENTITY_SECRET
  if (!apiKey || !entitySecret) throw new Error('Missing CIRCLE_API_KEY or CIRCLE_ENTITY_SECRET')

  const client = initiateDeveloperControlledWalletsClient({ apiKey, entitySecret })

  // List existing wallet sets
  const setsRes = await client.listWalletSets({ pageSize: 5 })
  const sets = setsRes.data?.walletSets ?? []
  console.log('Wallet sets found:', sets.length)

  let walletSetId: string
  if (sets.length === 0) {
    // Create a wallet set
    const setRes = await client.createWalletSet({
      idempotencyKey: crypto.randomUUID(),
      name: 'ArcDesk Deployer',
    })
    walletSetId = setRes.data?.walletSet?.id ?? ''
    if (!walletSetId) throw new Error('No wallet set id in response')
    console.log('Created wallet set:', walletSetId)
  } else {
    walletSetId = sets[0].id ?? ''
    if (!walletSetId) throw new Error('Wallet set has no id')
    console.log('Using existing wallet set:', walletSetId)
  }

  // List wallets in the set
  const walletsRes = await client.listWallets({ pageSize: 5 })
  const wallets = (walletsRes.data?.wallets ?? []).filter(
    w => w.blockchain === 'ARC-TESTNET'
  )
  console.log('Arc Testnet wallets found:', wallets.length)

  if (wallets.length > 0) {
    for (const w of wallets) {
      console.log('  Wallet ID:', w.id, '| Address:', w.address, '| State:', w.state)
    }
    return
  }

  // Create a new Arc Testnet wallet
  const createRes = await client.createWallets({
    idempotencyKey: crypto.randomUUID(),
    blockchains: ['ARC-TESTNET'],
    count: 1,
    walletSetId,
  })
  const newWallet = createRes.data?.wallets?.[0]
  console.log('Created wallet:', newWallet?.id, '| Address:', newWallet?.address)
}

main().catch((err: unknown) => {
  const msg = err instanceof Error ? err.message : String(err)
  console.error('FAILED:', msg)
  process.exit(1)
})
