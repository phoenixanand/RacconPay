# Deploying the vesting contracts to Arc Mainnet (from your own computer)

Mainnet uses real USDC and every transaction is final. Arc Studio cannot deploy or sign on mainnet for you,
so you run the steps below yourself. These contracts have had automated review and tests, but no
independent audit. Start small.

## 1. What you need on your computer

- This project's code (use **Download Code** in Arc Studio, or clone your repository).
- [Bun](https://bun.sh) to run the app.
- Arc's Foundry fork (`arc-forge`, `arc-cast`): https://docs.arc.io/arc/tutorials/install-arc-foundry.md
  (standard Foundry cannot simulate Arc's native USDC; the script falls back to `forge` if the fork is missing).
- A deployer wallet with a little gas USDC on Arc Mainnet.

## 2. Where the private key goes

**Nowhere in this project.** Do not put it in a file, in `.env`, in a chat, or in any upload.

Import it once into an encrypted keystore on your computer. You will be asked for the key and to choose a password:

```
cast wallet import raccon-deployer --interactive
```

The deploy script only asks for the keystore name (`raccon-deployer`) and your password. If a key was ever pasted
into a chat or file, treat it as compromised and move its funds to a fresh wallet.

## 3. Deploy the pauses contract

Run from the project root, in your own terminal:

```
bash scripts/deploy-mainnet.sh raccon-deployer
```

The script:

1. Checks the RPC is Arc Mainnet (chain id 5042) and shows your deployer address and balance.
2. Asks you to type `DEPLOY` before sending anything.
3. Deploys `VestingStreamV2` with the Arc USDC address as its only constructor argument.
4. Checks the deployed contract exists and points at USDC.
5. Writes the public address and deploy transaction to `.env.local` (git-ignored):
   - `VITE_VESTING_V2_ADDRESS_MAINNET`
   - `VITE_VESTING_V2_DEPLOY_TX_MAINNET`

Then restart the app:

```
bun install
bun run dev
```

Open **Vesting**, stay on **Console (pilot)**, and **Arc Mainnet** appears next to Arc Testnet. Nothing else
in the frontend needs editing.

## 4. First test (do this before real amounts)

1. Create a stream of 0.01 USDC for about 10 minutes to a second wallet you control.
2. Claim, request a leave, approve it, and check the end date moves back.
3. Cancel a second tiny stream and withdraw.
4. Download the streams CSV and the activity report.

## 5. Yield on mainnet (Morpho or Aave)

Keep this off mainnet until every item below is done.

- **The testnet vault does not exist on mainnet.** The yield contract is tied to one vault, set when you deploy it.
- **Morpho (ERC-4626) is supported by the contract.** Find the official Arc Mainnet USDC vault address from
  Arc's contract-address page or Circle's Earn tooling. Do not use an address from memory or a chat.
  Then run:
  ```
  bash scripts/deploy-mainnet.sh raccon-deployer --yield <vault-address>
  ```
  The script checks that the vault exists and its asset is USDC, shows its size and share price, and makes you type
  a risk acknowledgement. It writes `VITE_VESTING_YIELD_ADDRESS_MAINNET`, `VITE_VESTING_YIELD_DEPLOY_TX_MAINNET` and
  `VITE_VESTING_YIELD_VAULT_MAINNET` to `.env.local`.
- **Aave is not supported by changing a setting.** Aave V4 is not an ERC-4626 vault, so it needs a new contract and a new review.
  I could not confirm Aave addresses on Arc.
- **Before any real yield stream:**
  1. An independent audit of the yield contract.
  2. A deposit, claim, stop and cancel test against the real mainnet vault with a tiny amount.
  3. A decision on who earns the yield (today it all goes to the payer) and whether the payee must accept it.

## 6. What to focus on

- Independent audit before real payroll.
- Verify every address on the Arc explorer (USDC, your contract, any vault).
- Keep the first mainnet deployment small and time-boxed.
- Known gaps: no payee address change, no multi-approver cancel, no handling of frozen USDC addresses, injected wallets only.

## 7. Troubleshooting

| Message | Meaning |
|---|---|
| `RPC reports chain id ... expected 5042` | Wrong RPC. Use `https://rpc.mainnet.arc.io` (or set `ARC_MAINNET_RPC_URL`). |
| `deployer has no gas USDC` | Fund the deployer wallet on Arc Mainnet first. |
| `vault asset is ..., not USDC` | That vault does not hold USDC. Do not use it. |
| Mainnet option missing in the console | `.env.local` not written, or `bun run dev` was not restarted. |
