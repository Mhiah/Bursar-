import { q } from "./db";

export type Reliability = {
  score: number; // 0 (never pays) to 100 (always on time)
  paidOnTime: number;
  paidLate: number;
  avgDaysLate: number;
  overdueNow: number;
  outstanding: bigint;
  label: "reliable" | "usually late" | "risky" | "new";
};

const days = (a: Date, b: Date) => (a.getTime() - b.getTime()) / 864e5;

/** How a customer has paid this business before. Drives chase order and tone. */
export async function customerReliability(businessId: string, customerId: string): Promise<Reliability> {
  const rows = await q<{ amount: string; paid_amount: string; due_date: string; paid_at: string | null; status: string }>(
    `SELECT amount, paid_amount, due_date, paid_at, status FROM payment_requests
     WHERE business_id = $1 AND customer_id = $2 AND status <> 'cancelled'`,
    [businessId, customerId],
  );
  const now = new Date();
  let paidOnTime = 0, paidLate = 0, lateDays = 0, overdueNow = 0;
  let outstanding = 0n;
  for (const r of rows) {
    const due = new Date(r.due_date);
    if (r.status === "paid" && r.paid_at) {
      const late = days(new Date(r.paid_at), due);
      if (late > 1) { paidLate++; lateDays += late; } else paidOnTime++;
    } else {
      outstanding += BigInt(r.amount) - BigInt(r.paid_amount);
      if (due < now) overdueNow++;
    }
  }
  const settled = paidOnTime + paidLate;
  const avgDaysLate = paidLate ? lateDays / paidLate : 0;
  // No paid invoices yet: nothing to judge them on, so they're new, not risky.
  if (settled === 0) return { score: 60, paidOnTime, paidLate, avgDaysLate, overdueNow, outstanding, label: "new" };

  let score = settled ? (paidOnTime / settled) * 100 : 50;
  score -= Math.min(30, avgDaysLate);
  score -= overdueNow * 10;
  score = Math.max(0, Math.min(100, Math.round(score)));
  const label = score >= 75 ? "reliable" : score >= 45 ? "usually late" : "risky";
  return { score, paidOnTime, paidLate, avgDaysLate: Math.round(avgDaysLate * 10) / 10, overdueNow, outstanding, label };
}
