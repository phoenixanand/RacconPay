# Deploying RacconPay contracts to Arc Mainnet (step by step)

Mainnet uses real USDC and every transaction is final. Arc Studio cannot deploy, sign or hold funds on mainnet, so you run every command below yourself, on your own computer. These contracts have had automated review and tests but no independent audit. Get an audit before real payroll or large escrow, and start with tiny amounts.

Network facts (Arc Mainnet):
- Chain ID: 5042
- RPC: https://rpc.mainnet.arc.io
- Explorer: https://explorer.arc.io
- USDC (ERC-20, 6 decimals): 0x3600000000000000000000000000000000000000
- Gas is paid in USDC, so the deployer wallet needs USDC on Arc Mainnet.

## Deployed so far

| Contract | Address | Deploy transaction |
|---|---|---|
| VestingStreamV2 | 0x09c6Dc5A8f169e614771920a47B9B4d5e1063900 | 0x215571c9f153c722ffcd2caa43f6f099d370524c8ee1ddbf5d27099d8f2b137f |
| MilestoneEscrow (USDC + EURC) | 0xcD971ac0cC0664C8e6Db791468eC42C59816b624 | 0x59e5d148696d7e77dd6e91ae20e5e9a0ab9a532896764e1aa779f0496ac1d4fa |
| VestingStreamV2Yield (Aave V4 vault 0x42EAB64310E1D1c66b4d8aF7C9C4ce253885eB83) | 0x4bb6D83bFDa8bECc397986EADe909294bB3b31BD | 0x5d51f9c5d240cae68171a3d04687774d36496f6bb20b953a535018d025fb4fae |

All three are wired into the app in `src/constants.ts`. The escrow uses USDC 0x3600000000000000000000000000000000000000 and EURC 0xbEf5f6d51CB62b58e6A8f77868681825C6fe21c1. Vesting Yield now runs on Arc Mainnet against the Aave V4 USDC vault. Swap (USDC, EURC and cirBTC through Circle App Kit) now defaults to Arc Mainnet and needs no contract of yours.

## What is already on mainnet, and what is not

Already deployed (no action): BatchPayout v3, ReceiptNFT v2, VestingStream v1, BillSplitter v3, MultiSigPayout v4. Their addresses are in `src/constants.ts`.

Not on mainnet yet (these are the ones you deploy):

| Contract | File | Constructor arguments | Script |
|---|---|---|---|
| VestingStreamV2 | `contracts/VestingStreamV2.sol` | USDC address | `scripts/deploy-mainnet.sh` |
| VestingStreamV2Yield | `contracts/VestingStreamV2Yield.sol` | USDC address, ERC-4626 USDC vault address | `scripts/deploy-mainnet.sh --yield <vault>` |
| MilestoneEscrow | `contracts/MilestoneEscrow.sol` | USDC address, EURC address | manual `forge create` (below) |

The app's escrow page uses `MilestoneEscrow` (the original, not `MilestoneEscrowV2`). The 3 failing tests are in `MilestoneEscrowV2`, which the app does not use.

## Step 1. Get the code on your computer

In Arc Studio use **Download Code** in the Code panel, or clone your repository:

```
git clone https://github.com/phoenixanand/RacconPay.git
cd RacconPay
```

## Step 2. Install the tools

1. Bun (https://bun.sh), then in the project folder:
   ```
   bun install
   ```
   This installs the OpenZeppelin contracts that the build reads from `node_modules`.
2. Foundry. Arc recommends its own Foundry fork because standard Foundry cannot simulate Arc's native USDC. Follow https://docs.arc.io/arc/tutorials/install-arc-foundry.md. The deploy script uses `arc-forge` and `arc-cast` when they exist and falls back to `forge` and `cast`.
3. Check the build works:
   ```
   forge build
   ```
   If it complains that `forge-std` is missing, run `forge install foundry-rs/forge-std` and build again.

## Step 3. Where the private key goes

Nowhere in the project. Do not put it in `.env`, a file, a chat, a screenshot or an upload.

Import it once into an encrypted keystore on your computer. This is the only place you type it:

```
cast wallet import raccon-deployer --interactive
```

The terminal asks you to paste the private key (the input is hidden) and to choose a password. Foundry stores it encrypted in `~/.foundry/keystores/raccon-deployer`. After that, every command only refers to the name `raccon-deployer` and asks for the password.

Use a fresh wallet made only for deploying. If a key was ever pasted into a chat or file, treat it as compromised and move its funds.

Get the wallet address and fund it with a little USDC on Arc Mainnet for gas:

```
cast wallet address --account raccon-deployer
```

## Step 4. Deploy VestingStreamV2

```
bash scripts/deploy-mainnet.sh raccon-deployer
```

The script checks the RPC is chain 5042, shows your deployer address and balance, asks you to type `DEPLOY`, deploys, checks the contract points at USDC, and writes the address to `.env.local`:
- `VITE_VESTING_V2_ADDRESS_MAINNET`
- `VITE_VESTING_V2_DEPLOY_TX_MAINNET`

## Step 5. (Optional) Deploy VestingStreamV2Yield

Keep this off until you have done all of the following:
1. Find the official Arc Mainnet USDC ERC-4626 vault address from Arc's contract-address page or Circle's Earn tooling. Do not use an address from memory or from a chat.
2. Get an independent audit of the yield contract.
3. Plan a tiny deposit, claim, stop and cancel test against the real vault.

Then run:

```
bash scripts/deploy-mainnet.sh raccon-deployer --yield <vault-address>
```

The script checks the vault holds USDC, shows its size and share price, and makes you type a risk acknowledgement. It writes `VITE_VESTING_YIELD_ADDRESS_MAINNET`, `VITE_VESTING_YIELD_DEPLOY_TX_MAINNET` and `VITE_VESTING_YIELD_VAULT_MAINNET`.

## Step 6. (Optional) Deploy MilestoneEscrow

The script does not cover escrow, so use `forge create`. You need the official EURC address on Arc Mainnet from Circle's EURC contract-address page (https://developers.circle.com/stablecoins/eurc-contract-addresses). Do not guess it.

```
forge create contracts/MilestoneEscrow.sol:MilestoneEscrow \
  --rpc-url https://rpc.mainnet.arc.io \
  --account raccon-deployer \
  --broadcast \
  --constructor-args 0x3600000000000000000000000000000000000000 <EURC_ADDRESS_ON_ARC_MAINNET>
```

Use `arc-forge` instead of `forge` if you installed the Arc fork. Write down the "Deployed to" address and the transaction hash.

## Step 7. Check every deployment

For each contract:
1. Open the address on https://explorer.arc.io and confirm code exists.
2. Read the stored token addresses (for example `cast call <address> "usdc()(address)" --rpc-url https://rpc.mainnet.arc.io`) and confirm they match the official USDC (and EURC) addresses.
3. Verify the source on the explorer following Arc's documentation, so users can read it.

## Step 8. Send the addresses back

Send me the addresses and deployment transaction hashes (public information only, never keys). I will then:
- add the mainnet addresses to `src/constants.ts` or the `VITE_*` entries,
- switch the escrow and swap pages from hard-coded Arc Testnet to the correct network,
- change "Testnet" labels and links to mainnet,
- keep testnet addresses only where you still want a testnet option,
- run lint, typecheck and a build.

Some things I cannot confirm for you: the official mainnet EURC address, the official mainnet vault address, and whether Circle's swap service supports your pairs on mainnet. Check those in official docs first.

## Step 9. First live test

1. Create a stream of 0.01 USDC for about 10 minutes to a second wallet you control.
2. Claim, request a leave, approve it, and check the end date moves.
3. Cancel a second tiny stream and withdraw.
4. For escrow, create a small milestone, submit, approve and withdraw.
5. Only then use real amounts.

## Troubleshooting

| Message | Meaning |
|---|---|
| `RPC reports chain id ... expected 5042` | Wrong RPC. Use https://rpc.mainnet.arc.io (or set `ARC_MAINNET_RPC_URL`). |
| `deployer has no gas USDC` | Fund the deployer wallet on Arc Mainnet first. |
| `vault asset is ..., not USDC` | That vault does not hold USDC. Do not use it. |
| Mainnet option missing in the Vesting console | `.env.local` not written, or `bun run dev` not restarted. |
| `forge: command not found` | Install Foundry (Step 2). |
