/**
 * One-time entity secret registration for ArcDesk.
 * Run with: bun run scripts/register-entity-secret.ts
 * NEVER commit this file's output or the .env values it writes.
 */
import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import { registerEntitySecretCiphertext, initiateDeveloperControlledWalletsClient } from '@circle-fin/developer-controlled-wallets'

async function main() {
  const apiKey = process.env.CIRCLE_API_KEY
  if (!apiKey) throw new Error('CIRCLE_API_KEY is not set in .env')

  // 1. Generate 32-byte secret (never printed to stdout)
  const entitySecret = crypto.randomBytes(32).toString('hex')

  // 2. Prepare recovery directory (must be under /home/user/app for sandbox download)
  const recoveryDir = '/home/user/app/.circle'
  fs.mkdirSync(recoveryDir, { recursive: true })

  // 3. Register ciphertext with Circle
  const response = await registerEntitySecretCiphertext({
    apiKey,
    entitySecret,
    recoveryFileDownloadPath: recoveryDir,
  })

  // 4. Write recovery file to disk
  const recoveryPath = path.join(recoveryDir, 'recovery_file.dat')
  if (response.data?.recoveryFile) {
    fs.writeFileSync(recoveryPath, response.data.recoveryFile, 'utf-8')
  }

  // 5. Persist secret to .env (never echo the value)
  const envPath = path.join('/home/user/app', '.env')
  fs.appendFileSync(envPath, `\nCIRCLE_ENTITY_SECRET=${entitySecret}\n`, 'utf-8')

  // 6. Verify registration with a read call
  const client = initiateDeveloperControlledWalletsClient({
    apiKey,
    entitySecret,
  })
  await client.listWalletSets({ pageSize: 1 })

  console.log('Entity secret registered and verified. Recovery file written to:', recoveryPath)
  console.log('CIRCLE_ENTITY_SECRET length check:', process.env.CIRCLE_ENTITY_SECRET?.length ?? '(not yet in env — written to .env file)')
}

main().catch((err: unknown) => {
  const msg = err instanceof Error ? err.message : String(err)
  console.error('Registration failed:', msg)
  process.exit(1)
})
