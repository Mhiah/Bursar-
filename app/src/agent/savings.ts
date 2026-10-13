import { getAddress, keccak256, toHex, type Address, type Hex } from "viem";
import { bursarSavingsAbi } from "@/lib/abi/BursarSavings";
import { categoryKey } from "@/lib/category";
import { publicClient } from "@/lib/chain";
import { newId, q } from "@/lib/db";
import { logDecision } from "@/lib/decisions";
import { fromUnits } from "@/lib/money";
import type { Business, SavingsPlans } from "@/lib/session";
import { dryRun, send, sendAllocate } from "./wallet";

/** The vault budget category that caps how much can go to savings every 30 days. */
export const SAVINGS_CATEGORY = "savings";

const plain: Record<string, string> = {
  PayeeNotApproved: "your savings account isn't approved on your vault yet",
  OverBudget: "this month's savings budget is used up",
  OverPaymentLimit: "it's more than your most-per-payment rule",
  BelowCashFloor: "it would take the vault below the cash you always keep",
  IsPaused: "the agent is paused",
};
const why = (e: string) => plain[e] ?? e;

const nextTime = (from: Date, every: "day" | "week" | "month") => {
  const d = new Date(from);
  if (every === "day") d.setUTCDate(d.getUTCDate() + 1);
  else if (every === "week") d.setUTCDate(d.getUTCDate() + 7);
  else d.setUTCMonth(d.getUTCMonth() + 1);
  return d;
};

async function potName(savings: Address, pot: number) {
  try {
    const p = await publicClient.readContract({ address: savings, abi: bursarSavingsAbi, functionName: "pot", args: [BigInt(pot)] });
    return p.name;
  } catch {
    return `savings pot ${pot + 1}`;
  }
}

const unassigned = (savings: Address) => publicClient.readContract({ address: savings, abi: bursarSavingsAbi, functionName: "unassigned" });

/**
 * Savings, done in code rather than by the AI so it is exact and on time:
 * money the owner sent goes into its pot, AutoSave runs when due, and a share of every
 * matched customer payment is saved. Money only leaves the vault through agentPay, so
 * the vault's rules (approved payee, the monthly savings budget, the cash floor) cap it all.
 */
export async function runSavings(b: Business, vault: Address) {
  if (!b.savings_address) return 0;
  const savings = getAddress(b.savings_address) as Address;
  const plans: SavingsPlans = b.savings_plans ?? {};
  let moved = 0;

  // ---- money that reached savings but isn't in its pot yet (sent by the owner, or a half-finished move)
  const pending = await q<{ id: string; pot: number; amount: string; source: string }>(
    "SELECT id, pot, amount, source FROM savings_moves WHERE business_id = $1 AND status = 'pending' ORDER BY created_at",
    [b.id],
  );
  for (const m of pending) {
    if ((await unassigned(savings)) < BigInt(m.amount)) continue; // not arrived yet
    const tx = await sendAllocate(savings, BigInt(m.pot), BigInt(m.amount));
    if (!tx.ok) continue;
    await q("UPDATE savings_moves SET status = 'done', tx_hash = COALESCE(tx_hash, $1) WHERE id = $2", [tx.hash, m.id]);
    await logDecision(b.id, "save", `Put ${fromUnits(m.amount)} USDC into ${await potName(savings, m.pot)}`, "Money you sent to savings went into the savings pot you chose.", {
      moveId: m.id,
      tx: tx.hash,
    });
    moved++;
  }

  // ---- AutoSave, when due. A missed turn is skipped, not saved up, so it never moves a lump at once.
  const a = plans.autoSave;
  if (a && BigInt(a.amount) > 0n && new Date(a.nextAt) <= new Date()) {
    const ref = keccak256(toHex(`auto:${b.id}:${a.nextAt}`));
    const out = await moveFromVault(b, vault, savings, a.pot, BigInt(a.amount), "auto", ref, null);
    let next = nextTime(new Date(a.nextAt), a.every);
    while (next <= new Date()) next = nextTime(next, a.every);
    await q("UPDATE businesses SET savings_plans = jsonb_set(savings_plans, '{autoSave,nextAt}', to_jsonb($1::text)) WHERE id = $2", [next.toISOString(), b.id]);
    if (out) moved++;
  }

  // ---- Save when paid: a share of each customer payment matched to an invoice
  const w = plans.whenPaid;
  if (w && w.percent > 0) {
    const paid = await q<{ id: string; amount: string }>(
      `SELECT p.id, p.amount FROM payments_in p
       WHERE p.business_id = $1 AND p.request_id IS NOT NULL AND p.created_at >= $2
         AND NOT EXISTS (SELECT 1 FROM savings_moves m WHERE m.payment_id = p.id)
       ORDER BY p.created_at`,
      [b.id, w.since],
    );
    for (const p of paid) {
      const amount = (BigInt(p.amount) * BigInt(Math.round(w.percent * 100))) / 10_000n;
      if (amount <= 0n) continue;
      const ref = keccak256(toHex(`paid:${p.id}`));
      if (await moveFromVault(b, vault, savings, w.pot, amount, "paid", ref, p.id)) moved++;
    }
  }
  return moved;
}

/** Vault → savings (inside the vault's rules), then into the pot. */
async function moveFromVault(
  b: Business,
  vault: Address,
  savings: Address,
  pot: number,
  amount: bigint,
  source: "auto" | "paid",
  ref: Hex,
  paymentId: string | null,
) {
  const what = source === "auto" ? "AutoSave" : "Save when paid";
  const name = await potName(savings, pot);
  const id = newId();
  const refused = await dryRun(vault, savings, amount, categoryKey(SAVINGS_CATEGORY), ref);
  if (refused) {
    await q("INSERT INTO savings_moves (id, business_id, pot, amount, source, payment_id, status, error) VALUES ($1,$2,$3,$4,$5,$6,'failed',$7)", [
      id, b.id, pot, amount.toString(), source, paymentId, refused,
    ]);
    await logDecision(b.id, "save", `Didn't save ${fromUnits(amount)} USDC (${what})`, `Skipped because ${why(refused)}.`, { pot, source, paymentId });
    return false;
  }
  const pay = await send(vault, { functionName: "agentPay", args: [savings, amount, categoryKey(SAVINGS_CATEGORY), ref] });
  if (!pay.ok) {
    await q("INSERT INTO savings_moves (id, business_id, pot, amount, source, payment_id, status, error) VALUES ($1,$2,$3,$4,$5,$6,'failed',$7)", [
      id, b.id, pot, amount.toString(), source, paymentId, pay.error,
    ]);
    await logDecision(b.id, "save", `Didn't save ${fromUnits(amount)} USDC (${what})`, `The vault refused: ${why(pay.error)}.`, { pot, source, paymentId });
    return false;
  }
  // The money is in savings now. If putting it in the pot fails, the next run finishes it.
  const put = await sendAllocate(savings, BigInt(pot), amount);
  await q("INSERT INTO savings_moves (id, business_id, pot, amount, source, payment_id, status, tx_hash) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)", [
    id, b.id, pot, amount.toString(), source, paymentId, put.ok ? "done" : "pending", pay.hash,
  ]);
  await logDecision(
    b.id,
    "save",
    `Saved ${fromUnits(amount)} USDC into ${name} (${what})`,
    source === "auto" ? "Your AutoSave was due." : "A customer paid, and you save a share of every payment.",
    { pot, source, paymentId, tx: pay.hash },
  );
  return true;
}
