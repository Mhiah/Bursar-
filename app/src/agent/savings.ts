import { getAddress, keccak256, toHex, type Address, type Hex } from "viem";
import { bursarSavingsAbi } from "@/lib/abi/BursarSavings";
import { categoryKey } from "@/lib/category";
import { publicClient } from "@/lib/chain";
import { newId, one, q } from "@/lib/db";
import { logDecision } from "@/lib/decisions";
import { fromUnits } from "@/lib/money";
import type { Business, SavingsPlans } from "@/lib/session";
import { dryRun, send, sendAllocate } from "./wallet";
import { bursarVaultAbi } from "@/lib/abi/BursarVault";

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

async function potName(savings: Address, pot: number) {
  try {
    const p = await publicClient.readContract({ address: savings, abi: bursarSavingsAbi, functionName: "pot", args: [BigInt(pot)] });
    return p.name;
  } catch {
    return `savings pot ${pot + 1}`;
  }
}

/** The agent may add to Flex and Target pots, and to a Locked pot only if the owner allowed it. */
async function agentMayFill(savings: Address, pot: number) {
  const p = await publicClient.readContract({ address: savings, abi: bursarSavingsAbi, functionName: "pot", args: [BigInt(pot)] });
  if (p.kind !== 1) return true;
  return publicClient.readContract({ address: savings, abi: bursarSavingsAbi, functionName: "agentMayFill", args: [BigInt(pot)] });
}

const unassigned = (savings: Address) => publicClient.readContract({ address: savings, abi: bursarSavingsAbi, functionName: "unassigned" });

/** Wait before trying a failed move again: 1 h, 2 h, 4 h ... at most a day. */
const backoffHours = (attempts: number) => Math.min(24, 2 ** Math.max(0, attempts - 1));
/** After this long without going through, a Save when paid move stops retrying and the owner is told. */
const GIVE_UP_DAYS = 35;
/** A move still "sending" or "allocating" after this long was cut off (a crash or restart). */
const STALE_MINUTES = 15;

type Move = { id: string; pot: number; amount: string; source: string; payment_id: string | null; ref: string | null; attempts: number; error: string | null; created_at: string };

/**
 * Savings, done in code rather than by the AI so it is exact and on time:
 * money the owner sent goes into its pot, and a share of every matched customer payment
 * is saved. Money only leaves the vault through agentPay, so
 * the vault's rules (approved payee, the monthly savings budget, the cash floor) cap it all.
 *
 * Each Save when paid move is written down before anything is sent and then moves through
 * retry -> sending -> pending -> allocating -> done. A move that fails waits and is tried
 * again; one cut off part way is checked against the vault (which records every reference it
 * paid), so money is never saved twice and never silently dropped. If a move still can't go
 * through after weeks, it is marked failed and the owner is told.
 */
export async function runSavings(b: Business, vault: Address) {
  if (!b.savings_address) return 0;
  const savings = getAddress(b.savings_address) as Address;
  const plans: SavingsPlans = b.savings_plans ?? {};
  let moved = 0;

  // ---- 1. Write down a move for every matched customer payment that should be saved and has none yet.
  const w = plans.whenPaid;
  if (w && w.percent > 0) {
    const paid = await q<{ id: string; amount: string }>(
      `SELECT p.id, p.amount::text FROM payments_in p
       WHERE p.business_id = $1 AND p.request_id IS NOT NULL AND p.created_at >= $2
         AND NOT EXISTS (SELECT 1 FROM savings_moves m WHERE m.payment_id = p.id)
       ORDER BY p.created_at`,
      [b.id, w.since],
    );
    for (const p of paid) {
      const amount = (BigInt(p.amount) * BigInt(Math.round(w.percent * 100))) / 10_000n;
      if (amount <= 0n) continue;
      await q(
        `INSERT INTO savings_moves (id, business_id, pot, amount, source, payment_id, status, ref, next_try_at)
         VALUES ($1,$2,$3,$4,'paid',$5,'retry',$6, now()) ON CONFLICT (payment_id) DO NOTHING`,
        [newId(), b.id, w.pot, amount.toString(), p.id, keccak256(toHex(`paid:${p.id}`))],
      );
    }
  }

  // ---- 2. Moves cut off while sending: did the vault pay them?
  const cut = await q<Move>(
    `SELECT * FROM savings_moves WHERE business_id = $1 AND status = 'sending' AND updated_at < now() - interval '${STALE_MINUTES} minutes'`,
    [b.id],
  );
  for (const m of cut) {
    if (await refPaid(vault, m.ref as Hex)) await sent(b, savings, m, null);
    else await q("UPDATE savings_moves SET status = 'retry', next_try_at = now(), updated_at = now() WHERE id = $1 AND status = 'sending'", [m.id]);
  }

  // ---- 3. Send the moves that are due (new ones, and failed ones whose wait is over).
  const due = await q<Move>(
    "SELECT * FROM savings_moves WHERE business_id = $1 AND status = 'retry' AND (next_try_at IS NULL OR next_try_at <= now()) ORDER BY created_at",
    [b.id],
  );
  for (const m of due) if (await sendMove(b, vault, savings, m)) moved++;

  // ---- 4. Money that reached savings but isn't in its pot yet (sent by the owner, or saved in step 3).
  const stuck = await q<Move>(
    `SELECT * FROM savings_moves WHERE business_id = $1 AND status = 'allocating' AND updated_at < now() - interval '${STALE_MINUTES} minutes'`,
    [b.id],
  );
  for (const m of stuck) {
    // We can't tell from here whether the pot got it, so the owner checks rather than it being put in twice.
    if (!(await one("UPDATE savings_moves SET status = 'failed', error = 'CutOffWhileAllocating', updated_at = now() WHERE id = $1 AND status = 'allocating' RETURNING id", [m.id]))) continue;
    await logDecision(
      b.id,
      "attention",
      `Check that ${fromUnits(m.amount)} USDC went into ${await potName(savings, m.pot)}`,
      "Putting this money into its savings pot was cut off part way. It is in your savings account either way. If the pot doesn't show it, put it in from the Savings page.",
      { moveId: m.id, pot: m.pot },
    );
  }
  const pending = await q<Move>("SELECT * FROM savings_moves WHERE business_id = $1 AND status = 'pending' ORDER BY created_at", [b.id]);
  for (const m of pending) {
    if ((await unassigned(savings)) < BigInt(m.amount)) {
      // Money the owner said they sent that never arrived: say so once.
      if (m.source === "owner" && Date.now() - new Date(m.created_at).getTime() > 86_400_000) {
        if (await one("UPDATE savings_moves SET flagged_at = now() WHERE id = $1 AND flagged_at IS NULL RETURNING id", [m.id]))
          await logDecision(b.id, "attention", `${fromUnits(m.amount)} USDC sent to savings hasn't arrived`, "It was recorded a day ago but isn't in your savings account yet. Check the transfer.", { moveId: m.id });
      }
      continue;
    }
    // Claim it first, so two runs at once can't put the same money in twice.
    if (!(await one("UPDATE savings_moves SET status = 'allocating', updated_at = now() WHERE id = $1 AND status = 'pending' RETURNING id", [m.id]))) continue;
    const tx = await sendAllocate(savings, BigInt(m.pot), BigInt(m.amount));
    if (!tx.ok) {
      await q("UPDATE savings_moves SET status = 'pending', error = $1, attempts = attempts + 1, updated_at = now() WHERE id = $2", [tx.error, m.id]);
      continue;
    }
    await q("UPDATE savings_moves SET status = 'done', error = NULL, tx_hash = COALESCE(tx_hash, $1), updated_at = now() WHERE id = $2", [tx.hash, m.id]);
    if (m.source === "owner") {
      await logDecision(b.id, "save", `Put ${fromUnits(m.amount)} USDC into ${await potName(savings, m.pot)}`, "Money you sent to savings went into the savings pot you chose.", {
        moveId: m.id,
        tx: tx.hash,
      });
      moved++;
    }
  }
  return moved;
}

const refPaid = (vault: Address, ref: Hex) => publicClient.readContract({ address: vault, abi: bursarVaultAbi, functionName: "refPaid", args: [ref] });

/** Vault -> savings for one Save when paid move, inside the vault's rules. */
async function sendMove(b: Business, vault: Address, savings: Address, m: Move) {
  const what = "Save when paid";
  const amount = BigInt(m.amount);
  const ref = m.ref as Hex;
  // Claim it first: a move is sent by one run only.
  if (!(await one("UPDATE savings_moves SET status = 'sending', updated_at = now() WHERE id = $1 AND status = 'retry' RETURNING id", [m.id]))) return false;

  let problem: string | null = null;
  if (!(await agentMayFill(savings, m.pot))) problem = "AgentCantFillLocked";
  else problem = await dryRun(vault, savings, amount, categoryKey(SAVINGS_CATEGORY), ref);
  // The vault already paid this reference: an earlier try went through. Finish it, don't pay again.
  if (problem === "AlreadyPaid") return sent(b, savings, m, null);
  if (!problem) {
    const pay = await send(vault, { functionName: "agentPay", args: [savings, amount, categoryKey(SAVINGS_CATEGORY), ref] });
    if (pay.ok) return sent(b, savings, m, pay.hash);
    // A failed send may still have gone through; the vault's record decides.
    if (pay.error === "AlreadyPaid" || (await refPaid(vault, ref).catch(() => false))) return sent(b, savings, m, "hash" in pay && pay.hash ? pay.hash : null);
    problem = pay.error;
  }
  await failed(b, savings, m, problem ?? "unknown", what);
  return false;
}

/** The money is in savings: record it, then step 4 puts it in its pot. */
async function sent(b: Business, savings: Address, m: Move, hash: Hex | null) {
  const ok = await one(
    "UPDATE savings_moves SET status = 'pending', error = NULL, tx_hash = COALESCE($1, tx_hash), updated_at = now() WHERE id = $2 AND status IN ('sending','retry') RETURNING id",
    [hash, m.id],
  );
  if (!ok) return false;
  await logDecision(
    b.id,
    "save",
    `Saved ${fromUnits(m.amount)} USDC into ${await potName(savings, m.pot)} (Save when paid)`,
    m.attempts > 0 ? `A customer paid, and you save a share of every payment. It went through after ${m.attempts} earlier ${m.attempts === 1 ? "try" : "tries"}.` : "A customer paid, and you save a share of every payment.",
    { pot: m.pot, source: m.source, paymentId: m.payment_id, tx: hash },
  );
  return true;
}

/** Wait and try again later; after GIVE_UP_DAYS, stop and tell the owner. Logged on the first failure and when the reason changes. */
async function failed(b: Business, savings: Address, m: Move, error: string, what: string) {
  const attempts = m.attempts + 1;
  const name = await potName(savings, m.pot);
  const reason = error === "AgentCantFillLocked" ? `${name} is a Locked pot you haven't let the agent add to` : why(error);
  const old = Date.now() - new Date(m.created_at).getTime() > GIVE_UP_DAYS * 86_400_000;
  if (old) {
    await q("UPDATE savings_moves SET status = 'failed', error = $1, attempts = $2, updated_at = now() WHERE id = $3", [error, attempts, m.id]);
    await logDecision(
      b.id,
      "attention",
      `Stopped trying to save ${fromUnits(m.amount)} USDC (${what})`,
      `It was tried ${attempts} times over ${GIVE_UP_DAYS} days and didn't go through because ${reason}. Nothing was moved. You can save it yourself from the Savings page.`,
      { moveId: m.id, pot: m.pot, paymentId: m.payment_id, error },
    );
    return;
  }
  await q(
    `UPDATE savings_moves SET status = 'retry', error = $1, attempts = $2, next_try_at = now() + make_interval(hours => $3::int), updated_at = now() WHERE id = $4`,
    [error, attempts, String(backoffHours(attempts)), m.id],
  );
  if (attempts === 1 || error !== m.error)
    await logDecision(b.id, "save", `Didn't save ${fromUnits(m.amount)} USDC yet (${what})`, `Not yet, because ${reason}. It will be tried again automatically.`, {
      pot: m.pot,
      source: m.source,
      paymentId: m.payment_id,
      error,
    });
}
