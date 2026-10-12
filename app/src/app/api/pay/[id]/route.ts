import { handler, HttpError } from "@/lib/api";
import { one } from "@/lib/db";
import { fromUnits } from "@/lib/money";

export const dynamic = "force-dynamic";

/** Public: what a customer needs to pay an invoice. Nothing private about the business. */
export const GET = handler(async (_req: Request, { params }: { params: { id: string } }) => {
  const r = await one<any>(
    `SELECT r.id, r.invoice_no, r.description, r.amount, r.paid_amount, r.due_date, r.status, r.instalments,
            b.name AS business, b.vault_address, c.name AS customer
     FROM payment_requests r JOIN businesses b ON b.id = r.business_id JOIN customers c ON c.id = r.customer_id
     WHERE r.id = $1`,
    [params.id],
  );
  if (!r) throw new HttpError(404, "This payment link isn't valid.");
  const outstanding = BigInt(r.amount) - BigInt(r.paid_amount);
  const next = r.instalments?.[0];
  return {
    id: r.id,
    business: r.business,
    customer: r.customer,
    invoiceNo: r.invoice_no,
    description: r.description,
    amount: fromUnits(r.amount),
    outstanding: fromUnits(outstanding > 0n ? outstanding : 0n),
    dueDate: String(r.due_date).slice(0, 10),
    status: r.status,
    payTo: r.vault_address,
    nextInstalment: next && r.status !== "paid" ? { amount: fromUnits(next.amount), dueDate: next.due_date } : null,
  };
});
