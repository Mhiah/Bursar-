import { keccak256, toHex } from "viem";
import { q } from "./db";

export const normaliseInvoiceNo = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "").replace(/^0+/, "");

/** Onchain reference for a bill. The same supplier invoice always gets the same reference,
 * however it's typed, so the vault refuses to pay it twice. */
export const billRef = (businessId: string, supplierId: string, invoiceNo: string) =>
  keccak256(toHex(`bursar:${businessId}:${supplierId}:${normaliseInvoiceNo(invoiceNo)}`));

export { categoryKey } from "./category";

export type Flag = { code: string; detail: string };

type BillRow = { id: string; supplier_id: string; invoice_no: string; amount: string; created_at: string; status: string };

/**
 * Checks on a new or waiting bill: possible duplicates, a mismatch with the expected
 * (purchase order) amount, and an amount far above what this supplier normally charges.
 */
export async function billChecks(bill: {
  id: string;
  business_id: string;
  supplier_id: string;
  invoice_no: string;
  amount: string | bigint;
  expected_amount?: string | null;
}): Promise<Flag[]> {
  const flags: Flag[] = [];
  const amount = BigInt(bill.amount);
  const others = await q<BillRow>(
    `SELECT id, supplier_id, invoice_no, amount, created_at, status FROM bills
     WHERE business_id = $1 AND supplier_id = $2 AND id <> $3 AND status <> 'rejected'`,
    [bill.business_id, bill.supplier_id, bill.id],
  );

  const sameNo = others.find((o) => normaliseInvoiceNo(o.invoice_no) === normaliseInvoiceNo(bill.invoice_no));
  if (sameNo) flags.push({ code: "duplicate_invoice_no", detail: `Same invoice number as an earlier bill (${sameNo.invoice_no}, ${sameNo.status}).` });

  const recentSameAmount = others.find(
    (o) => BigInt(o.amount) === amount && Date.now() - new Date(o.created_at).getTime() < 21 * 864e5,
  );
  if (recentSameAmount && !sameNo)
    flags.push({ code: "possible_duplicate", detail: `Same amount from the same supplier in the last 3 weeks (invoice ${recentSameAmount.invoice_no}).` });

  if (bill.expected_amount != null) {
    const expected = BigInt(bill.expected_amount);
    const diff = amount > expected ? amount - expected : expected - amount;
    if (diff * 100n > expected) flags.push({ code: "amount_mismatch", detail: `Bill doesn't match the agreed amount (expected ${Number(expected) / 1e6}).` });
  }

  const paid = others.filter((o) => o.status === "paid").map((o) => BigInt(o.amount)).sort((a, b) => (a < b ? -1 : 1));
  if (paid.length >= 3) {
    const median = paid[Math.floor(paid.length / 2)];
    if (amount > median * 3n) flags.push({ code: "unusual_amount", detail: `More than three times what this supplier usually charges.` });
  }
  return flags;
}
