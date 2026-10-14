import { getAddress, type Address, type Hex } from "viem";
import { readVault } from "@/lib/chain";
import { one, q } from "@/lib/db";
import { logDecision } from "@/lib/decisions";
import { billChecks, categoryKey } from "@/lib/bills";
import { customerReliability } from "@/lib/reliability";
import { screenPayee } from "@/lib/screening";
import { fromUnits } from "@/lib/money";
import { defaultSettings, type Business } from "@/lib/session";
import { syncApprovals } from "@/lib/approvals";
import { syncIncoming } from "./incoming";
import { runSavings } from "./savings";
import { buildTools, daysUntil, MAX_REMINDERS, type BillCtx } from "./tools";
import { recheckWallets } from "./recheck";
import { dryRun, send, agentAddress } from "./wallet";
import { aiClient, useBlockRun } from "./ai";

const MODEL = "claude-opus-5-5";

/** Whatever makes the decisions: Claude by default, a script in tests. */
export type Decider = (input: { system: string; prompt: string; tools: ReturnType<typeof buildTools> }) => Promise<{ summary: string; stop: string | null }>;

/** Claude decides, calling the tools until it's done. */
export const claudeDecider: Decider = async ({ system, prompt, tools }) => {
  const client = aiClient();
  const runner = useBlockRun()
    ? // Paid per call from the agent wallet, priced up front from max_tokens, so keep it lean.
      client.beta.messages.toolRunner({
        model: process.env.AI_MODEL || "claude-haiku-4-5",
        max_tokens: Number(process.env.AI_MAX_TOKENS || 3000),
        system,
        tools,
        max_iterations: 12,
        messages: [{ role: "user", content: prompt }],
      })
    : client.beta.messages.toolRunner({
        model: MODEL,
        max_tokens: 16000,
        thinking: { type: "adaptive" },
        output_config: { effort: "high" },
        // If a request is declined, the API retries it on a fallback model.
        betas: ["server-side-fallback-2026-07-01"],
        fallbacks: "default",
        system,
        tools,
        max_iterations: 25,
        messages: [{ role: "user", content: prompt }],
      });
  const final = await runner.runUntilDone();
  const summary = final.content.filter((c) => c.type === "text").map((c: any) => c.text).join("\n").trim();
  return { summary, stop: final.stop_reason };
};

// One run at a time per business, so the timer and the "Run the agent now" button never overlap.
const running = new Map<string, ReturnType<typeof runBusinessNow>>();

/** One full pass for one business: money in, checks, then the decider chooses what to do. */
export async function runBusiness(businessId: string, decide: Decider = claudeDecider) {
  const busy = running.get(businessId);
  if (busy) return busy;
  const p = leased(businessId, () => runBusinessNow(businessId, decide)).finally(() => running.delete(businessId));
  running.set(businessId, p);
  return p;
}

/** Also hold a lease in the database, so runs from other processes (worker, second server) never overlap. */
async function leased<T extends { skipped?: string }>(businessId: string, fn: () => Promise<T>): Promise<T> {
  const got = await one(
    "UPDATE businesses SET agent_lease_until = now() + interval '10 minutes' WHERE id = $1 AND (agent_lease_until IS NULL OR agent_lease_until < now()) RETURNING id",
    [businessId],
  );
  if (!got) return { skipped: "the agent is already running for this business" } as T;
  try {
    return await fn();
  } finally {
    await q("UPDATE businesses SET agent_lease_until = NULL WHERE id = $1", [businessId]);
  }
}

async function runBusinessNow(businessId: string, decide: Decider) {
  const b = await one<Business>("SELECT * FROM businesses WHERE id = $1", [businessId]);
  if (!b?.vault_address) return { skipped: "no vault" };
  const vault = getAddress(b.vault_address) as Address;
  const settings = { ...defaultSettings, ...b.settings };

  const state = await readVault(vault);
  if (state.agent.toLowerCase() !== agentAddress().toLowerCase()) return { skipped: "Bursar's agent isn't authorised on this vault" };
  if (state.paused) return { skipped: "paused by the owner" };

  const received = await syncIncoming(b);
  await syncApprovals(b.id, vault);
  await recheckWallets(b);
  const startHead = await one<{ hash: string }>("SELECT hash FROM decisions WHERE business_id = $1 ORDER BY seq DESC LIMIT 1", [b.id]);
  const saved = await runSavings(b, vault);

  // ---------------------------------------------------------------- bills, with every check done in code
  const billRows = await q<any>(
    `SELECT bl.*, s.name AS supplier_name, s.wallet_address, s.previous_wallet, s.wallet_changed_at, s.created_at AS supplier_since
     FROM bills bl JOIN suppliers s ON s.id = bl.supplier_id
     WHERE bl.business_id = $1 AND bl.status IN ('new','scheduled','held') ORDER BY bl.due_date`,
    [b.id],
  );
  const known = await q<{ wallet_address: string; created_at: string }>("SELECT wallet_address, created_at FROM suppliers WHERE business_id = $1", [b.id]);

  const bills: BillCtx[] = [];
  for (const r of billRows) {
    const flags = await billChecks(r);
    const screening = await screenPayee(r.wallet_address, {
      // Only wallets added before this one count: the newcomer that looks like an
      // established supplier is the suspicious one, not the other way round.
      knownAddresses: known
        .filter((k) => k.wallet_address.toLowerCase() !== r.wallet_address.toLowerCase() && new Date(k.created_at) < new Date(r.supplier_since))
        .map((k) => k.wallet_address),
      walletChangedAt: r.wallet_changed_at,
      previousWallet: r.previous_wallet,
    });
    const amount = BigInt(r.amount);
    const vaultCheck = await dryRun(vault, getAddress(r.wallet_address), amount, categoryKey(r.category), r.ref);
    await q("UPDATE bills SET flags = $1 WHERE id = $2", [JSON.stringify(flags), r.id]);

    if (screening.status === "blocked") {
      await q("UPDATE bills SET status = 'blocked' WHERE id = $1", [r.id]);
      await logDecision(b.id, "block", `Blocked payment to ${r.supplier_name} (invoice ${r.invoice_no})`, screening.reasons.map((x) => x.detail).join(" "), {
        billId: r.id,
        screening,
      });
      continue;
    }
    bills.push({
      id: r.id,
      supplier: r.supplier_name,
      wallet: getAddress(r.wallet_address),
      invoiceNo: r.invoice_no,
      amount,
      category: r.category,
      dueDate: String(r.due_date).slice(0, 10),
      status: r.status,
      payAfter: r.pay_after ? String(r.pay_after).slice(0, 10) : null,
      ref: r.ref,
      flags,
      screening,
      vaultCheck,
    });
  }

  // ---------------------------------------------------------------- customers who owe money
  const reqRows = await q<any>(
    `SELECT r.*, c.name AS customer_name, c.email, c.telegram_chat_id, c.whatsapp,
       (SELECT max(created_at) FROM chases ch WHERE ch.request_id = r.id AND ch.status = 'sent') AS last_chased,
       (SELECT count(*) FROM chases ch WHERE ch.request_id = r.id AND ch.status = 'sent') AS times_chased,
       (SELECT max(created_at) FROM chases ch WHERE ch.request_id = r.id) AS last_tried
     FROM payment_requests r JOIN customers c ON c.id = r.customer_id
     WHERE r.business_id = $1 AND r.status IN ('open','part_paid') ORDER BY r.due_date`,
    [b.id],
  );
  const receivables = [];
  for (const r of reqRows) receivables.push({ ...r, reliability: await customerReliability(b.id, r.customer_id) });

  const unmatched = await q<any>(
    "SELECT id, from_address, amount, created_at, screening FROM payments_in WHERE business_id = $1 AND request_id IS NULL ORDER BY created_at DESC LIMIT 20",
    [b.id],
  );

  if (!bills.length && !receivables.length && !unmatched.length && state.operating <= state.cashFloor) return { received, saved, decisions: 0 };

  const tools = buildTools({
    businessId: b.id,
    vault,
    settings,
    bills,
    receivables,
    cash: { operating: state.operating, reserve: state.reserve },
    appUrl: process.env.APP_URL || "http://localhost:3000",
  });

  // ---------------------------------------------------------------- the situation, as the agent sees it
  const situation = {
    today: new Date().toISOString().slice(0, 10),
    business: b.name,
    cash: {
      operating_usdc: fromUnits(state.operating),
      reserve_usdc: fromUnits(state.reserve),
      cash_floor_usdc: fromUnits(state.cashFloor),
      max_per_payment_usdc: fromUnits(state.maxPerPayment),
    },
    owner_settings: settings,
    bills_to_handle: bills.map((x) => ({
      id: x.id,
      supplier: x.supplier,
      invoice_no: x.invoiceNo,
      amount_usdc: fromUnits(x.amount),
      category: x.category,
      due_date: x.dueDate,
      days_until_due: daysUntil(x.dueDate),
      status: x.status,
      pay_after: x.payAfter,
      flags: x.flags,
      wallet_check: { status: x.screening.status, reasons: x.screening.reasons },
      vault_would_refuse: x.vaultCheck,
    })),
    money_owed_to_business: receivables.map((r: any) => ({
      id: r.id,
      customer: r.customer_name,
      invoice_no: r.invoice_no,
      outstanding_usdc: fromUnits(BigInt(r.amount) - BigInt(r.paid_amount)),
      due_date: String(r.due_date).slice(0, 10),
      days_overdue: -daysUntil(String(r.due_date).slice(0, 10)),
      instalment_plan: r.instalments,
      times_chased: Number(r.times_chased),
      chasing_stopped: !!r.chasing_stopped_at,
      last_chased: r.last_chased,
      reachable_on: [r.email && "email", r.telegram_chat_id && "telegram", r.whatsapp && "whatsapp"].filter(Boolean),
      payment_history: { ...r.reliability, outstanding: fromUnits(r.reliability.outstanding) },
    })),
    unmatched_payments: unmatched.map((p) => ({
      id: p.id,
      from: p.from_address,
      amount_usdc: fromUnits(p.amount),
      received: p.created_at,
      wallet_check: p.screening?.status,
    })),
  };

  const system = `You are Bursar, the agent that runs a small business's money in USDC on Arc.
You act for the owner. Every action goes through a vault contract whose rules you can't break: a per-payment limit, monthly budgets per category, a cash floor, approved payees only, and no paying the same bill twice. Code has already checked each bill for duplicates, mismatches and risky wallets; respect those results.

How to decide:
- Keep enough operating cash for bills due in the next ${settings.operatingDays} days, plus the cash floor. If operating cash is short, release reserve or hold bills that can wait; never let a bill go overdue if cash allows paying it.
- Pay bills due within 3 days. Pay early only when cash is comfortable after ${settings.operatingDays} days of bills and the bill is due within ${settings.earlyPayDays} days.
- Anything flagged, with a wallet check that isn't clear, or that the vault would refuse goes to request_approval with a clear reason. Never try to get around a check.
- Surplus beyond the next ${settings.operatingDays} days of bills (and money expected in that might not arrive) can move to reserve. Move round amounts, and don't shuffle money back and forth in the same run.
- After ${MAX_REMINDERS} reminders on an invoice, chasing stops and the owner is told (chasing_stopped); don't chase those.
- Chase overdue invoices in order of size and risk. Use the payment history: be warm with reliable customers, firm with repeat late payers. Don't chase invoices that aren't due yet unless due within 2 days. Offer instalments to customers who are well overdue or have been chased several times, within the owner's limits.
- Match unmatched payments only when you're confident; otherwise leave them.
- Every action needs a reason the owner would understand. If nothing needs doing, call note once to say so and why.
Be decisive and brief. Finish with one or two sentences summarising what you did.`;

  const { summary, stop } = await decide({
    system,
    tools,
    prompt: `Here is the business's position. Decide what to do now.\n\n${JSON.stringify(situation, null, 2)}`,
  });

  // ---------------------------------------------------------------- anchor the log onchain
  const head = await one<{ id: string; hash: string }>("SELECT id, hash FROM decisions WHERE business_id = $1 ORDER BY seq DESC LIMIT 1", [b.id]);
  let anchored: string | undefined;
  if (head && head.hash !== startHead?.hash) {
    const tx = await send(vault, { functionName: "recordDecision", args: [head.hash as Hex] });
    if (tx.ok) {
      anchored = tx.hash;
      await q("UPDATE decisions SET anchor_tx = $1 WHERE id = $2", [tx.hash, head.id]);
    }
  }
  return { received, saved, summary, stop, anchored };
}

/** Every business whose vault has authorised this agent. */
export async function runAll(decide: Decider = claudeDecider) {
  const rows = await q<{ id: string; name: string }>("SELECT id, name FROM businesses WHERE vault_address IS NOT NULL");
  const out: Record<string, unknown> = {};
  for (const r of rows) {
    try {
      out[r.name] = await runBusiness(r.id, decide);
    } catch (e) {
      out[r.name] = { error: e instanceof Error ? e.message : String(e) };
    }
  }
  return out;
}
