import { parseUnits } from "viem";
import { z } from "zod";
import { body, handler, HttpError, requireBusiness } from "@/lib/api";
import { q } from "@/lib/db";
import type { SavingsPlans } from "@/lib/session";

const Input = z.object({
  autoSave: z.object({ pot: z.number().int().min(0), amount: z.string().regex(/^\d+(\.\d{1,6})?$/), every: z.enum(["day", "week", "month"]) }).nullable().optional(),
  whenPaid: z.object({ pot: z.number().int().min(0), percent: z.number().min(0).max(100) }).nullable().optional(),
});

/** AutoSave and Save when paid. Kept by Bursar; the vault's savings budget is what caps them. */
export const POST = handler(async (req: Request) => {
  const b = await requireBusiness();
  if (!b.savings_address) throw new HttpError(400, "Open your savings account first.");
  const input = await body(req, Input);
  const plans: SavingsPlans = { ...(b.savings_plans ?? {}) };
  const now = new Date().toISOString();
  if (input.autoSave !== undefined) {
    const old = plans.autoSave;
    plans.autoSave = input.autoSave && {
      ...input.autoSave,
      amount: parseUnits(input.autoSave.amount, 6).toString(),
      // Keep the schedule when only the amount or pot changes; start now otherwise.
      nextAt: old && old.every === input.autoSave.every ? old.nextAt : now,
    };
  }
  if (input.whenPaid !== undefined) {
    // Only payments from now on count, so turning it on doesn't save old payments.
    plans.whenPaid = input.whenPaid && { ...input.whenPaid, since: plans.whenPaid?.since ?? now };
  }
  await q("UPDATE businesses SET savings_plans = $1 WHERE id = $2", [JSON.stringify(plans), b.id]);
  return { plans };
});
