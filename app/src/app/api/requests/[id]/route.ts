import { z } from "zod";
import { body, handler, HttpError, requireBusiness } from "@/lib/api";
import { one, q } from "@/lib/db";
import { logDecision } from "@/lib/decisions";
import { fromUnits, toUnits } from "@/lib/money";
import { EDIT_WINDOW_HOURS } from "@/lib/invoices";
import { applyPayment, syncIncoming } from "@/agent/incoming";

const Input = z.discriminatedUnion("action", [
  z.object({ action: z.literal("cancel") }),
  z.object({ action: z.literal("match"), payment_id: z.string() }),
  z.object({
    action: z.literal("edit"),
    customer_id: z.string(),
    invoice_no: z.string().trim().min(1).max(64),
    description: z.string().max(500).optional(),
    amount: z.string(),
    due_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  }),
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
  if (input.action === "edit") {
    const c = await one("SELECT id FROM customers WHERE id = $1 AND business_id = $2", [input.customer_id, b.id]);
    if (!c) throw new HttpError(404, "Customer not found.");
    const amount = toUnits(input.amount);
    if (amount <= 0n) throw new HttpError(400, "Amount must be more than zero.");
    const clash = await one("SELECT 1 FROM payment_requests WHERE business_id = $1 AND invoice_no = $2 AND id <> $3", [b.id, input.invoice_no, id]);
    if (clash) throw new HttpError(409, `You already have an invoice numbered ${input.invoice_no}.`);
    // Look for money that has just arrived first, so an invoice the customer already paid can't be edited.
    if (b.vault_address) await syncIncoming(b).catch(() => {});
    const waiting = await one(
      `SELECT 1 FROM payments_in p JOIN payment_requests r ON r.id = $1 AND r.business_id = p.business_id
       WHERE p.business_id = $2 AND p.request_id IS NULL AND p.created_at >= r.created_at AND p.amount = r.amount
         AND lower(p.from_address) <> lower($3)`,
      [id, b.id, b.owner_address],
    );
    if (waiting) throw new HttpError(409, "A payment of this amount has arrived and isn't matched to an invoice yet, so this invoice can't be edited.");
    // One update with every condition in it, so the rule holds even if a payment arrives at the same moment.
    const before = await one<any>("SELECT invoice_no, amount::text, due_date FROM payment_requests WHERE id = $1 AND business_id = $2", [id, b.id]);
    const rows = await q(
      `UPDATE payment_requests SET customer_id = $1, invoice_no = $2, description = $3, amount = $4, due_date = $5
       WHERE id = $6 AND business_id = $7 AND status = 'open' AND paid_amount = 0 AND instalments IS NULL
         AND created_at > now() - make_interval(hours => $8::int)
         AND NOT EXISTS (SELECT 1 FROM payments_in p WHERE p.request_id = $6)
       RETURNING id`,
      [input.customer_id, input.invoice_no, input.description || null, amount.toString(), input.due_date, id, b.id, EDIT_WINDOW_HOURS],
    );
    if (!rows.length) throw new HttpError(409, `This invoice can't be edited any more. Invoices can only be edited for ${EDIT_WINDOW_HOURS} hours after they're made, before anything is paid.`);
    await logDecision(
      b.id,
      "note",
      `You edited invoice ${before?.invoice_no ?? input.invoice_no}`,
      `Now: invoice ${input.invoice_no}, ${fromUnits(amount)} USDC, due ${input.due_date}. Before: ${before ? `${fromUnits(before.amount)} USDC, due ${String(before.due_date).slice(0, 10)}` : "unknown"}.`,
      { requestId: id },
    );
    return { ok: true };
  }
  return { result: await applyPayment(b.id, input.payment_id, id, "Matched by you.", "owner") };
});
