# MilestoneEscrow design note

Arc Testnet only. Not audited for mainnet.

## Goal
A payer locks USDC or EURC for a payee against a list of milestones. Each milestone releases to the payee when the payer approves it, when the payer stays silent after the payee submits, or when an arbiter rules on a dispute.

## Actors
- **Payer**: funds the escrow, approves or disputes milestones.
- **Payee**: submits milestones, collects released funds.
- **Arbiter** (optional): resolves disputes. Zero address means no disputes are possible; the payer can only approve or stay silent.
- Payer, payee and arbiter must be three different addresses (arbiter may be zero).
- No owner, no admin, no upgrade path, no pause. Token allowlist (USDC, EURC) is fixed at deploy.

## Storage
- `Escrow { payer, payee, arbiter, token, reviewWindow, deadline, memo, milestoneCount, cancelled flags }`
- `Milestone { amount, status, submittedAt, disputedAt, evidenceHash }`
- Milestone status: `Funded -> Submitted -> Released | Disputed -> Resolved`, or `Funded -> Refunded`.

## Flow
1. `createEscrow` pulls the full total from the payer in one transfer. 1 to 20 milestones, no zero amounts, reviewWindow between 1 day and 90 days, deadline in the future.
2. Payee calls `submitMilestone` (Funded -> Submitted, starts review window).
3. Payer calls `approveMilestone` (Submitted -> Released, pays payee).
4. If payer is silent past the window, payee calls `claimAfterWindow`.
5. Payer may call `dispute` inside the window (Submitted -> Disputed). Arbiter calls `resolve(payeeAmount)`: payee gets `payeeAmount`, payer gets the remainder.
6. If the arbiter is silent for 30 days after the dispute, anyone calls `resolveByTimeout`: 50/50 split.
7. If the payee never submits a milestone and the escrow deadline has passed, payer calls `refundUnstarted`.
8. `cancelByAgreement`: both payer and payee confirm; unreleased Funded milestones refund to the payer. Submitted or Disputed milestones are excluded.

## Security table
| Risk | Mitigation |
|---|---|
| Reentrancy via token hooks | ReentrancyGuard; state updated before every transfer |
| Funds locked forever | Every non-terminal state has a time-based exit (claimAfterWindow, resolveByTimeout, refundUnstarted) |
| Arbiter collusion | Arbiter is chosen by the payer at creation and visible to the payee before work starts; payee can refuse the job |
| Payer griefing by never approving | Payee claims after the review window |
| Payee griefing by never submitting | Payer refunds after the deadline |
| Fee-on-transfer / rebasing tokens | Only allowlisted USDC and EURC; received amount is checked against the requested total |
| Arbiter over-allocating | `payeeAmount <= milestone amount` enforced |
| Blocklisted recipient blocks dispute split | Both resolution paths finalize without token transfers and credit each party independently; `withdraw(token)` clears only the caller's credit before safe transfer, reverting with `NoCredit` if zero and emitting `Withdrawn` on success. A failed withdrawal restores that credit without blocking the other party. `creditOf(account, token)` exposes awards; per token, accounted custody equals `unallocated` outstanding milestone amounts plus all credits (unsolicited transfers are surplus). Non-dispute payouts remain direct. |
| Blocklisted recipient prevents release or refund | `_payOrCredit` attempts direct payment on approval, window claims, unstarted refunds and cancellation refunds; a revert or false return records `credits[account][token]` and emits `PayoutDeferred`, without reverting finalization. Status and `unallocated` updates precede the call. Existing release/refund events remain; `withdraw(token)` retries credits later, subject to token restrictions. For trusted allowlisted tokens that do not move funds on failure, token balance >= outstanding milestone amounts + outstanding credits. Non-dispute payouts are direct on success, credited otherwise. |
| Same address in multiple roles | Rejected at creation |

## V2 (MilestoneEscrowV2): evidence, titles and request-changes

V1 is deployed and immutable, so V2 is a separate contract at a new address. V1 escrows keep working from the V1 contract. V2 keeps every V1 rule above and adds the following.

- **Milestone titles.** `createEscrow` takes one title per milestone (at most 64 bytes each, may be empty). Titles are stored and returned by `getMilestone`.
- **Readable evidence.** `submitMilestone(id, i, note)` stores a note or link (at most 280 bytes) instead of a hash. It is returned by `getMilestone` and emitted in `MilestoneSubmitted`. Allowed from `Funded` or `ChangesRequested`.
- **Request changes.** New status `ChangesRequested` (appended to the status list). `requestChanges(id, i, reason)`: payer only, milestone `Submitted`, strictly before the review window ends, non-empty reason of at most 280 bytes, at most 3 times per milestone (`MAX_REVISIONS = 3`, then the payer can only approve, dispute or let the window run). It stores the reason and the time, increments the revision counter and moves the milestone to `ChangesRequested`.
- **After a request.** The payee either resubmits (`submitMilestone`, restarts the review window) or calls `escalate(id, i)`, which moves the milestone to `Disputed` (needs an arbiter, otherwise `ArbiterAbsent`) and starts the arbiter timeout.
- **Refund of a milestone waiting on changes.** `refundUnstarted` also accepts `ChangesRequested`, but only strictly after `max(deadline, changesRequestedAt) + reviewWindow`, so the payee always has a full review window to respond and a payer cannot stall a milestone to the deadline and refund it.
- **Custody.** `ChangesRequested` milestones count as outstanding in `unallocated`. `cancelByAgreement` refunds `Funded` milestones only and leaves `ChangesRequested` untouched, like `Submitted` and `Disputed`.
- **Everything else is unchanged:** approve, claim after window, dispute, resolve, 30-day timeout split, credit fallback, withdraw, views.

| V2 risk | Mitigation |
|---|---|
| Payer sends work back repeatedly to stall | At most 3 requests per milestone; payee can escalate to the arbiter at any time after a request |
| Payer requests changes, waits out the deadline and refunds | Refund of a `ChangesRequested` milestone needs `max(deadline, changesRequestedAt) + reviewWindow` to pass; payee can resubmit or escalate first |
| Oversized notes or titles | 280 byte note/reason cap and 64 byte title cap, checked on write |
| Hostile text in notes | Stored as plain text only; the UI renders it as text and makes only https links clickable |

## Failure cases to test
Zero amounts, mismatched totals, over 20 milestones, wrong caller for each action, wrong status for each action, double release, window boundaries (exact second), arbiter absent, 30-day timeout boundary, refund before deadline, partial cancel, fuzz on milestone amounts and resolve splits, invariant: contract token balance equals the sum of amounts of milestones that are not Released, Resolved or Refunded.
