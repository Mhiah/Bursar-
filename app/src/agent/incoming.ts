import { getAddress, parseAbiItem, type Address } from "viem";
import { USDC } from "@/lib/arc";
import { publicClient } from "@/lib/chain";
import { newId, one, q } from "@/lib/db";
import { logDecision } from "@/lib/decisions";
import { screenPayer } from "@/lib/screening";
import { send } from "@/lib/notify";
import { fromUnits } from "@/lib/money";
import type { Business } from "@/lib/session";

const transferEvent = parseAbiItem("event Transfer(address indexed from, address indexed to, uint256 value)");
const CHUNK = 10_000n;
const FIRST_LOOKBACK = 20_000n;

/** Pick up USDC that arrived in the vault since the last run, screen who sent it,
 * and match it to an open payment request when the match is certain. */
export async function syncIncoming(b: Business) {
  const vault = getAddress(b.vault_address!) as Address;
  const latest = await publicClient.getBlockNumber({ cacheTime: 0 });
  let from = b.last_block ? BigInt(b.last_block) + 1n : latest > FIRST_LOOKBACK ? latest - FIRST_LOOKBACK : 0n;
  const found: { id: string; from: Address; amount: bigint }[] = [];

  while (from <= latest) {
    const to = from + CHUNK - 1n > latest ? latest : from + CHUNK - 1n;
    const logs = await publicClient.getLogs({ address: USDC, event: transferEvent, args: { to: vault }, fromBlock: from, toBlock: to });
    for (const l of logs) {
      const id = newId();
      const inserted = await q(
        `INSERT INTO payments_in (id, business_id, tx_hash, log_index, from_address, amount, block_number)
         VALUES ($1,$2,$3,$4,$5,$6,$7) ON CONFLICT (tx_hash, log_index) DO NOTHING RETURNING id`,
        [id, b.id, l.transactionHash, l.logIndex, getAddress(l.args.from!), l.args.value!.toString(), l.blockNumber!.toString()],
      );
      if (inserted.length) found.push({ id, from: getAddress(l.args.from!), amount: l.args.value! });
    }
    await q("UPDATE businesses SET last_block = $1 WHERE id = $2", [to.toString(), b.id]);
    from = to + 1n;
  }

  for (const p of found) {
    const s = await screenPayer(p.from);
    await q("UPDATE payments_in SET screening = $1 WHERE id = $2", [JSON.stringify(s), p.id]);
    if (s.status !== "clear") {
      await logDecision(b.id, "screen", `Flagged ${fromUnits(p.amount)} USDC received from ${p.from}`, s.reasons.map((r) => r.detail).join(" "), {
        paymentId: p.id,
        screening: s,
      });
    }
    await autoMatch(b, p);
  }
  return found.length;
}

/** Match when only one open request fits: the payer's known wallet, or a unique amount. */
async function autoMatch(b: Business, p: { id: string; from: Address; amount: bigint }) {
  type Open = { id: string; invoice_no: string; outstanding: string; wallet_address: string | null; next_instalment: string | null };
  const open = await q<Open>(
    `SELECT r.id, r.invoice_no, (r.amount - r.paid_amount)::text AS outstanding, c.wallet_address,
            (r.instalments->0->>'amount') AS next_instalment
     FROM payment_requests r JOIN customers c ON c.id = r.customer_id
     WHERE r.business_id = $1 AND r.status IN ('open','part_paid')`,
    [b.id],
  );
  const fits = (r: Open) => BigInt(r.outstanding) === p.amount || (r.next_instalment != null && BigInt(r.next_instalment) === p.amount);
  const byWallet = open.filter((r) => r.wallet_address && r.wallet_address.toLowerCase() === p.from.toLowerCase());
  const candidates = byWallet.filter(fits).length === 1 ? byWallet.filter(fits) : open.filter(fits);
  if (candidates.length !== 1) return; // left for the agent to decide
  await applyPayment(b.id, p.id, candidates[0].id, "Only one open request matches this amount" + (byWallet.length ? " from this customer's wallet." : "."));
}

/** Record that a received payment settles (part of) a request. */
export async function applyPayment(businessId: string, paymentId: string, requestId: string, reason: string) {
  const p = await one<{ amount: string; from_address: string; request_id: string | null }>(
    "SELECT amount, from_address, request_id FROM payments_in WHERE id = $1 AND business_id = $2",
    [paymentId, businessId],
  );
  if (!p) return "No such payment";
  if (p.request_id) return "This payment is already matched";
  const r = await one<{ amount: string; paid_amount: string; invoice_no: string; customer_id: string; status: string }>(
    "SELECT amount, paid_amount, invoice_no, customer_id, status FROM payment_requests WHERE id = $1 AND business_id = $2",
    [requestId, businessId],
  );
  if (!r) return "No such request";
  if (r.status === "paid" || r.status === "cancelled") return `Request is already ${r.status}`;

  const paid = BigInt(r.paid_amount) + BigInt(p.amount);
  const done = paid >= BigInt(r.amount);
  await q("UPDATE payments_in SET request_id = $1 WHERE id = $2", [requestId, paymentId]);
  await q(
    `UPDATE payment_requests SET paid_amount = $1, status = $2, paid_at = CASE WHEN $3 THEN now() ELSE paid_at END,
       instalments = CASE WHEN instalments IS NULL OR $3 THEN instalments ELSE (instalments - 0) END
     WHERE id = $4`,
    [paid.toString(), done ? "paid" : "part_paid", done, requestId],
  );
  // Remember the customer's wallet so later payments match on it.
  await q("UPDATE customers SET wallet_address = COALESCE(wallet_address, $1) WHERE id = $2", [p.from_address, r.customer_id]);
  await logDecision(
    businessId,
    "match",
    `Matched ${fromUnits(p.amount)} USDC to invoice ${r.invoice_no}${done ? " (now paid in full)" : ""}`,
    reason,
    { paymentId, requestId },
  );
  if (paid > BigInt(r.amount)) {
    const extra = fromUnits(paid - BigInt(r.amount));
    await logDecision(
      businessId,
      "attention",
      `Invoice ${r.invoice_no} was overpaid by ${extra} USDC`,
      `The customer sent more than they owed. Decide whether to send the ${extra} USDC back or keep it as credit for their next invoice.`,
      { paymentId, requestId, extra },
    );
  }
  const receipt = await sendReceipt(businessId, r.customer_id, r.invoice_no, p.amount, done ? 0n : BigInt(r.amount) - paid);
  await logDecision(businessId, "note", `Payment received email for invoice ${r.invoice_no}: ${receipt}`, "The customer is told as soon as their payment is matched.", { requestId });
  return done ? "Matched; invoice paid in full" : `Matched; ${fromUnits(BigInt(r.amount) - paid)} USDC still due`;
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
