import { z } from "zod";
import { body, handler, HttpError, requireBusiness } from "@/lib/api";
import { newId, one, q } from "@/lib/db";
import { billChecks, billRef } from "@/lib/bills";
import { fromUnits, toUnits } from "@/lib/money";

export const dynamic = "force-dynamic";

export const GET = handler(async () => {
  const b = await requireBusiness();
  const rows = await q(
    `SELECT bl.*, s.name AS supplier_name, s.wallet_address FROM bills bl JOIN suppliers s ON s.id = bl.supplier_id
     WHERE bl.business_id = $1 ORDER BY bl.due_date DESC`,
    [b.id],
  );
  return { bills: rows.map((r) => ({ ...r, amount: fromUnits(r.amount), expected_amount: r.expected_amount ? fromUnits(r.expected_amount) : null })) };
});

const Input = z.object({
  supplier_id: z.string(),
  invoice_no: z.string().trim().min(1).max(64),
  description: z.string().max(500).optional(),
  amount: z.string(),
  expected_amount: z.string().optional().or(z.literal("")),
  category: z.string().trim().max(31).optional(),
  due_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
});

export const POST = handler(async (req: Request) => {
  const b = await requireBusiness();
  const r = await body(req, Input);
  const s = await one<{ category: string }>("SELECT category FROM suppliers WHERE id = $1 AND business_id = $2", [r.supplier_id, b.id]);
  if (!s) throw new HttpError(404, "Supplier not found.");
  const ref = billRef(b.id, r.supplier_id, r.invoice_no);
  const clash = await one<{ status: string }>("SELECT status FROM bills WHERE business_id = $1 AND ref = $2", [b.id, ref]);
  if (clash) throw new HttpError(409, `This supplier already sent invoice ${r.invoice_no} (${clash.status}). It won't be paid twice.`);
  const id = newId();
  const amount = toUnits(r.amount);
  const expected = r.expected_amount ? toUnits(r.expected_amount) : null;
  await q(
    `INSERT INTO bills (id, business_id, supplier_id, invoice_no, description, amount, expected_amount, category, due_date, ref)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
    [id, b.id, r.supplier_id, r.invoice_no, r.description || null, amount.toString(), expected?.toString() ?? null, (r.category || s.category).toLowerCase(), r.due_date, ref],
  );
  const flags = await billChecks({ id, business_id: b.id, supplier_id: r.supplier_id, invoice_no: r.invoice_no, amount, expected_amount: expected?.toString() });
  await q("UPDATE bills SET flags = $1 WHERE id = $2", [JSON.stringify(flags), id]);
  return { id, flags };
});
