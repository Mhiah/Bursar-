import { getAddress, parseAbiItem, parseEventLogs, type Address, type Hex } from "viem";
import { USDC } from "@/lib/arc";
import { publicClient } from "@/lib/chain";
import { newId, one, q, transaction } from "@/lib/db";
import { logDecision } from "@/lib/decisions";
import { screenPayer, type Screening } from "@/lib/screening";
import { send } from "@/lib/notify";
import { fromUnits } from "@/lib/money";
import type { Business } from "@/lib/session";

const transferEvent = parseAbiItem("event Transfer(address indexed from, address indexed to, uint256 value)");
const CHUNK = 10_000n;
const FIRST_LOOKBACK = 20_000n;
/** How long a payment without an invoice reference waits for the pay page to send one, before the owner is asked. */
const WAIT_FOR_REFERENCE_MS = 10 * 60_000;

type Payment = { id: string; from_address: string; amount: string; tx_hash: string; screening: Screening | null; created_at: string };

/**
 * Two steps, so a restart between them can't lose a payment:
 * 1. Find USDC that arrived in the vault and save each transfer (once, by tx hash and log index).
 * 2. Handle every saved payment that isn't handled yet: screen who sent it, then match it to an
 *    invoice only when that is certain. Anything else goes to the owner.
 */
export async function syncIncoming(b: Business) {
  const found = await discover(b);
  await processPayments(b);
  return found;
}

async function discover(b: Business) {
  const vault = getAddress(b.vault_address!) as Address;
  const latest = await publicClient.getBlockNumber({ cacheTime: 0 });
  let from = b.last_block ? BigInt(b.last_block) + 1n : latest > FIRST_LOOKBACK ? latest - FIRST_LOOKBACK : 0n;
  let found = 0;
  while (from <= latest) {
    const to = from + CHUNK - 1n > latest ? latest : from + CHUNK - 1n;
    const logs = await publicClient.getLogs({ address: USDC, event: transferEvent, args: { to: vault }, fromBlock: from, toBlock: to });
    for (const l of logs) if (await record(b.id, l.transactionHash!, l.logIndex!, getAddress(l.args.from!), l.args.value!, l.blockNumber!)) found++;
    // Only move past these blocks once every transfer in them is saved.
    await q("UPDATE businesses SET last_block = GREATEST(COALESCE(last_block, 0), $1) WHERE id = $2", [to.toString(), b.id]);
    from = to + 1n;
  }
  return found;
}

async function record(businessId: string, txHash: string, logIndex: number, from: Address, amount: bigint, block: bigint) {
  const rows = await q(
    `INSERT INTO payments_in (id, business_id, tx_hash, log_index, from_address, amount, block_number)
     VALUES ($1,$2,$3,$4,$5,$6,$7) ON CONFLICT (tx_hash, log_index) DO NOTHING RETURNING id`,
    [newId(), businessId, txHash, logIndex, from, amount.toString(), block.toString()],
  );
  return rows.length > 0;
}

/** Handle every payment not handled yet, including ones a crash or restart left half done. */
export async function processPayments(b: Business) {
  const todo = await q<{ id: string }>("SELECT id FROM payments_in WHERE business_id = $1 AND processed_at IS NULL ORDER BY block_number, log_index", [b.id]);
  for (const { id } of todo) {
    // Take the payment for a few minutes, so two runs at once never handle it twice.
    const p = await one<Payment>(
      `UPDATE payments_in SET processing_until = now() + interval '5 minutes'
       WHERE id = $1 AND processed_at IS NULL AND (processing_until IS NULL OR processing_until < now())
       RETURNING id, from_address, amount::text, tx_hash, screening, created_at`,
      [id],
    );
    if (!p) continue;
    try {
      if (await handle(b, p)) await q("UPDATE payments_in SET processed_at = now(), processing_until = NULL WHERE id = $1", [p.id]);
      else await q("UPDATE payments_in SET processing_until = NULL WHERE id = $1", [p.id]);
    } catch (e) {
      // Left unhandled: the next run picks it up again.
      await q("UPDATE payments_in SET processing_until = NULL WHERE id = $1", [p.id]);
      console.error("Couldn't handle incoming payment", p.id, e);
    }
  }
  await tellMatches(b.id);
}

/** Returns true when the payment is fully handled, false to look at it again on a later run. */
async function handle(b: Business, p: Payment) {
  const amount = BigInt(p.amount);
  const from = getAddress(p.from_address);
  let s = p.screening;
  if (!s) {
    s = await screenPayer(from);
    await q("UPDATE payments_in SET screening = $1 WHERE id = $2", [JSON.stringify(s), p.id]);
    if (s.status !== "clear") {
      await logDecision(b.id, "screen", `Flagged ${fromUnits(amount)} USDC received from ${from}`, s.reasons.map((r) => r.detail).join(" "), {
        paymentId: p.id,
        screening: s,
      });
    }
  }

  const already = await one<{ request_id: string | null }>("SELECT request_id FROM payments_in WHERE id = $1", [p.id]);
  if (already?.request_id) return true; // matched already (by the owner, or before a restart)
  // The owner topping up their own vault (or test USDC minted in test mode) isn't a customer payment.
  if (p.from_address.toLowerCase() === b.owner_address.toLowerCase() || BigInt(p.from_address) === 0n) return true;

  if (s.status === "blocked") {
    await needsYou(b.id, p, `The wallet that sent it failed the wallet check, so it wasn't matched to any invoice.`);
    return true;
  }

  const pick = await chooseInvoice(b.id, p);
  if (pick.requestId) {
    const res = await matchPayment(b.id, p.id, pick.requestId, pick.reason, { rememberWallet: pick.rememberWallet });
    if (res.ok) return true;
  }
  // No reference yet: the pay page usually sends one within seconds of paying. Give it time.
  if (pick.waitForReference && Date.now() - new Date(p.created_at).getTime() < WAIT_FOR_REFERENCE_MS) return false;
  if (await flagDuplicate(b, p)) return true;
  await needsYou(b.id, p, pick.why);
  return true;
}

type Pick = { requestId?: string; reason: string; rememberWallet: boolean; why: string; waitForReference?: boolean };

/**
 * Which invoice a payment pays, only when that is certain:
 * - the pay page told us which invoice this transaction paid (the invoice reference), or
 * - the wallet is one a customer already paid from, and exactly one of that customer's open invoices is for this amount.
 * An amount alone never decides it: two customers can owe the same amount.
 */
async function chooseInvoice(businessId: string, p: Payment): Promise<Pick> {
  const amount = BigInt(p.amount);
  const claims = await q<{ request_id: string; sender: string; status: string; wallet_address: string | null; invoice_no: string }>(
    `SELECT DISTINCT pc.request_id, pc.sender, r.status, c.wallet_address, r.invoice_no
     FROM pay_claims pc JOIN payment_requests r ON r.id = pc.request_id JOIN customers c ON c.id = r.customer_id
     WHERE pc.tx_hash = $1 AND r.business_id = $2`,
    [p.tx_hash, businessId],
  );
  if (claims.length > 1)
    return { reason: "", rememberWallet: false, why: `The pay pages of more than one invoice (${claims.map((c) => c.invoice_no).join(", ")}) reported this same transaction.` };
  if (claims.length === 1) {
    const c = claims[0];
    const payer = p.from_address.toLowerCase();
    const sender = c.sender.toLowerCase();
    if (c.status !== "open" && c.status !== "part_paid")
      return { reason: "", rememberWallet: false, why: `It was paid from the pay page of invoice ${c.invoice_no}, which is already ${c.status}.` };
    const known = c.wallet_address?.toLowerCase();
    if (known && known !== payer && known !== sender)
      return { reason: "", rememberWallet: false, why: `It was paid from the pay page of invoice ${c.invoice_no}, but from a different wallet than this customer used before.` };
    return {
      requestId: c.request_id,
      reason: `Paid from the pay page of invoice ${c.invoice_no}.`,
      // Remember the wallet only when the customer sent it straight from their wallet (not through a swap).
      rememberWallet: payer === sender,
      why: "",
    };
  }

  type Open = { id: string; invoice_no: string; outstanding: string; next_instalment: string | null; customer_id: string };
  const mine = await q<Open>(
    `SELECT r.id, r.invoice_no, (r.amount - r.paid_amount)::text AS outstanding, (r.instalments->0->>'amount') AS next_instalment, r.customer_id
     FROM payment_requests r JOIN customers c ON c.id = r.customer_id
     WHERE r.business_id = $1 AND r.status IN ('open','part_paid') AND lower(c.wallet_address) = lower($2)`,
    [businessId, p.from_address],
  );
  const fits = mine.filter((r) => BigInt(r.outstanding) === amount || (r.next_instalment != null && BigInt(r.next_instalment) === amount));
  const customers = new Set(mine.map((r) => r.customer_id));
  if (fits.length === 1 && customers.size === 1)
    return { requestId: fits[0].id, reason: `This customer's known wallet paid the exact amount due on invoice ${fits[0].invoice_no}.`, rememberWallet: false, why: "" };
  if (customers.size > 1) return { reason: "", rememberWallet: false, why: "More than one customer has this wallet on file." };
  if (fits.length > 1)
    return { reason: "", rememberWallet: false, why: `It came from a known customer's wallet, and more than one of their invoices is for this amount (${fits.map((r) => r.invoice_no).join(", ")}).` };
  if (mine.length)
    return { reason: "", rememberWallet: false, why: `It came from a known customer's wallet, but the amount doesn't match what's due on their open invoices (${mine.map((r) => r.invoice_no).join(", ")}).` };
  const knownWallet = await one("SELECT 1 FROM customers WHERE business_id = $1 AND lower(wallet_address) = lower($2) LIMIT 1", [businessId, p.from_address]);
  if (knownWallet) return { reason: "", rememberWallet: false, why: "It came from a known customer's wallet, but they have no open invoice." };
  return { reason: "", rememberWallet: false, waitForReference: true, why: "It wasn't paid from an invoice's pay page and the wallet isn't one a customer has paid from before." };
}

/** Tell the owner, once per payment, that a payment needs them to say which invoice it pays. */
async function needsYou(businessId: string, p: Payment, why: string) {
  const amt = fromUnits(p.amount);
  await logDecision(
    businessId,
    "attention",
    `Couldn't tell which invoice ${amt} USDC from ${p.from_address} pays`,
    `${why} The ${amt} USDC is in the vault. Match it to an invoice on the Invoices page, or decide whether to send it back.`,
    { paymentId: p.id, tx: p.tx_hash },
  );
}

/** A payment that matched nothing, from a customer who already paid an invoice of exactly this amount in full: log it for the owner. Nothing is refunded automatically. */
async function flagDuplicate(b: Business, p: Payment) {
  const paid = await q<{ invoice_no: string; customer_id: string }>(
    `SELECT r.invoice_no, r.customer_id FROM payment_requests r JOIN customers c ON c.id = r.customer_id
     WHERE r.business_id = $1 AND r.status = 'paid' AND r.amount = $2 AND lower(c.wallet_address) = lower($3)
     ORDER BY r.paid_at DESC NULLS LAST LIMIT 1`,
    [b.id, p.amount, p.from_address],
  );
  if (!paid.length) return false;
  const stillOwes = await q(
    `SELECT 1 FROM payment_requests WHERE business_id = $1 AND customer_id = $2 AND status IN ('open','part_paid') LIMIT 1`,
    [b.id, paid[0].customer_id],
  );
  if (stillOwes.length) return false;
  const amt = fromUnits(p.amount);
  await logDecision(
    b.id,
    "attention",
    `Possible duplicate: ${amt} USDC from ${p.from_address}, invoice ${paid[0].invoice_no} is already paid`,
    `This customer already paid invoice ${paid[0].invoice_no} in full for the same amount and has nothing else open. The ${amt} USDC is in the vault and not matched to any invoice. Decide whether to send it back or keep it as credit.`,
    { paymentId: p.id, invoice: paid[0].invoice_no },
  );
  return true;
}

type MatchInfo = { requestId: string; invoiceNo: string; customerId: string; amount: string; owed: string; paid: string; reason: string };

/**
 * Record that a received payment settles (part of) an invoice. All of it is saved in one
 * transaction with both rows locked, so a payment counts once and an invoice's total is never
 * half updated. Telling the owner and the customer happens after, and is resumed if it didn't finish.
 */
async function matchPayment(businessId: string, paymentId: string, requestId: string, reason: string, opts: { rememberWallet: boolean }) {
  const res = await transaction(async (t) => {
    const p = await t.one<{ amount: string; from_address: string; request_id: string | null }>(
      "SELECT amount::text, from_address, request_id FROM payments_in WHERE id = $1 AND business_id = $2 FOR UPDATE",
      [paymentId, businessId],
    );
    if (!p) return { ok: false as const, message: "No such payment" };
    if (p.request_id) return { ok: false as const, message: "This payment is already matched" };
    const r = await t.one<{ amount: string; paid_amount: string; invoice_no: string; customer_id: string; status: string }>(
      "SELECT amount::text, paid_amount::text, invoice_no, customer_id, status FROM payment_requests WHERE id = $1 AND business_id = $2 FOR UPDATE",
      [requestId, businessId],
    );
    if (!r) return { ok: false as const, message: "No such request" };
    if (r.status === "paid" || r.status === "cancelled") return { ok: false as const, message: `Request is already ${r.status}` };

    const paid = BigInt(r.paid_amount) + BigInt(p.amount);
    const done = paid >= BigInt(r.amount);
    const info: MatchInfo = { requestId, invoiceNo: r.invoice_no, customerId: r.customer_id, amount: p.amount, owed: r.amount, paid: paid.toString(), reason };
    const claimed = await t.q(
      "UPDATE payments_in SET request_id = $1, match_info = $2, match_told_at = NULL, processed_at = COALESCE(processed_at, now()) WHERE id = $3 AND request_id IS NULL RETURNING id",
      [requestId, JSON.stringify(info), paymentId],
    );
    if (!claimed.length) return { ok: false as const, message: "This payment is already matched" };
    await t.q(
      `UPDATE payment_requests SET paid_amount = paid_amount + $1, status = $2, paid_at = CASE WHEN $3 THEN now() ELSE paid_at END,
         instalments = CASE WHEN instalments IS NULL OR $3 THEN instalments ELSE (instalments - 0) END
       WHERE id = $4`,
      [p.amount, done ? "paid" : "part_paid", done, requestId],
    );
    // Remember the customer's wallet so later payments from it match.
    if (opts.rememberWallet)
      await t.q("UPDATE customers SET wallet_address = COALESCE(wallet_address, $1) WHERE id = $2", [p.from_address, r.customer_id]);
    return { ok: true as const, message: done ? "Matched; invoice paid in full" : `Matched; ${fromUnits(BigInt(r.amount) - paid)} USDC still due` };
  });
  if (res.ok) await tellMatches(businessId);
  return res;
}

/** Log each new match and email the customer, once. Picks up matches a restart left untold. */
async function tellMatches(businessId: string) {
  const rows = await q<{ id: string; match_info: MatchInfo }>(
    "SELECT id, match_info FROM payments_in WHERE business_id = $1 AND request_id IS NOT NULL AND match_told_at IS NULL AND match_info IS NOT NULL ORDER BY created_at",
    [businessId],
  );
  for (const row of rows) {
    // Claim it first, so the customer gets one email even if two runs overlap.
    if (!(await one("UPDATE payments_in SET match_told_at = now() WHERE id = $1 AND match_told_at IS NULL RETURNING id", [row.id]))) continue;
    const m = row.match_info;
    const owed = BigInt(m.owed);
    const paid = BigInt(m.paid);
    const done = paid >= owed;
    await logDecision(businessId, "match", `Matched ${fromUnits(m.amount)} USDC to invoice ${m.invoiceNo}${done ? " (now paid in full)" : ""}`, m.reason, {
      paymentId: row.id,
      requestId: m.requestId,
    });
    if (paid > owed) {
      const extra = fromUnits(paid - owed);
      await logDecision(
        businessId,
        "attention",
        `Invoice ${m.invoiceNo} was overpaid by ${extra} USDC`,
        `The customer sent more than they owed. Decide whether to send the ${extra} USDC back or keep it as credit for their next invoice.`,
        { paymentId: row.id, requestId: m.requestId, extra },
      );
    }
    const receipt = await sendReceipt(businessId, m.customerId, m.invoiceNo, m.amount, done ? 0n : owed - paid);
    await logDecision(businessId, "note", `Payment received email for invoice ${m.invoiceNo}: ${receipt}`, "The customer is told as soon as their payment is matched.", {
      requestId: m.requestId,
    });
  }
}

/**
 * Match a payment to an invoice by hand (the owner) or by the agent.
 * The agent may only match a payment from the invoice's customer's known wallet, or one the
 * pay page reported for that invoice; anything less certain stays with the owner.
 */
export async function applyPayment(businessId: string, paymentId: string, requestId: string, reason: string, by: "owner" | "agent" = "agent") {
  if (by === "agent") {
    const ok = await one(
      `SELECT 1 FROM payments_in p, payment_requests r JOIN customers c ON c.id = r.customer_id
       WHERE p.id = $1 AND r.id = $2 AND p.business_id = $3 AND r.business_id = $3
         AND (lower(c.wallet_address) = lower(p.from_address) OR EXISTS (SELECT 1 FROM pay_claims pc WHERE pc.tx_hash = p.tx_hash AND pc.request_id = r.id))`,
      [paymentId, requestId, businessId],
    );
    if (!ok) return "Not matched: this payment didn't come from this customer's known wallet or this invoice's pay page. Leave it for the owner.";
  }
  const res = await matchPayment(businessId, paymentId, requestId, reason, { rememberWallet: by === "owner" });
  return res.message;
}

/**
 * The pay page reports the transaction it just sent for an invoice. Only a transaction that really
 * moved USDC into this business's vault is kept; it becomes that payment's invoice reference.
 */
export async function claimPayment(requestId: string, txHash: Hex) {
  const r = await one<{ business_id: string }>("SELECT business_id FROM payment_requests WHERE id = $1", [requestId]);
  if (!r) return { ok: false, error: "This payment link isn't valid." };
  const b = await one<Business>("SELECT * FROM businesses WHERE id = $1", [r.business_id]);
  if (!b?.vault_address) return { ok: false, error: "This business has no vault yet." };
  const receipt = await publicClient.getTransactionReceipt({ hash: txHash }).catch(() => null);
  if (!receipt || receipt.status !== "success") return { ok: false, error: "Transaction not found yet." };
  const vault = getAddress(b.vault_address);
  const transfers = parseEventLogs({ abi: [transferEvent], logs: receipt.logs }).filter(
    (l) => l.address.toLowerCase() === USDC.toLowerCase() && getAddress(l.args.to) === vault,
  );
  if (!transfers.length) return { ok: false, error: "That transaction didn't pay this invoice's business." };
  await q("INSERT INTO pay_claims (tx_hash, request_id, sender) VALUES ($1,$2,$3) ON CONFLICT DO NOTHING", [receipt.transactionHash, requestId, getAddress(receipt.from)]);
  for (const l of transfers) await record(b.id, receipt.transactionHash, l.logIndex, getAddress(l.args.from), l.args.value, receipt.blockNumber);
  // If it was already handled without a reference (and handed to the owner), look at it again now there is one.
  await q("UPDATE payments_in SET processed_at = NULL WHERE business_id = $1 AND tx_hash = $2 AND request_id IS NULL", [b.id, receipt.transactionHash]);
  await processPayments(b);
  return { ok: true };
}

/** Email the customer that their payment arrived. Never throws: a failed email must not undo the match. */
async function sendReceipt(businessId: string, customerId: string, invoiceNo: string, amount: string, stillDue: bigint) {
  try {
    const b = await one<{ name: string }>("SELECT name FROM businesses WHERE id = $1", [businessId]);
    const c = await one<{ name: string; email: string | null }>("SELECT name, email FROM customers WHERE id = $1", [customerId]);
    if (!b || !c) return "skipped";
    const tail = stillDue > 0n ? `${fromUnits(stillDue)} USDC is still due on this invoice.` : "This invoice is now paid in full. Nothing more to do.";
    const res = await send(
      "email",
      { email: c.email, telegram_chat_id: null, whatsapp: null },
      `Payment received: invoice ${invoiceNo}`,
      `Hi ${c.name},\n\nThank you. ${b.name} received your payment of ${fromUnits(amount)} USDC for invoice ${invoiceNo}.\n${tail}\n\n${b.name}`,
    );
    return res.status + (res.error ? ` (${res.error})` : "");
  } catch (e) {
    return `failed (${e instanceof Error ? e.message : String(e)})`;
  }
}
