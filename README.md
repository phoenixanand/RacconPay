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

## Deployed Contracts — Arc Testnet (chain ID 5042002, archived) (Arc Testnet)

| Contract | Address | Explorer |
|---|---|---|
| RacconPayProbe (smoke test) | `0xc087b922267d98e841f352220b29dc0815c350a2` | [view](https://explorer.testnet.arc.io/address/0xc087b922267d98e841f352220b29dc0815c350a2) |
| BatchPayout (v3, active) | `0xfec641e9a91f2361c2022622882bfe2ab819e47b` | [view](https://explorer.testnet.arc.io/address/0xfec641e9a91f2361c2022622882bfe2ab819e47b) |
| ReceiptNFT (v3, active) | `0x6aa4aa1df7c28a8fc1e2c0546290d2f2746a1ee0` | [view](https://explorer.testnet.arc.io/address/0x6aa4aa1df7c28a8fc1e2c0546290d2f2746a1ee0) |
| VestingStream (v1, active) | `0x5cd70c24061854da8496b660a6a242cc8925a23e` | [view](https://explorer.testnet.arc.io/address/0x5cd70c24061854da8496b660a6a242cc8925a23e) |
| BillSplitter (v1, active) | `0x83683bbed6f5c309e92d9f4db29ddcee4b56079d` | [view](https://explorer.testnet.arc.io/address/0x83683bbed6f5c309e92d9f4db29ddcee4b56079d) |
| MultiSigPayout (v1, 2-of-2) | `0xa9af30941aeae61faea4c545a7d3ca99cea8308e` | [view](https://explorer.testnet.arc.io/address/0xa9af30941aeae61faea4c545a7d3ca99cea8308e) |

## To Run

```bash
bun install
bun run dev
```

## SimplePayRequest (Arc Testnet)
- Address: `0xbfbc9f112039095fc157cc5abaa0ff52c844f608`
- TX: `0x3ca3681696e631e96d88a3fd33c4da084d5abb569cc77814a40dd515e4adc818`
