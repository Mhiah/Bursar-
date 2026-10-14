"use client";

import { useState } from "react";
import { api, Field, Money, Notice, Status, TxLink, useAction, useApi } from "@/components/ui";

const empty = { supplier_id: "", invoice_no: "", amount: "", expected_amount: "", due_date: "", category: "", description: "" };

export default function Bills() {
  const bills = useApi<{ bills: any[] }>("/api/bills");
  const suppliers = useApi<{ suppliers: any[] }>("/api/suppliers");
  const [form, setForm] = useState(empty);
  const [flags, setFlags] = useState<any[] | null>(null);
  const add = useAction();
  const set = (k: keyof typeof empty) => (e: any) => setForm({ ...form, [k]: e.target.value });

  return (
    <div className="space-y-8">
      <h1 className="h-page">Bills</h1>
      <section className="card space-y-4">
        <h2 className="h-section">Add a bill</h2>
        {suppliers.data && !suppliers.data.suppliers.length && <Notice>Add the supplier first on the Suppliers page.</Notice>}
        <div className="grid gap-3 md:grid-cols-4">
          <Field label="Supplier">
            <select className="input" value={form.supplier_id} onChange={set("supplier_id")}>
              <option value="">Choose…</option>
              {suppliers.data?.suppliers.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          </Field>
          <Field label="Their invoice no."><input className="input" value={form.invoice_no} onChange={set("invoice_no")} /></Field>
          <Field label="Amount (USDC)"><input className="input" inputMode="decimal" value={form.amount} onChange={set("amount")} /></Field>
          <Field label="Due"><input className="input" type="date" value={form.due_date} onChange={set("due_date")} /></Field>
          <Field label="Agreed amount (optional)" hint="From the quote or order. A mismatch gets flagged."><input className="input" inputMode="decimal" value={form.expected_amount} onChange={set("expected_amount")} /></Field>
          <Field label="Budget category" hint="Leave blank to use the supplier's."><input className="input" value={form.category} onChange={set("category")} /></Field>
          <Field label="What for"><input className="input" value={form.description} onChange={set("description")} /></Field>
        </div>
        <button
          className="btn"
          disabled={add.busy}
          onClick={() =>
            add.run(async () => {
              const r = await api("/api/bills", { method: "POST", json: form });
              setFlags(r.flags);
              setForm(empty);
              await bills.reload();
            })
          }
        >
          Add bill
        </button>
        {add.error && <Notice kind="bad">{add.error}</Notice>}
        {flags && (flags.length ? (
          <Notice kind="warn">Added, with checks to look at: {flags.map((f) => f.detail).join(" ")} The agent will ask you before paying it.</Notice>
        ) : (
          <Notice kind="ok">Added. No problems found; the agent will handle it.</Notice>
        ))}
      </section>
      <section className="card overflow-x-auto">
        <table className="table">
          <thead><tr><th>Supplier</th><th>Invoice</th><th>Amount</th><th>Due</th><th>Status</th><th>Checks</th></tr></thead>
          <tbody>
            {bills.data?.bills.map((b) => (
              <tr key={b.id}>
                <td>{b.supplier_name}<p className="text-xs text-ink">{b.category}</p></td>
                <td>{b.invoice_no}</td>
                <td><Money value={b.amount} /></td>
                <td>{b.due_date}{b.pay_after && b.status === "held" && <p className="text-xs text-ink">holding until {b.pay_after}</p>}</td>
                <td><Status value={b.status} />{b.paid_tx && <p><TxLink hash={b.paid_tx} /></p>}</td>
                <td className="max-w-xs text-xs text-ink">{b.flags?.length ? b.flags.map((f: any) => f.detail).join(" ") : "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {!bills.data?.bills.length && <p className="pt-3 text-sm text-ink">No bills yet.</p>}
      </section>
    </div>
  );
}
