import { betaZodTool } from "@anthropic-ai/sdk/helpers/beta/zod";
import { z } from "zod/v4";
import type { Address, Hex } from "viem";
import { newId, q } from "@/lib/db";
import { logDecision } from "@/lib/decisions";
import { categoryKey, type Flag } from "@/lib/bills";
import type { Screening } from "@/lib/screening";
import { send as sendMessage, type Channel } from "@/lib/notify";
import { fromUnits, toUnits } from "@/lib/money";
import type { BusinessSettings } from "@/lib/session";
import { applyPayment } from "./incoming";
import { dryRun, send } from "./wallet";

export type BillCtx = {
  id: string;
  supplier: string;
  wallet: Address;
  invoiceNo: string;
  amount: bigint;
  category: string;
  dueDate: string;
  status: string;
  payAfter: string | null;
  ref: Hex;
  flags: Flag[];
  screening: Screening;
  vaultCheck: string | null; // vault rule the payment would break, or null
};

export type ToolCtx = {
  businessId: string;
  vault: Address;
  settings: Required<BusinessSettings>;
  bills: BillCtx[];
  receivables: any[];
  cash: { operating: bigint; reserve: bigint };
  appUrl: string;
};

const today = () => new Date().toISOString().slice(0, 10);
export const daysUntil = (d: string) => Math.round((new Date(d).getTime() - new Date(today()).getTime()) / 864e5);

/**
 * What the agent can do. Each tool re-checks everything in code before acting, and every
 * money movement still has to pass the vault contract, so a bad call fails safely.
 */
export function buildTools(ctx: ToolCtx) {
  const { businessId: bid, vault, settings } = ctx;
  const billById = new Map(ctx.bills.map((x) => [x.id, x]));
  const reqById = new Map(ctx.receivables.map((x) => [x.id, x]));
  const cash = ctx.cash;
  const reason = z.string().describe("Plain-language reason, written for the business owner.");
  const channelsSchema = z.array(z.enum(["email", "telegram", "whatsapp"]));

  const recordChase = async (r: any, ch: Channel, text: string, subject: string) => {
    const res = await sendMessage(ch, r, subject, text);
    await q("INSERT INTO chases (id, business_id, request_id, channel, message, status, error) VALUES ($1,$2,$3,$4,$5,$6,$7)", [
      newId(), bid, r.id, ch, text, res.status, res.error ?? null,
    ]);
    return `${ch}: ${res.status}${res.error ? ` (${res.error})` : ""}`;
  };

  return [
    betaZodTool({
      name: "pay_bill",
      description:
        "Pay a supplier bill now from operating cash. Only works for bills with no flags, a clear wallet check, and no vault rule in the way. Use for bills due soon, or early when cash is comfortable.",
      inputSchema: z.object({ bill_id: z.string(), early: z.boolean().describe("True if paying before it's due to keep the supplier happy."), reason }),
      run: async ({ bill_id, early, reason }) => {
        const bill = billById.get(bill_id);
        if (!bill) return "No open bill with that id.";
        if (bill.flags.length) return `Not paid: this bill has flags (${bill.flags.map((f) => f.code).join(", ")}). Use request_approval.`;
        if (bill.screening.status !== "clear")
          return `Not paid: the wallet check needs a person (${bill.screening.reasons.map((r) => r.code).join(", ")}). Use request_approval.`;
        const rule = await dryRun(vault, bill.wallet, bill.amount, categoryKey(bill.category), bill.ref);
        if (rule) return `Not paid: the vault would refuse it (${rule}). Use request_approval if the owner should decide.`;
        const tx = await send(vault, { functionName: "agentPay", args: [bill.wallet, bill.amount, categoryKey(bill.category), bill.ref] });
        if (!tx.ok) return `Payment failed: ${tx.error}`;
        await q("UPDATE bills SET status = 'paid', paid_tx = $1, paid_at = now() WHERE id = $2", [tx.hash, bill.id]);
        cash.operating -= bill.amount;
        billById.delete(bill.id);
        await logDecision(bid, early ? "early_pay" : "pay", `Paid ${bill.supplier} ${fromUnits(bill.amount)} USDC (invoice ${bill.invoiceNo})`, reason, {
          billId: bill.id,
          tx: tx.hash,
        });
        return `Paid. Transaction ${tx.hash}. Operating cash now about ${fromUnits(cash.operating)} USDC.`;
      },
    }),
    betaZodTool({
      name: "hold_bill",
      description: "Wait before paying a bill, e.g. because cash is tight or it isn't due yet and money is expected in.",
      inputSchema: z.object({ bill_id: z.string(), pay_after: z.string().describe("YYYY-MM-DD, no later than the due date unless cash forces it."), reason }),
      run: async ({ bill_id, pay_after, reason }) => {
        const bill = billById.get(bill_id);
        if (!bill) return "No open bill with that id.";
        if (!/^\d{4}-\d{2}-\d{2}$/.test(pay_after)) return "pay_after must be YYYY-MM-DD.";
        await q("UPDATE bills SET status = 'held', pay_after = $1 WHERE id = $2", [pay_after, bill.id]);
        await logDecision(bid, "hold", `Holding ${bill.supplier}'s ${fromUnits(bill.amount)} USDC bill until ${pay_after}`, reason, { billId: bill.id });
        billById.delete(bill.id);
        return "Held.";
      },
    }),
    betaZodTool({
      name: "request_approval",
      description:
        "Ask the owner to approve a bill: over the agent's limits, flagged, a wallet that needs checking, or anything you're unsure about. The owner signs the approval themselves.",
      inputSchema: z.object({ bill_id: z.string(), reason }),
      run: async ({ bill_id, reason }) => {
        const bill = billById.get(bill_id);
        if (!bill) return "No open bill with that id.";
        const entry = await logDecision(bid, "approval", `Asked you to approve ${fromUnits(bill.amount)} USDC to ${bill.supplier} (invoice ${bill.invoiceNo})`, reason, {
          billId: bill.id,
          flags: bill.flags,
          screening: bill.screening,
          vaultCheck: bill.vaultCheck,
        });
        const tx = await send(vault, {
          functionName: "requestApproval",
          args: [bill.wallet, bill.amount, categoryKey(bill.category), bill.ref, entry.hash as Hex],
        });
        if (!tx.ok) return `Couldn't raise the approval: ${tx.error}`;
        await q("UPDATE bills SET status = 'awaiting_approval', approval_id = $1 WHERE id = $2", [String(tx.result), bill.id]);
        billById.delete(bill.id);
        return `Approval requested (#${tx.result}).`;
      },
    }),
    betaZodTool({
      name: "move_to_reserve",
      description: "Set aside operating cash the business won't need soon as reserve. The agent can't spend reserve on bills.",
      inputSchema: z.object({ amount_usdc: z.string().describe('Decimal USDC, e.g. "250"'), reason }),
      run: async ({ amount_usdc, reason }) => {
        const amount = toUnits(amount_usdc);
        const tx = await send(vault, { functionName: "moveToReserve", args: [amount] });
        if (!tx.ok) return `Not moved: ${tx.error}`;
        cash.operating -= amount;
        cash.reserve += amount;
        await logDecision(bid, "reserve", `Moved ${fromUnits(amount)} USDC to reserve`, reason, { tx: tx.hash });
        return `Moved. Reserve is now ${fromUnits(cash.reserve)} USDC.`;
      },
    }),
    betaZodTool({
      name: "release_reserve",
      description: "Bring reserve back into operating cash, e.g. to cover bills due soon.",
      inputSchema: z.object({ amount_usdc: z.string(), reason }),
      run: async ({ amount_usdc, reason }) => {
        const amount = toUnits(amount_usdc);
        const tx = await send(vault, { functionName: "releaseReserve", args: [amount] });
        if (!tx.ok) return `Not released: ${tx.error}`;
        cash.operating += amount;
        cash.reserve -= amount;
        await logDecision(bid, "release", `Released ${fromUnits(amount)} USDC from reserve`, reason, { tx: tx.hash });
        return `Released. Operating cash is now about ${fromUnits(cash.operating)} USDC.`;
      },
    }),
    betaZodTool({
      name: "match_payment",
      description: "Link a received payment that couldn't be matched automatically to the invoice it pays.",
      inputSchema: z.object({ payment_id: z.string(), request_id: z.string(), reason }),
      run: async ({ payment_id, request_id, reason }) => applyPayment(bid, payment_id, request_id, reason),
    }),
    betaZodTool({
      name: "chase_customer",
      description:
        "Send a payment reminder for an unpaid invoice. Write the message yourself: friendly for reliable customers, firmer for repeat late payers. The pay link is added for you.",
      inputSchema: z.object({ request_id: z.string(), channels: channelsSchema, subject: z.string(), message: z.string(), reason }),
      run: async ({ request_id, channels, subject, message, reason }) => {
        const r = reqById.get(request_id);
        if (!r) return "No open request with that id.";
        if (r.last_chased && Date.now() - new Date(r.last_chased).getTime() < settings.chaseEveryDays * 864e5)
          return `Not sent: last reminder was under ${settings.chaseEveryDays} days ago.`;
        const allowed = channels.filter((c) => settings.chaseChannels.includes(c));
        if (!allowed.length) return "None of those channels are turned on for this business.";
        const text = `${message}\n\nPay here: ${ctx.appUrl}/pay/${r.id}`;
        const results: string[] = [];
        for (const ch of allowed) results.push(await recordChase(r, ch, text, subject));
        if (results.some((x) => x.includes(": sent"))) r.last_chased = new Date().toISOString();
        await logDecision(bid, "chase", `Reminded ${r.customer_name} about invoice ${r.invoice_no}`, reason, { requestId: r.id, results });
        return results.join("; ");
      },
    }),
    betaZodTool({
      name: "offer_instalments",
      description: "Offer a customer who is struggling to pay a plan to pay in parts, within the owner's limits. Sends the offer with the pay link.",
      inputSchema: z.object({
        request_id: z.string(),
        plan: z.array(z.object({ amount_usdc: z.string(), due_date: z.string().describe("YYYY-MM-DD") })),
        channels: channelsSchema,
        message: z.string(),
        reason,
      }),
      run: async ({ request_id, plan, channels, message, reason }) => {
        const r = reqById.get(request_id);
        if (!r) return "No open request with that id.";
        const outstanding = BigInt(r.amount) - BigInt(r.paid_amount);
        if (settings.maxInstalments < 2) return "The owner has turned instalments off.";
        if (outstanding < toUnits(settings.minInstalmentAmount)) return `Invoice is below the owner's minimum for instalments (${settings.minInstalmentAmount} USDC).`;
        if (plan.length < 2 || plan.length > settings.maxInstalments) return `A plan must have 2 to ${settings.maxInstalments} parts.`;
        let total = 0n;
        try {
          for (const p of plan) total += toUnits(p.amount_usdc);
        } catch (e) {
          return (e as Error).message;
        }
        if (total !== outstanding) return `Parts must add up to exactly ${fromUnits(outstanding)} USDC.`;
        if (!plan.every((p) => /^\d{4}-\d{2}-\d{2}$/.test(p.due_date))) return "Dates must be YYYY-MM-DD.";
        if (daysUntil(plan[plan.length - 1].due_date) > settings.maxInstalmentDays) return `Plan must end within ${settings.maxInstalmentDays} days.`;
        const stored = plan.map((p) => ({ amount: toUnits(p.amount_usdc).toString(), due_date: p.due_date }));
        await q("UPDATE payment_requests SET instalments = $1 WHERE id = $2", [JSON.stringify(stored), r.id]);
        const lines = plan.map((p) => `• ${p.amount_usdc} USDC by ${p.due_date}`).join("\n");
        const text = `${message}\n\n${lines}\n\nPay here: ${ctx.appUrl}/pay/${r.id}`;
        const results: string[] = [];
        for (const ch of channels.filter((c) => settings.chaseChannels.includes(c)))
          results.push(await recordChase(r, ch, text, `Payment plan for invoice ${r.invoice_no}`));
        await logDecision(bid, "instalment", `Offered ${r.customer_name} ${plan.length} instalments on invoice ${r.invoice_no}`, reason, {
          requestId: r.id,
          plan: stored,
          results,
        });
        return `Plan saved. ${results.join("; ") || "No channel was available to send it."}`;
      },
    }),
    betaZodTool({
      name: "note",
      description: "Record a decision to do nothing, or something the owner should know, in the decision log.",
      inputSchema: z.object({ summary: z.string(), reason }),
      run: async ({ summary, reason }) => {
        await logDecision(bid, "note", summary, reason);
        return "Noted.";
      },
    }),
  ].map((t) => ({ ...t, strict: true }));
}
