import { handler, requireBusiness } from "@/lib/api";
import { one } from "@/lib/db";
import { fromUnits } from "@/lib/money";

export const dynamic = "force-dynamic";

/** The agent's record for this business, counted from what actually happened. */
export const GET = handler(async () => {
  const b = await requireBusiness();
  const n = (v: unknown) => Number(v ?? 0);
  const money = await one<{ received: string; paid_out: string; saved: string }>(
    `SELECT
       (SELECT COALESCE(sum(amount), 0) FROM payments_in WHERE business_id = $1)::text AS received,
       (SELECT COALESCE(sum(amount), 0) FROM bills WHERE business_id = $1 AND status = 'paid')::text AS paid_out,
       (SELECT COALESCE(sum(amount), 0) FROM savings_moves WHERE business_id = $1 AND status = 'done')::text AS saved`,
    [b.id],
  );
  const bills = await one<any>(
    `SELECT
       count(*) FILTER (WHERE status = 'paid') AS paid,
       count(*) FILTER (WHERE status = 'paid' AND approval_id IS NULL AND paid_at::date <= due_date) AS on_time_by_agent,
       count(*) FILTER (WHERE approval_id IS NOT NULL AND status = 'paid') AS you_approved,
       count(*) FILTER (WHERE approval_id IS NOT NULL AND status = 'rejected') AS you_rejected
     FROM bills WHERE business_id = $1`,
    [b.id],
  );
  const decisions = await one<any>(
    `SELECT
       count(*) FILTER (WHERE kind IN ('pay','early_pay','hold','reserve','release','chase','instalment','match','save','block')) AS by_agent,
       count(*) FILTER (WHERE kind IN ('approval','attention')) AS passed_to_you
     FROM decisions WHERE business_id = $1`,
    [b.id],
  );
  const chases = await one<any>("SELECT count(*) FILTER (WHERE status = 'sent') AS sent FROM chases WHERE business_id = $1", [b.id]);
  const decided = n(bills.you_approved) + n(bills.you_rejected);
  return {
    received: fromUnits(money!.received),
    paidOut: fromUnits(money!.paid_out),
    saved: fromUnits(money!.saved),
    billsPaid: n(bills.paid),
    billsOnTimeByAgent: n(bills.on_time_by_agent),
    decisionsByAgent: n(decisions.by_agent),
    passedToYou: n(decisions.passed_to_you),
    youAgreed: decided ? Math.round((n(bills.you_approved) / decided) * 100) : null,
    youDecided: decided,
    remindersSent: n(chases.sent),
  };
});
