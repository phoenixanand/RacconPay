# RacconPay: Continuity Track pitch (3 minutes)

I could not read the official track rules, only the prize card you shared, so check the exact definition of "at least 2 conditions" on the ETHGlobal page. Everything below is based on what is in this repo and what I verified onchain.

## 1. The problem you are solving

Small teams, freelancers and finance teams that pay people in stablecoins do it with a patchwork of tools:
- one tool to send many payments, another to vest or stream salary, another for invoices, another for escrow, another to split bills;
- no HR-grade controls on pay streams (leave, pauses, approvals, bulk upload, reports);
- locked funds sit idle and earn nothing;
- on most chains, gas is a second token with a volatile price, which is a bad fit for payments.

RacconPay puts these money tools in one non-custodial app on Arc, where USDC is the gas token and fees are predictable.

## 2. Existing products (and the gap)

Use these as examples, and say them generally, without attacking anyone:
- Batch sending: tools like Disperse or multisig batch apps. Send only; no receipts or approvals.
- Vesting and streaming: Sablier, Hedgey and similar. Strong on streams, thin on HR workflows such as leave, pauses and finance reports.
- Invoicing: crypto invoice tools. Separate from payouts and escrow.
- Escrow: marketplace escrow or ad-hoc multisigs. Not milestone-based with an arbiter in the same app.

The gap: no single stablecoin-native suite with USDC and EURC, milestone escrow, controlled vesting and optional yield together.

## 3. Do you meet "at least 2 conditions"?

Mapped to the five bullets on the prize card. Be honest about the partial ones.

| Prize bullet | Status | Evidence in the repo |
|---|---|---|
| USDC or EURC payment flows added to an existing commerce, fintech or wallet product | Met (strongest) | Invoices in USDC or EURC, Batch Payout with soul-bound receipts, Escrow in USDC and EURC, Swap, Vesting |
| Stablecoin settlement or escrow logic added to an existing DeFi protocol or marketplace | Mostly met | New Milestone Escrow (USDC or EURC, arbiter, disputes, refunds) on Arc Mainnet, plus opt-in yield through Aave V4. Caveat: RacconPay is a payments app, not a marketplace |
| Arc-powered treasury or FX features in a live multi-chain product | Partly | Treasury: vesting, yield, batch payouts. FX: USDC, EURC and cirBTC swap through Circle App Kit. Caveat: the product runs on Arc, not several chains |
| Crosschain transfers or unified balance in a production project | Not met | No bridge or unified balance yet |
| Nanopayments for an AI agent or API tool | Not met | Not built |

Verdict: you can credibly claim two (payment flows, and escrow plus Aave-based yield). Claim the third only as "treasury and FX features" and do not call it multi-chain.

You must also be able to say what existed before the hackathon and what is new. I can see the repo started with Batch Payout, Receipt NFT, Vesting, Bill Splitter, MultiSig and Invoices on Arc Mainnet. New work in this project: Vesting console V2 (leave and pauses, bulk CSV, address book, reports), opt-in yield, Milestone Escrow, Swap for USDC, EURC and cirBTC, and the mainnet deployments of V2, Yield and Escrow. Confirm this matches your own history before you say it.

## 4. What is built and verified (safe to say)

- Deployed on Arc Mainnet and checked onchain: VestingStreamV2, VestingStreamV2Yield (vault is the Aave V4 Core USDC vault) and MilestoneEscrow (USDC and EURC).
- Unit and fuzz tests: 705 of 708 pass. The 3 failures are in an escrow V2 variant the app does not use.
- Simulation: the yield contract passed 7 of 7 tests against the real Aave V4 vault on a local fork of mainnet.
- Swap uses Circle App Kit on Arc for USDC, EURC and cirBTC only.

Say plainly: the contracts are not independently audited, so use small amounts. Judges respect that.

## 5. The 3-minute script (about 420 words)

Speak at a normal pace, around 140 words a minute. Times are guides.

**0:00 to 0:20. Problem (about 55 words)**
"Paying people in stablecoins is still messy. Teams use one tool to send batch payments, another to stream salary, another for invoices, another for escrow. Locked money earns nothing, and gas is a separate token with a changing price. I built RacconPay to put all of this in one non-custodial app on Arc."

**0:20 to 0:45. Existing products and the gap (about 60 words)**
"Today there are good single-purpose tools: batch senders, vesting and streaming protocols, invoice apps, escrow services. But a finance team has to stitch them together, and most lack controls like leave and pauses, approvals, bulk upload and reports. Nothing combines payments, vesting, escrow and yield in one stablecoin-native app."

**0:45 to 1:05. Before and now (about 55 words)**
"RacconPay already existed on Arc Mainnet with batch payouts and receipts, vesting, bill splitting, multisig and invoices. For this hackathon I used Arc Studio to extend it. I added a vesting console, milestone escrow, opt-in yield, and a swap, and I deployed the new contracts to mainnet."

**1:05 to 2:20. Demo (about 150 words, show the screen)**
1. Vesting console (20s): "A finance team uploads payees from a CSV, creates streams in USDC, and sees pay and receive views, an inbox for approvals, and a CSV report. Staff can request leave, and the end date moves back by the same time, so no pay is lost."
2. Yield (15s): "On a stream, I can switch on yield. Seventy percent goes into the Aave V4 USDC vault on Arc, and thirty percent stays so claims are always paid. The payee is paid first."
3. Escrow (20s): "For contractors, milestone escrow locks USDC or EURC. Each milestone is released on approval, with an optional arbiter for disputes."
4. Swap (10s): "A built-in swap lets users move between USDC, EURC and cirBTC with Circle App Kit, with a quote and minimum received shown first."
5. Explorer (10s): show the deployed contract addresses on the Arc explorer.

**2:20 to 2:45. Why Arc (about 55 words)**
"Arc makes this practical: USDC is the gas token, so fees are predictable, and finality is under a second, so payroll and escrow feel instant. EURC support means teams can pay in dollars or euros."

**2:45 to 3:00. Honest status and next steps (about 40 words)**
"The contracts are tested, including a fork simulation against the real Aave vault, but not yet audited, so amounts are kept small. Next: an audit, crosschain funding with Circle's bridge and unified balance, and more regions. Thank you."

## 6. Recording tips

- Use small mainnet amounts (for example 0.01 USDC) or testnet for any live transaction, and say which network you are on.
- Never show your keystore password, private key or `.env`.
- Open the Arc explorer for the VestingStreamV2, Yield and Escrow addresses so judges can see they are real.
- Keep one tab per feature already open so you do not waste time loading.
- Do not claim crosschain, nanopayments, an audit, or "multi-chain" unless you build or obtain them.

## 7. One-sentence version

"RacconPay is a non-custodial stablecoin suite on Arc that lets teams pay, vest, escrow and earn yield on USDC and EURC in one place."
