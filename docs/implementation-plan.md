Let me do a thorough read of the full codebase before answering. Good. I've seen enough of every file. Here is my thorough, honest assessment:

---

**Things that can still be improved — ranked by impact:**

---

**HIGH IMPACT — users will hit these immediately:**

**1. BatchPayout — no duplicate address check**
If you accidentally paste the same address twice in the CSV, the contract pays that person twice. A client-side duplicate address warning before the approve step would catch this. One-line `Set` check.

**2. Vesting — no start date option**
All streams start immediately on creation. A "Delayed start" option (e.g. start vesting in 30 days) would be very useful for cliffs, probation periods, or future-dated contracts. The contract already supports `startTime` as a parameter — the frontend just always passes `block.timestamp`. This is a pure frontend change.

**3. BillSplitter — no way to add more expenses after creation**
Once a bill is created, the only way to add more expenses is through the `AddExpensePanel` inside the existing BillCard. But new users have no idea this exists — there's no obvious "Add expense" button on the finalized/open bill. The UI should surface this more clearly.

**4. Invoice — no reminder / resend**
Once an invoice is created and sent, there's no way to send a follow-up. A "Copy reminder message" button that generates a pre-written message with the payment link ("Hi, just a reminder that invoice INV-0003 for 50 USDC is due on Oct 25...") would save time and is purely frontend.

**5. Dashboard — USDC balance doesn't auto-refresh**
The USDC balance on the Overview tab only loads once on mount. If you just received a payment, you have to refresh the page to see the updated balance. A "Refresh" button or auto-poll every 30 seconds would fix this.

---

**MEDIUM IMPACT — polish that matters:**

**6. BatchPayout — saved recipient lists**
Power users pay the same team every month. There's no way to save a recipient list and reload it next time. A "Save this list" button that stores the CSV rows in localStorage and a "Load saved list" dropdown would be very useful.

**7. MultiSig — no description field visible on proposal cards**
The `description` field is stored on-chain but never shown in the proposal card UI. It's useful for the co-signers to know *why* this payment is being requested before approving.

**8. Vesting — no claimable amount shown before claiming**
The "Claim" button shows but doesn't tell the beneficiary how much they can currently claim. Showing "You can claim X.XX USDC now" next to the Claim button would make the action feel more meaningful.

**9. BillSplitter — no expense edit/delete**
Once an expense is added, there's no way to correct a typo or wrong amount before finalization. An "edit" pencil icon on each expense in the unexpanded view would be valuable. This requires a new `editExpense()` function — a contract change.

**10. Invoice — client name field**
Invoices show the payee wallet address but not a client name. Adding a free-text "Client name" field (stored in localStorage alongside the invoice) would make the invoice list and PDF much clearer — "Paid by John Smith" vs "Paid by 0x1234...".

---

**LOW IMPACT — nice to have:**

**11. Docs page — no search**
The docs have 8 sections with lots of text. A simple client-side text search (filter sections by keyword) would help users find answers faster.

**12. Transaction history page**
A unified chronological feed of everything that happened — batches sent, streams created, bills settled, proposals executed — pulled from on-chain event logs. No contract change needed, just event log queries via `publicClient.getLogs`.

**13. ENS / address nickname display**
Instead of showing `0x1234...abcd` everywhere, resolve ENS names where available and show them. Low-cost improvement since Arc is EVM-compatible and wagmi has `useEnsName`.

**14. Dark mode memory doesn't follow system preference on first load**
If no theme is saved in localStorage and the user's OS is in dark mode, the app loads in light mode first. Should read `prefers-color-scheme: dark` as the default instead of always starting in light mode.

---

**My top 5 to build right now:**
1 (duplicate address check), 2 (delayed vesting start), 5 (balance auto-refresh), 7 (description on proposal cards), 10 (client name on invoices).

All five are pure frontend, no contract changes, fast to build. Want me to do them now?

Good questions from real users. Let me read the contract before answering. Now I have the full picture. Here are the honest, accurate answers to all three questions — and what can be improved:

---

**Q1 — Did you cap array lengths per tx to prevent gas limit edge cases?**

**Answer:** Yes — hard cap of 100 recipients enforced on-chain at line 52 (`if (count > 100) revert TooManyRecipients(count)`). This is not a soft UI limit — it's a contract-level revert. The frontend also validates this before the approve step.

**What we could still improve:** The 100-recipient cap was chosen conservatively but hasn't been benchmarked against Arc's actual block gas limit. A proper gas benchmark (`forge test --gas-report` on a 100-recipient batch) would tell us the exact headroom. We could also lower the cap to 50 and add a "split into chunks" feature in the frontend for very large payrolls — but for the current use case 100 is sufficient.

---

**Q2 — Are you enforcing iteration caps or chunking to stay clear of block gas limits during network spikes?**

**Answer:** The 100-recipient cap handles this. Each iteration does one `try/catch` ERC-20 transfer — roughly 25,000-30,000 gas per recipient worst case on Arc. 100 recipients × 30,000 = ~3M gas, well within Arc's block gas limit. Arc's sub-second finality also means network spikes don't cause the gas price volatility that makes this dangerous on Ethereum mainnet — USDC as native gas means fees are stable and predictable regardless of congestion.

**What we could still improve:** Add a chunking UI for batches over 100 — split a 250-row CSV into 3 separate transactions automatically with a progress indicator. No contract change needed, pure frontend logic.

---

**Q3 — If one recipient is on the USDC blocklist, does the whole batch revert?**

**Answer:** No — this was an explicit security fix (we called it H-3). Each transfer is wrapped in a `try/catch` at line 80. If any single recipient fails — blocklisted address, contract that rejects transfers, zero balance issues — that transfer is skipped, the amount is accumulated in a `refund` variable, and the payer gets it back at the end. A `PaymentFailed` event is emitted for each skipped recipient so you can see exactly who didn't receive their payment. The receipt NFT records only the successful transfers.

**The pre-check suggestion is valid though.** The USDC contract on Arc has a public `isBlacklisted(address)` function. We can add a client-side pre-check in the frontend that reads blocklist status for all recipients before showing the approve button — flagging any blocked addresses in the table with a red warning so the user can remove them before paying. This saves gas and avoids the confusion of a "batch succeeded but 2 recipients failed" situation.

---

**Want me to build that pre-check now?** It's a pure frontend change — one `useReadContracts` call checking `isBlacklisted(addr)` for each recipient in the table, showing a red warning badge on any blocked address, and blocking the approve button until they're removed.
