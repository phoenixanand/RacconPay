# Aave V4 for vesting yield, and what to add to Swap on mainnet

Arc Studio does not deploy, sign or send transactions on mainnet. Everything below that touches mainnet is something you run yourself. Facts below were checked against public sources and read-only calls to Arc Mainnet on 2026-11-06. Re-check addresses against the official Aave and Arc pages before you deploy.

## Part 1. Aave V4 as the yield source

### Correction to what the repo docs said
`docs/mainnet-deployment.md` says Aave V4 is not supported because it is not an ERC-4626 vault. That is true of the Aave V4 Hub, but Aave V4 also ships **Tokenization Spokes**, which are ERC-4626 vaults (audited by ChainSecurity in the Aave V4 repo). So the existing yield contract can use Aave V4 without a new contract.

### The vault on Arc Mainnet
- Aave V4 is live on Arc Mainnet (Core Hub `0x17288dfc86205301064577b98B02b81017e6F79C`).
- Core USDC Tokenization Spoke (from the BGD Labs Aave address book): `0x42EAB64310E1D1c66b4d8aF7C9C4ce253885eB83`.
- Read-only checks I ran on Arc Mainnet:
  - `asset()` returns the official USDC `0x3600000000000000000000000000000000000000`
  - `symbol()` returns `waCoreUSDC`, `decimals()` returns 6
  - `totalAssets()` about 2,430 USDC held through this wrapper
  - `convertToAssets(1000000)` returns 1002481, so one share was worth about 1.0025 USDC
  - `maxDeposit` about 9,997,569 USDC (the deposit cap)

### Why the current contract fits
`VestingStreamV2Yield` only needs `asset`, `deposit`, `previewRedeem`, `previewWithdraw`, `convertToShares` and `redeem`. A Tokenization Spoke provides these. The deploy script also checks that the vault asset is USDC.

### What you would run (yourself)
```
bash scripts/deploy-mainnet.sh raccon-deployer --yield 0x42EAB64310E1D1c66b4d8aF7C9C4ce253885eB83
```
It prints the vault size and share price and asks you to type a risk acknowledgement. It writes `VITE_VESTING_YIELD_ADDRESS_MAINNET`, `VITE_VESTING_YIELD_DEPLOY_TX_MAINNET` and `VITE_VESTING_YIELD_VAULT_MAINNET` to `.env.local`.

### Risks to accept first
- The yield contract has had no independent audit and has only been tested against a mock vault, not Aave V4.
- It is tied to this one vault forever. If Aave pauses or freezes the asset, new yield streams cannot deposit.
- Withdrawals depend on liquidity in the Aave Hub. If most USDC is borrowed, a claim can wait (the contract shows "vault cannot pay out right now").
- Aave V4 contracts are upgradeable and governed by Aave, so the rules can change.
- Yield rates change. A third-party tracker showed roughly 2.4% supply rate for USDC on the Main Spoke; treat that as an example, not a promise.
- Today the app says yield belongs to the payer. Decide whether that is what you want on mainnet.

### Fork test result (read-only, nothing sent to mainnet)
`contracts/test/VestingStreamV2Yield.AaveFork.t.sol` runs the yield contract on a local copy of Arc Mainnet state against the real Aave V4 vault. It needs Arc Foundry (standard Foundry cannot simulate Arc's native USDC):
```
RUN_AAVE_FORK=1 arc-forge test --network arc --match-path "contracts/test/VestingStreamV2Yield.AaveFork.t.sol" -vv
```
7 of 7 tests passed: the vault is accepted, 70% of a stream is deposited, a mid-term claim pulls from Aave, a full-term claim pays everything, cancel returns the whole principal split correctly, stopping yield empties the shares, and the vault value grows over time (700 USDC became about 701.37 USDC after 30 days, roughly 2.4% a year; about 0.46 USDC of yield was paid to the grantor on a 10-day stream). It was not tested: a vault that cannot pay out (low liquidity), an Aave pause or freeze, or very large amounts. It is a simulation, not an audit.

### Safe order
1. (Done) Read-only fork test against the real vault.
2. Get the yield contract audited.
3. Deploy with the command above.
4. Test with a tiny stream: create, claim, stop yield, cancel.
5. Send me the new address and transaction hash. I will update the app labels to name Aave V4 and enable the yield option on mainnet.

## Part 2. Swap on mainnet

### What exists
- Circle App Kit supports Arc Mainnet (chain name `Arc`). On Arc, swap supports only USDC, EURC and cirBTC.
- Swaps work without an API key. Routes run through a provider (LiFi or Circle) that can change by route.
- Provider fee is 2 bps. A custom developer fee is optional.
- Slippage defaults to 3%; a minimum-output (stop limit) option exists.

### What I would add
1. **Mainnet network switch.** Swap page defaults to Arc Mainnet, with Arc Testnet still available. Today it is hard-wired to testnet.
2. **Real-funds safeguards.** Warning that mainnet swaps use real funds, a stronger warning above about 100 USD, and a note that the route is provided by a third party and may vary.
3. **Slippage and minimum output controls**, with a clear "you will receive at least" line.
4. **cirBTC pair** (8 decimals) next to USDC and EURC.
5. **Exact-amount approvals** instead of unlimited approvals.
6. **Swap status and history**, including the explorer link.
7. **Bring funds from other chains** (bridge USDC to Arc, or a cross-chain swap) from the same page.
8. **Optional fee.** You choose whether to charge a developer fee and which address receives it. 10% of a custom fee goes to Arc and 90% to your address. I will not set any fee or recipient without your decision.

### Things I need from you
- Whether to include cirBTC and the cross-chain option.
- Whether to charge a fee, and the recipient address on Arc Mainnet.
- A Circle API key is optional for server traffic; browser swaps run keyless.

### Limits
I cannot execute or test mainnet swaps. I can write the code, run lint, typecheck and a build, and you test with a very small amount first.
