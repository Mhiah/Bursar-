import { getAddress, isAddress } from "viem";
import { billChecks, billRef, normaliseInvoiceNo } from "./bills";
import { newId, one, q } from "./db";
import { logDecision } from "./decisions";
import { fromUnits, toUnits } from "./money";
import { looksAlike, sanctionsCheck } from "./screening";
import type { Business } from "./session";

/**
 * Many invoices or bills at once, from a spreadsheet or from a business's own AI or software
 * (the MCP connection). Both go through here, so they get the same checks as adding one by hand:
 * no invoice number twice, no bill paid twice, new supplier wallets checked against sanctions
 * lists and lookalikes, and a supplier's saved wallet can never be changed by an import.
 */

export const MAX_ROWS = 500;

/** A problem with the whole import, safe to show as is. */
export class ImportError extends Error {}

export type InvoiceIn = {
  customer: string;
  customer_email?: string;
  customer_wallet?: string;
  invoice_no: string;
  amount: string | number;
  due_date: string;
  description?: string;
};

export type BillIn = {
  supplier: string;
  supplier_wallet?: string;
  supplier_email?: string;
  invoice_no: string;
  amount: string | number;
  due_date: string;
  expected_amount?: string | number;
  category?: string;
  description?: string;
};

export type Kind = "invoices" | "bills";

export type RowResult = {
  /** 1 = the first row after the headings. */
  row: number;
  ok: boolean;
  /** Customer or supplier name. */
  who: string;
  invoice_no: string;
  amount: string | null;
  due_date: string | null;
  /** Why the row can't be added. */
  problem?: string;
  /** Things worth knowing that don't stop it, like "New customer". */
  notes: string[];
  id?: string;
};

export type ImportResult = { kind: Kind; created: number; skipped: number; rows: RowResult[] };

const text = (v: unknown) => (v == null ? "" : String(v).trim());
const key = (s: string) => s.trim().toLowerCase().replace(/\s+/g, " ");
const isEmail = (s: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s);

/** "1,250.50", "$12", "12.5 USDC" -> units. */
function amountOf(v: unknown): bigint | null {
  if (typeof v === "number") {
    if (!Number.isFinite(v) || v < 0) return null;
    v = v.toFixed(6);
  }
  let s = text(v).replace(/usdc|usd|\$|\s/gi, "");
  // Commas only as thousands separators ("1,250.50"), so "12,50" is never read as 1250.
  if (s.includes(",")) {
    if (!/^\d{1,3}(,\d{3})+(\.\d+)?$/.test(s)) return null;
    s = s.replace(/,/g, "");
  }
  if (!s) return null;
  try {
    return toUnits(s);
  } catch {
    return null;
  }
}

/** "2026-12-01", "2026/12/01", "1/12/2026" or "1/12/26" (day first) or a full date-time -> "2026-12-01". */
export function dateOf(v: unknown): string | null {
  const s = text(v);
  let y: number, m: number, d: number;
  let hit = s.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})(?:[T ].*)?$/);
  if (hit) [y, m, d] = [+hit[1], +hit[2], +hit[3]];
  else if ((hit = s.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{4}|\d{2})$/))) [d, m, y] = [+hit[1], +hit[2], hit[3].length === 2 ? 2000 + +hit[3] : +hit[3]];
  else return null;
  const t = new Date(Date.UTC(y, m - 1, d));
  if (t.getUTCFullYear() !== y || t.getUTCMonth() !== m - 1 || t.getUTCDate() !== d) return null;
  return t.toISOString().slice(0, 10);
}

// Spreadsheet headings people are likely to use, for each field.
const HEADINGS: Record<Kind, Record<string, string[]>> = {
  invoices: {
    customer: ["customer", "customername", "client", "clientname", "name"],
    customer_email: ["email", "customeremail", "clientemail"],
    customer_wallet: ["wallet", "customerwallet", "walletaddress"],
    invoice_no: ["invoiceno", "invoicenumber", "invoice", "invoiceid", "ref", "reference"],
    amount: ["amount", "amountusdc", "total", "price"],
    due_date: ["due", "duedate", "dueon"],
    description: ["whatfor", "description", "details", "item", "items", "note", "notes"],
  },
  bills: {
    supplier: ["supplier", "suppliername", "vendor", "vendorname", "name"],
    supplier_wallet: ["supplierwallet", "wallet", "walletaddress", "vendorwallet"],
    supplier_email: ["supplieremail", "email", "vendoremail"],
    invoice_no: ["theirinvoiceno", "invoiceno", "invoicenumber", "invoice", "billno", "ref", "reference"],
    amount: ["amount", "amountusdc", "total"],
    due_date: ["due", "duedate", "dueon"],
    expected_amount: ["agreedamount", "expectedamount", "quote", "orderamount"],
    category: ["budgetcategory", "category"],
    description: ["whatfor", "description", "details", "item", "items", "note", "notes"],
  },
};

/** Spreadsheet rows (heading -> cell) to fields, matching headings loosely. */
export function fromSheet(kind: Kind, records: Record<string, unknown>[]): Record<string, unknown>[] {
  const fields = HEADINGS[kind];
  return records.map((rec) => {
    const out: Record<string, unknown> = {};
    const cells = Object.entries(rec).map(([h, v]) => [h.toLowerCase().replace(/[^a-z]/g, ""), v] as const);
    for (const [field, names] of Object.entries(fields)) {
      for (const n of names) {
        const cell = cells.find(([h]) => h === n || h === n + "usdc");
        if (cell && text(cell[1]) !== "") {
          out[field] = cell[1];
          break;
        }
      }
    }
    return out;
  });
}

function base(i: number, r: Record<string, unknown>, who: string): RowResult {
  return { row: i + 1, ok: false, who, invoice_no: text(r.invoice_no), amount: null, due_date: null, notes: [] };
}

// ---------- invoices

type InvoicePlan = RowResult & { customerId?: string; newCustomer?: { name: string; email: string | null; wallet: string | null }; units?: bigint; description?: string };

async function planInvoices(b: Business, rows: Record<string, unknown>[]): Promise<InvoicePlan[]> {
  const customers = await q<{ id: string; name: string }>("SELECT id, name FROM customers WHERE business_id = $1", [b.id]);
  const taken = new Set((await q<{ invoice_no: string }>("SELECT invoice_no FROM payment_requests WHERE business_id = $1", [b.id])).map((r) => normaliseInvoiceNo(r.invoice_no)));
  const inFile = new Map<string, number>();
  return rows.map((r, i) => {
    const name = text(r.customer);
    const p: InvoicePlan = base(i, r, name);
    const no = p.invoice_no;
    const units = amountOf(r.amount);
    const due = dateOf(r.due_date);
    const email = text(r.customer_email);
    const wallet = text(r.customer_wallet);
    p.amount = units != null ? fromUnits(units) : text(r.amount) || null;
    p.due_date = due ?? (text(r.due_date) || null);
    const fail = (why: string) => ((p.problem = why), p);

    if (!name) return fail("No customer name.");
    if (name.length > 120) return fail("Customer name is too long.");
    if (!no) return fail("No invoice number.");
    if (no.length > 64) return fail("Invoice number is too long.");
    if (units == null) return fail("Amount isn't a number.");
    if (units <= 0n) return fail("Amount must be more than zero.");
    if (!due) return fail("Due date isn't a date.");
    if (email && !isEmail(email)) return fail("Customer email doesn't look right.");
    if (wallet && !isAddress(wallet)) return fail("Customer wallet isn't a wallet address.");
    const n = normaliseInvoiceNo(no);
    if (taken.has(n)) return fail(`Invoice ${no} already exists.`);
    if (inFile.has(n)) return fail(`Invoice ${no} is also on row ${inFile.get(n)}.`);
    const matches = customers.filter((c) => key(c.name) === key(name));
    if (matches.length > 1) return fail(`You have ${matches.length} customers called ${name}. Add this one by hand.`);
    if (matches.length) {
      p.customerId = matches[0].id;
      p.who = matches[0].name;
    } else {
      p.newCustomer = { name, email: email || null, wallet: wallet ? getAddress(wallet) : null };
      p.notes.push("New customer");
    }
    inFile.set(n, p.row);
    p.units = units;
    p.description = text(r.description).slice(0, 500) || undefined;
    p.ok = true;
    return p;
  });
}

// ---------- bills

type BillPlan = RowResult & {
  supplierId?: string;
  newSupplier?: { name: string; email: string | null; wallet: string; category: string };
  units?: bigint;
  expected?: bigint | null;
  category?: string;
  description?: string;
};

async function planBills(b: Business, rows: Record<string, unknown>[]): Promise<BillPlan[]> {
  const suppliers = await q<{ id: string; name: string; wallet_address: string; category: string }>(
    "SELECT id, name, wallet_address, category FROM suppliers WHERE business_id = $1",
    [b.id],
  );
  const refs = new Set((await q<{ ref: string }>("SELECT ref FROM bills WHERE business_id = $1", [b.id])).map((r) => r.ref));
  const inFile = new Map<string, number>();
  // New suppliers in this file, by name, so every row for one gets the same wallet.
  const fresh = new Map<string, { wallet: string; row: number }>();
  const screened = new Map<string, Awaited<ReturnType<typeof sanctionsCheck>>>();
  const out: BillPlan[] = [];

  for (const [i, r] of rows.entries()) {
    const name = text(r.supplier);
    const p: BillPlan = base(i, r, name);
    out.push(p);
    const no = p.invoice_no;
    const units = amountOf(r.amount);
    const due = dateOf(r.due_date);
    const wallet = text(r.supplier_wallet);
    const email = text(r.supplier_email);
    const expectedRaw = text(r.expected_amount);
    const expected = expectedRaw ? amountOf(r.expected_amount) : null;
    const category = text(r.category).toLowerCase();
    p.amount = units != null ? fromUnits(units) : text(r.amount) || null;
    p.due_date = due ?? (text(r.due_date) || null);
    const fail = (why: string) => void (p.problem = why);

    if (!name) { fail("No supplier name."); continue; }
    if (name.length > 120) { fail("Supplier name is too long."); continue; }
    if (!no) { fail("No invoice number."); continue; }
    if (no.length > 64) { fail("Invoice number is too long."); continue; }
    if (units == null) { fail("Amount isn't a number."); continue; }
    if (units <= 0n) { fail("Amount must be more than zero."); continue; }
    if (!due) { fail("Due date isn't a date."); continue; }
    if (expectedRaw && expected == null) { fail("Agreed amount isn't a number."); continue; }
    if (category.length > 31) { fail("Budget category is too long."); continue; }
    if (wallet && !isAddress(wallet)) { fail("Supplier wallet isn't a wallet address."); continue; }
    if (email && !isEmail(email)) { fail("Supplier email doesn't look right."); continue; }

    const matches = suppliers.filter((s) => key(s.name) === key(name));
    if (matches.length > 1) { fail(`You have ${matches.length} suppliers called ${name}. Add this one by hand.`); continue; }
    let supplierKey: string;
    if (matches.length) {
      const s = matches[0];
      // An import can never point a supplier's money somewhere else.
      if (wallet && getAddress(wallet) !== getAddress(s.wallet_address)) {
        fail(`That isn't the wallet saved for ${s.name}. If they changed it, change it on the Suppliers page first.`);
        continue;
      }
      p.supplierId = s.id;
      p.who = s.name;
      p.category = category || s.category;
      supplierKey = s.id;
    } else {
      if (!wallet) { fail(`${name} is a new supplier. Add their wallet so they can be paid.`); continue; }
      const w = getAddress(wallet);
      const seen = fresh.get(key(name));
      if (seen && seen.wallet !== w) { fail(`${name} has a different wallet on row ${seen.row}.`); continue; }
      const twin = suppliers.find((s) => looksAlike(s.wallet_address, w));
      if (twin) { fail(`This wallet looks like ${twin.name}'s but isn't the same. Check it with them and add this supplier by hand.`); continue; }
      const same = suppliers.find((s) => getAddress(s.wallet_address) === w);
      if (same) { fail(`That wallet belongs to ${same.name}. Use that name.`); continue; }
      if (!screened.has(w)) screened.set(w, await sanctionsCheck(w));
      const sc = screened.get(w)!;
      if (sc.status === "blocked") { fail(`${name}'s wallet is blocked: ${sc.reasons.map((x) => x.detail).join(" ")}`); continue; }
      if (!seen) fresh.set(key(name), { wallet: w, row: p.row });
      p.newSupplier = { name, email: email || null, wallet: w, category: category || "suppliers" };
      p.category = category || "suppliers";
      p.notes.push("New supplier: approve their wallet on the Suppliers page before the agent can pay");
      if (sc.status === "review") p.notes.push("Sanctions list couldn't be checked just now");
      supplierKey = `new:${key(name)}`;
    }
    const dupKey = `${supplierKey}:${normaliseInvoiceNo(no)}`;
    if (p.supplierId && refs.has(billRef(b.id, p.supplierId, no))) { fail(`${p.who} already sent invoice ${no}. It won't be paid twice.`); continue; }
    if (inFile.has(dupKey)) { fail(`The same bill is also on row ${inFile.get(dupKey)}.`); continue; }
    inFile.set(dupKey, p.row);
    p.units = units;
    p.expected = expected;
    p.description = text(r.description).slice(0, 500) || undefined;
    p.ok = true;
  }
  return out;
}

const clean = (rows: (InvoicePlan | BillPlan)[]): RowResult[] =>
  rows.map(({ row, ok, who, invoice_no, amount, due_date, problem, notes, id }) => ({ row, ok, who, invoice_no, amount, due_date, problem, notes, id }));

function guard(b: Business, kind: Kind, rows: unknown[]) {
  if (kind === "invoices" && !b.vault_address) throw new ImportError("Create your vault first; payments go straight into it.");
  if (!rows.length) throw new ImportError("There are no rows to add.");
  if (rows.length > MAX_ROWS) throw new ImportError(`That's ${rows.length} rows. Add at most ${MAX_ROWS} at a time.`);
}

/** What would happen, without adding anything. */
export async function checkImport(b: Business, kind: Kind, rows: Record<string, unknown>[]): Promise<ImportResult> {
  guard(b, kind, rows);
  const plan = kind === "invoices" ? await planInvoices(b, rows) : await planBills(b, rows);
  const ok = plan.filter((p) => p.ok).length;
  return { kind, created: 0, skipped: plan.length - ok, rows: clean(plan) };
}

/** Adds every row that passes the checks and skips the rest. `via` says where they came from, for the decision log. */
export async function runImport(b: Business, kind: Kind, rows: Record<string, unknown>[], via: string): Promise<ImportResult> {
  guard(b, kind, rows);
  const plan = kind === "invoices" ? await createInvoices(b, await planInvoices(b, rows)) : await createBills(b, await planBills(b, rows));
  const done = plan.filter((p) => p.id);
  const skipped = plan.length - done.length;
  if (done.length) {
    const newOnes = plan.flatMap((p: any) => (p.id && (p.newCustomer || p.newSupplier) ? [p.who] : []));
    const fresh = [...new Set(newOnes)];
    const total = done.reduce((s, p: any) => s + (p.units as bigint), 0n);
    const what = kind === "invoices" ? "invoice" : "bill";
    await logDecision(
      b.id,
      "note",
      `${done.length} ${what}${done.length === 1 ? "" : "s"} added from ${via}`,
      [
        `${fromUnits(total)} USDC in total.`,
        fresh.length ? `New ${kind === "invoices" ? "customers" : "suppliers"}: ${fresh.join(", ")}.` : "",
        kind === "bills" && fresh.length ? "New suppliers can't be paid until you approve their wallets on your vault." : "",
        skipped ? `${skipped} row${skipped === 1 ? " was" : "s were"} skipped.` : "",
      ].filter(Boolean).join(" "),
      { via, kind, items: done.map((p) => ({ id: p.id, invoice_no: p.invoice_no, who: p.who, amount: p.amount })) },
    );
  }
  return { kind, created: done.length, skipped, rows: clean(plan) };
}

async function createInvoices(b: Business, plan: InvoicePlan[]) {
  const made = new Map<string, string>();
  for (const p of plan) {
    if (!p.ok) continue;
    try {
      let customerId = p.customerId;
      if (!customerId && p.newCustomer) {
        const k = key(p.newCustomer.name);
        customerId = made.get(k);
        if (!customerId) {
          customerId = newId();
          const c = p.newCustomer;
          await q("INSERT INTO customers (id, business_id, name, email, wallet_address) VALUES ($1,$2,$3,$4,$5)", [customerId, b.id, c.name, c.email, c.wallet]);
          made.set(k, customerId);
          // Check their wallet as it's added, like one added by hand.
          const sc = c.wallet ? await sanctionsCheck(c.wallet) : null;
          if (sc?.status === "blocked")
            await logDecision(b.id, "attention", `${c.name}'s wallet is on a sanctions list`, `${sc.reasons.map((r) => r.detail).join(" ")} Payments from it will be flagged.`, { wallet: c.wallet, screening: sc });
        }
      }
      const id = newId();
      const row = await one(
        `INSERT INTO payment_requests (id, business_id, customer_id, invoice_no, description, amount, due_date)
         VALUES ($1,$2,$3,$4,$5,$6,$7) ON CONFLICT (business_id, invoice_no) DO NOTHING RETURNING id`,
        [id, b.id, customerId, p.invoice_no, p.description ?? null, p.units!.toString(), p.due_date],
      );
      if (row) p.id = id;
      else ((p.ok = false), (p.problem = `Invoice ${p.invoice_no} already exists.`));
    } catch (e) {
      p.ok = false;
      p.problem = "Couldn't be added. Try this row again.";
      console.error(e);
    }
  }
  return plan;
}

async function createBills(b: Business, plan: BillPlan[]) {
  const made = new Map<string, string>();
  for (const p of plan) {
    if (!p.ok) continue;
    try {
      let supplierId = p.supplierId;
      if (!supplierId && p.newSupplier) {
        const k = key(p.newSupplier.name);
        supplierId = made.get(k);
        if (!supplierId) {
          supplierId = newId();
          const s = p.newSupplier;
          await q("INSERT INTO suppliers (id, business_id, name, email, wallet_address, category) VALUES ($1,$2,$3,$4,$5,$6)", [supplierId, b.id, s.name, s.email, s.wallet, s.category]);
          made.set(k, supplierId);
        }
      }
      const id = newId();
      const ref = billRef(b.id, supplierId!, p.invoice_no);
      const row = await one(
        `INSERT INTO bills (id, business_id, supplier_id, invoice_no, description, amount, expected_amount, category, due_date, ref)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) ON CONFLICT (business_id, ref) DO NOTHING RETURNING id`,
        [id, b.id, supplierId, p.invoice_no, p.description ?? null, p.units!.toString(), p.expected?.toString() ?? null, p.category, p.due_date, ref],
      );
      if (!row) {
        p.ok = false;
        p.problem = `${p.who} already sent invoice ${p.invoice_no}. It won't be paid twice.`;
        continue;
      }
      p.id = id;
      const flags = await billChecks({ id, business_id: b.id, supplier_id: supplierId!, invoice_no: p.invoice_no, amount: p.units!, expected_amount: p.expected?.toString() });
      await q("UPDATE bills SET flags = $1 WHERE id = $2", [JSON.stringify(flags), id]);
      if (flags.length) p.notes.push(`Checks: ${flags.map((f) => f.detail).join(" ")} The agent will ask you before paying it.`);
    } catch (e) {
      p.ok = false;
      p.problem = "Couldn't be added. Try this row again.";
      console.error(e);
    }
  }
  return plan;
}
