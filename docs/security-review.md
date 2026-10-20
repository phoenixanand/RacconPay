# RacconPay — Security Review
**Date:** 2026-10-16  
**Scope:** BatchPayout, ReceiptNFT, VestingStream, BillSplitter, MultiSigPayout (Arc Mainnet, chain ID 5042)  
**Severity tier:** Balanced  

---

## Summary

| Severity | Count |
|---|---|
| High | 3 |
| Medium | 0 |
| Low | 0 |

All three findings touch **BillSplitter** or **BatchPayout**. VestingStream, ReceiptNFT, and MultiSigPayout returned clean.

---

## Findings

---

### H-1 · BillSplitter — Unbounded expense loop can permanently brick settlement

**Severity:** High  
**Contract:** `BillSplitter.sol` — `addExpense`, `settle`, `_computeBalances`

**Description:**  
`addExpense` lets any member append expenses without a cap. `settle` calls `_computeBalances`, which iterates over every member × every expense to compute balances, then performs per-creditor storage writes. Gas cost grows quadratically with expense count. A bill with enough expenses will exceed the block gas limit, making `settle` permanently unreachable — no debtor can ever pay and no creditor can ever withdraw.

**Recommendation:**  
Pick one or combine:
1. Hard-cap `expenses.length` per bill (e.g. 50 max).
2. Maintain incremental running totals per member during `addExpense` so `settle` is O(members) not O(members × expenses).
3. Move `_computeBalances` off-chain: pass pre-computed balances as calldata and verify the hash against stored expense data.

---

### H-2 · BillSplitter — Any member can fabricate expenses and extract USDC from others

**Severity:** High  
**Contract:** `BillSplitter.sol` — `addExpense`, `settle`

**Description:**  
`addExpense` accepts an arbitrary amount from any member with no proof of payment. `settle` converts those expense records directly into USDC transfers: a malicious member can add fabricated large expenses, get settled as a "creditor," and withdraw real funds they never spent.

**Context:** The original design is intentionally "Splitwise-style" (social trust, no on-chain proof). This is a known, accepted trade-off for the current version. This finding is recorded so future versions can address it if real-money adversarial use cases are targeted.

**Recommendation:**  
For adversarial-resistant operation: require per-expense approval from all members, or move to an escrow/deposit model where funds must be deposited before redistribution. For the current social-trust model: add prominent UI warnings that the contract requires member trust.

---

### H-3 · BatchPayout / MultiSigPayout — Push-payout loop can be bricked by one bad recipient

**Severity:** High  
**Contract:** `BatchPayout.sol` — `batchPay`; also reachable via `MultiSigPayout.sol` — `execute`

**Description:**  
Payouts are pushed in-loop to caller-supplied addresses. On Arc, a transfer to a blocked, precompile, or otherwise non-payable address reverts. Because the batch is all-or-nothing, a single bad recipient address reverts the entire batch — all other valid recipients are blocked too. A proposer or batch creator could accidentally (or deliberately) include such an address.

**Recommendation:**  
Two practical fixes:
1. **Pull pattern:** credit each recipient's balance in storage; recipients withdraw individually. This is the safest approach.
2. **Continue-on-failure:** wrap each transfer in a try/catch, emit a `PaymentFailed(address, uint256)` event for skipped recipients, and let the rest succeed. The proposer/creator can then retry failed recipients.

---

## Contracts with no findings

| Contract | Result |
|---|---|
| ReceiptNFT.sol | Clean |
| VestingStream.sol | Clean |
| MultiSigPayout.sol | Clean (H-3 is in BatchPayout, reachable via MultiSig's `execute` path) |

---

## Risk Assessment

| Finding | Exploitable today? | Likelihood | Impact |
|---|---|---|---|
| H-1 Expense loop DoS | Yes — if a bill accumulates many expenses | Low (requires many `addExpense` calls) | High (permanent fund lock) |
| H-2 Fabricated expenses | Yes — any member can do it | Medium (requires malicious member) | High (USDC theft) |
| H-3 Push-payout brick | Yes — one bad address in a batch | Low (user controls recipient list) | Medium (payout delay, not fund loss) |

---

## Recommended Actions (priority order)

1. **Fix H-1** — add an `expenses.length` cap in `addExpense` (simplest fix, one line). This prevents the permanent lock scenario with zero trade-offs.
2. **Acknowledge H-2** — add a UI warning on BillSplitter that all members must be trusted. Consider per-expense member approval for a v3.
3. **Fix H-3** — add continue-on-failure to `batchPay` with a `PaymentFailed` event, or migrate to pull-claim. The MultiSig `execute` path inherits the same fix automatically.
