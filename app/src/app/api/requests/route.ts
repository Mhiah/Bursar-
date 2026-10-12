import { z } from "zod";
import { body, handler, HttpError, requireBusiness } from "@/lib/api";
import { newId, one, q } from "@/lib/db";
import { fromUnits, toUnits } from "@/lib/money";

export const dynamic = "force-dynamic";

export const GET = handler(async () => {
  const b = await requireBusiness();
  const rows = await q(
    `SELECT r.*, c.name AS customer_name FROM payment_requests r JOIN customers c ON c.id = r.customer_id
     WHERE r.business_id = $1 ORDER BY r.created_at DESC`,
    [b.id],
  );
  return {
    requests: rows.map((r) => ({ ...r, amount: fromUnits(r.amount), paid_amount: fromUnits(r.paid_amount) })),
    unmatched: (
      await q("SELECT id, from_address, amount, tx_hash, created_at, screening FROM payments_in WHERE business_id = $1 AND request_id IS NULL ORDER BY created_at DESC", [b.id])
    ).map((p) => ({ ...p, amount: fromUnits(p.amount) })),
  };
});

const Input = z.object({
  customer_id: z.string(),
  invoice_no: z.string().trim().min(1).max(64),
  description: z.string().max(500).optional(),
  amount: z.string(),
  due_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
});

export const POST = handler(async (req: Request) => {
  const b = await requireBusiness();
  if (!b.vault_address) throw new HttpError(400, "Create your vault first; payments go straight into it.");
  const r = await body(req, Input);
  const c = await one("SELECT id FROM customers WHERE id = $1 AND business_id = $2", [r.customer_id, b.id]);
  if (!c) throw new HttpError(404, "Customer not found.");
  const amount = toUnits(r.amount);
  if (amount <= 0n) throw new HttpError(400, "Amount must be more than zero.");
  const id = newId();
  await q(
    "INSERT INTO payment_requests (id, business_id, customer_id, invoice_no, description, amount, due_date) VALUES ($1,$2,$3,$4,$5,$6,$7)",
    [id, b.id, r.customer_id, r.invoice_no, r.description || null, amount.toString(), r.due_date],
  );
  return { id };
});
