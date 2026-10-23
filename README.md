# RacconPay

> USDC money tools on Arc Mainnet

This is the project memory file.

---

## What This App Does

RacconPay is a USDC money-tools dApp for small groups and freelancers on Arc Mainnet (chain ID 5042).
- **Batch Payout + Receipts**: send USDC to up to 100 recipients in one tx; mints a non-transferable soul-bound receipt NFT to the payer.
- **Vesting / Streaming**: lock USDC for a recipient, released linearly over time; recipient can withdraw; sender can cancel.
- **Bill Splitter**: track shared expenses in a group; unequal splits supported; settle debts with USDC; 200-expense cap per bill.
- **MultiSig Payout**: per-proposal co-signer model; proposer + 2 co-signers; 7-day expiry with live countdown.
- **Invoice Generator**: create, share, and track USDC invoices with PDF export and paid-detection.
- **Portfolio**: live snapshot of USDC balance, vesting, pending multisig, open bills, and receipt history.

## Tech Stack

- Frontend: React 18, Vite, TypeScript, Tailwind CSS
- Web3: wagmi v2, viem v2, ConnectKit
- Contracts: Solidity 0.8.28 + Foundry. Sources in `contracts/`, unit tests in `contracts/test/*.t.sol`. Build with `bun run contracts:build` (`forge build`), test with `bun run contracts:test` (`forge test`).
- Wallet: injected (MetaMask, etc.)
- Chain: Arc Mainnet (Chain ID: 5042, custom chain in `src/config.ts`)
- Token: USDC ERC-20 (6 decimals, address: `0x3600000000000000000000000000000000000000`)
- Toasts: Sonner

## Key Files

- `src/App.tsx` - Main application logic
- `src/components/` - UI components
- `src/config.ts` - wagmi config (chains, connectors, transports)

