import { z } from "zod";
import { body, handler, HttpError, requireBusiness } from "@/lib/api";
import { q } from "@/lib/db";
import { applyPayment } from "@/agent/incoming";

const Input = z.discriminatedUnion("action", [
  z.object({ action: z.literal("cancel") }),
  z.object({ action: z.literal("match"), payment_id: z.string() }),
]);

export const PATCH = handler(async (req: Request, { params }: { params: Promise<{ id: string }> }) => {
  const { id } = await params;
  const b = await requireBusiness();
  const input = await body(req, Input);
  if (input.action === "cancel") {
    const rows = await q("UPDATE payment_requests SET status = 'cancelled' WHERE id = $1 AND business_id = $2 AND status IN ('open','part_paid') RETURNING id", [
      id,
      b.id,
    ]);
    if (!rows.length) throw new HttpError(404, "No open request with that id.");
    return { ok: true };
  }
  return { result: await applyPayment(b.id, input.payment_id, id, "Matched by you.") };
});
