# Who enforces what

Bursar's claim is that **the vault, not the model and not the website, is the guard**. That is true for the money rules below. It is not true for everything the product does, and this page says which is which.

Everything here is read from the code: `contracts/contracts/BursarVault.sol`, `app/src/agent/tools.ts`, `app/src/lib/bills.ts`, `app/src/lib/screening.ts` and `app/src/lib/owner-tx.ts`. The vault rules are exercised by `contracts/test/BursarVault.test.js` (23 tests) and by `npm run demo` in `contracts/`, which walks the whole story and asserts every outcome.

## Enforced by the vault contract (onchain)

| Guarantee | Contract check | Notes |
| --- | --- | --- |
| The agent can't pay more than the per-payment limit | `agentPay` reverts `OverPaymentLimit` | The limit is `maxPerPayment`, set by the owner. |
| The agent can only pay wallets the owner approved | `agentPay` reverts `PayeeNotApproved` | Only the owner can call `setPayee`. |
| The agent can't spend past a category's monthly budget | `OverBudget` | 30-day periods. A category with no budget is closed. |
| The agent can't dip below the cash floor | `BelowCashFloor` | The floor applies to operating cash (balance minus reserve). |
| The agent can't spend the reserve | `agentPay` only spends operating cash | `moveToReserve` can only add to the reserve. Only the owner can release it. |
| A bill reference is paid once | `AlreadyPaid` | See "What the vault does not know" below. |
| An approval is one exact payment, used once | `approve(id)` pays the stored `(to, amount, category, ref)`; a second try reverts `NotOpen` | The owner can't edit the request, only approve or reject it. |
| An approval doesn't change the rules | `approve` never touches `maxPerPayment`, `cashFloor`, budgets or payees | The approved amount still counts toward the budget. |
| Only the owner can change rules, payees, agent, pause, reserve release, or withdraw | `onlyOwner` | The agent has no path to any of these. |
| The owner can stop the agent at any time | `setPaused(true)` makes every agent call revert `IsPaused`; `setAgent` replaces the key | |
| The owner can always withdraw | `withdraw`, reserve included | |

**One thing the owner's approval does override:** a payment the owner approves may exceed the per-payment limit, the budget and the cash floor, and may draw on the reserve. That is deliberate, since it is the owner's decision. It is still recorded against the budget.

## Enforced by the Bursar server (offchain, not by the contract)

| What | Where | What the contract does instead |
| --- | --- | --- |
| Wallet screening: US Treasury (OFAC) list, Circle's USDC blocklist, lookalike addresses, recent wallet changes | `pay_bill` checks it before sending, and every wallet is re-checked daily | Nothing. The contract only knows "approved payee or not". |
| Duplicate and mismatch detection: same invoice number, same amount from the same supplier within 3 weeks | `bills.ts` flags; flagged bills go to `request_approval` | It refuses only the **same reference**. The reference is built from the business, the supplier and the normalised invoice number, so the same invoice can't be paid twice, but a resend under a different invoice number is caught by the server flag, not the vault. |
| Matching incoming USDC to invoices | `incoming.ts` reads real `Transfer` events into the vault | Nothing. Matching is bookkeeping. |
| Reminders (at most 3), instalment offers, "Payment received" emails | `tools.ts` | Nothing. |
| The books (customers, invoices, bills) | SQL | Nothing. |
| What the AI decides | the model | The model's answer is an input, never the release condition. Each tool re-checks in code, and then the vault checks. |

## The decision log

Each log entry is hashed with the one before it (keccak256) and the agent writes the latest hash to the vault with `recordDecision`, which emits a `Decision` event. This makes edits to past SQL entries **detectable**. It does not make the log **trustless**: the contract stores nothing about the hash and does not check it, so the agent key can anchor any value.

## What the owner signs

Owner actions (approvals, payee changes, rule changes, pause, withdrawal) are `onlyOwner` calls, so they only work when signed by the owner's wallet. In the app the owner signs them from their own browser wallet (`ownerCall` in `owner-tx.ts`). Per the README, a site-made wallet keeps its key encrypted in the owner's browser and shows a Confirm box before each signature.

## If something is compromised

**The agent key** (a Circle Agent Wallet, shared by every business's vault):
- *Can:* pay approved wallets up to the per-payment limit, inside the budgets and above the cash floor, in every vault that uses it; move cash into the reserve; file approval requests (there is no cap on how many); anchor arbitrary hashes.
- *Can't:* pay an unapproved wallet, exceed a limit, spend a reserve, change any rule, or withdraw. The owner can pause it or replace it in one transaction.

**The Bursar server:**
- *Can:* act as the agent key (bounded as above), stop working, read the books, edit SQL records (an edit breaks the hash chain against the onchain anchors).
- *Can't:* approve its own requests, change a vault's rules, approve a payee, or move money out of a vault.

**The website the customer sees:**
- *Can:* show a customer the wrong vault address on a pay link. Customers pay by sending USDC to the address shown, and nothing onchain stops a customer paying the wrong address. This is the weakest link for incoming money, and customers should check the vault address against one the owner gave them.

## What the vault does not know

- It does not know whether an invoice is real, or whether a supplier is who they say they are. The owner decides who is approved.
- It enforces one payment per reference, not one payment per real-world invoice.
- It does not screen wallets. Sanctions and blocklist checks happen on the server before the agent pays; the contract's only equivalent is the approved-payee list.
