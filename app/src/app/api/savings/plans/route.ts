import { z } from "zod";
import { body, handler, HttpError, requireBusiness } from "@/lib/api";
import { q } from "@/lib/db";
import type { SavingsPlans } from "@/lib/session";

const Input = z.object({
  whenPaid: z.object({ pot: z.number().int().min(0), percent: z.number().min(0).max(100) }).nullable().optional(),
});

/** Save when paid. Kept by Bursar; the vault's savings budget is what caps it. */
export const POST = handler(async (req: Request) => {
  const b = await requireBusiness();
  if (!b.savings_address) throw new HttpError(400, "Open your savings account first.");
  const input = await body(req, Input);
  const plans: SavingsPlans = { ...(b.savings_plans ?? {}) };
  const now = new Date().toISOString();
  if (input.whenPaid !== undefined) {
    // Only payments from now on count, so turning it on doesn't save old payments.
    plans.whenPaid = input.whenPaid && { ...input.whenPaid, since: plans.whenPaid?.since ?? now };
  }
  await q("UPDATE businesses SET savings_plans = $1 WHERE id = $2", [JSON.stringify(plans), b.id]);
  return { plans };
});
