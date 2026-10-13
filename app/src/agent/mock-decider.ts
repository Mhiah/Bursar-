import type { Decider } from "./run";

/**
 * Test mode only: a pretend AI that follows the same rules the real one is given, so the
 * agent can be tried with fake money without paying for AI calls. Every action still goes
 * through the real tools and the vault's rules.
 */
export const mockDecider: Decider = async ({ prompt, tools }) => {
  const s = JSON.parse(prompt.slice(prompt.indexOf("{")));
  const call = async (name: string, input: unknown) => String(await tools.find((t) => t.name === name)!.run(input as never));
  const done: string[] = [];

  for (const b of s.bills_to_handle ?? []) {
    const risky = b.vault_would_refuse || b.flags?.length || (b.wallet_check?.status && b.wallet_check.status !== "clear");
    if (risky) {
      const why = b.vault_would_refuse ? `the vault would refuse it (${b.vault_would_refuse})` : b.flags?.length ? `it has flags: ${b.flags.join(", ")}` : "the supplier's wallet needs a look";
      await call("request_approval", { bill_id: b.id, reason: `Asking you first because ${why}.` });
      done.push(`asked you about ${b.supplier}'s bill`);
    } else if (b.days_until_due <= 3) {
      const r = await call("pay_bill", { bill_id: b.id, early: false, reason: `Due in ${b.days_until_due} day(s) and cash allows it.` });
      done.push(r.startsWith("Paid") ? `paid ${b.supplier} ${b.amount_usdc} USDC` : `couldn't pay ${b.supplier}: ${r}`);
    }
  }

  for (const r of s.money_owed_to_business ?? []) {
    if (r.days_overdue <= 0) continue;
    if (!r.reachable_on?.length) continue;
    const firm = r.times_chased >= 2;
    await call("chase_customer", {
      request_id: r.id,
      channels: r.reachable_on,
      subject: `Invoice ${r.invoice_no} from ${s.business}`,
      message: firm
        ? `Hi ${r.customer}, invoice ${r.invoice_no} for ${r.outstanding_usdc} USDC is now ${r.days_overdue} days late. Please pay it this week.`
        : `Hi ${r.customer}, a friendly reminder that invoice ${r.invoice_no} for ${r.outstanding_usdc} USDC was due ${r.days_overdue} day(s) ago.`,
      reason: `${r.days_overdue} day(s) overdue.`,
    });
    done.push(`reminded ${r.customer} about ${r.invoice_no}`);
  }

  if (!done.length) await call("note", { summary: "Nothing needs doing right now.", reason: "No bills are due soon and nobody is late paying." });
  return { summary: `(Test AI) ${done.length ? done.join("; ") : "nothing needed doing"}.`, stop: "end_turn" };
};
