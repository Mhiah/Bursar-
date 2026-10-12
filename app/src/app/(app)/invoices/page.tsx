"use client";

import { useState } from "react";
import { api, Field, Money, Notice, Status, AddressLink, useAction, useApi } from "@/components/ui";

export default function Invoices() {
  const reqs = useApi<{ requests: any[]; unmatched: any[] }>("/api/requests");
  const customers = useApi<{ customers: any[] }>("/api/customers");
  const [form, setForm] = useState({ customer_id: "", invoice_no: "", description: "", amount: "", due_date: "" });
  const [copied, setCopied] = useState<string | null>(null);
  const add = useAction();
  const act = useAction();
  const set = (k: keyof typeof form) => (e: any) => setForm({ ...form, [k]: e.target.value });

  const link = (id: string) => `${window.location.origin}/pay/${id}`;

  return (
    <div className="space-y-8">
      <h1 className="h-page">Invoices</h1>
      <section className="card space-y-4">
        <h2 className="h-section">New invoice</h2>
        {customers.data && !customers.data.customers.length && <Notice>Add a customer first on the Customers page.</Notice>}
        <div className="grid gap-3 md:grid-cols-5">
          <Field label="Customer">
            <select className="input" value={form.customer_id} onChange={set("customer_id")}>
              <option value="">Choose…</option>
              {customers.data?.customers.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Invoice no.">
            <input className="input" value={form.invoice_no} onChange={set("invoice_no")} />
          </Field>
          <Field label="Amount (USDC)">
            <input className="input" inputMode="decimal" value={form.amount} onChange={set("amount")} />
          </Field>
          <Field label="Due">
            <input className="input" type="date" value={form.due_date} onChange={set("due_date")} />
          </Field>
          <Field label="What for">
            <input className="input" value={form.description} onChange={set("description")} />
          </Field>
        </div>
        <button
          className="btn"
          disabled={add.busy}
          onClick={() =>
            add.run(async () => {
              await api("/api/requests", { method: "POST", json: form });
              setForm({ customer_id: "", invoice_no: "", description: "", amount: "", due_date: "" });
              await reqs.reload();
            })
          }
        >
          Create invoice
        </button>
        {add.error && <Notice kind="bad">{add.error}</Notice>}
      </section>

      <section className="card overflow-x-auto">
        <table className="table">
          <thead>
            <tr>
              <th>Customer</th>
              <th>Invoice</th>
              <th>Amount</th>
              <th>Paid</th>
              <th>Due</th>
              <th>Status</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {reqs.data?.requests.map((r) => (
              <tr key={r.id}>
                <td>{r.customer_name}</td>
                <td>
                  {r.invoice_no}
                  {r.instalments && <p className="text-xs text-muted">{r.instalments.length} instalments left</p>}
                </td>
                <td><Money value={r.amount} /></td>
                <td><Money value={r.paid_amount} /></td>
                <td>{r.due_date}</td>
                <td><Status value={r.status} /></td>
                <td className="whitespace-nowrap text-right">
                  {["open", "part_paid"].includes(r.status) && (
                    <>
                      <button
                        className="text-xs text-brand"
                        onClick={() => {
                          navigator.clipboard.writeText(link(r.id));
                          setCopied(r.id);
                        }}
                      >
                        {copied === r.id ? "Copied" : "Copy pay link"}
                      </button>
                      <button
                        className="ml-3 text-xs text-muted"
                        onClick={() => act.run(async () => { await api(`/api/requests/${r.id}`, { method: "PATCH", json: { action: "cancel" } }); await reqs.reload(); })}
                      >
                        Cancel
                      </button>
                    </>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {!reqs.data?.requests.length && <p className="pt-3 text-sm text-muted">No invoices yet.</p>}
      </section>

      {!!reqs.data?.unmatched.length && (
        <section className="card space-y-3">
          <h2 className="h-section">Payments we couldn't match</h2>
          <p className="text-sm text-muted">Money arrived but it isn't clear which invoice it's for. The agent will try; you can match it yourself.</p>
          <table className="table">
            <tbody>
              {reqs.data.unmatched.map((p) => (
                <tr key={p.id}>
                  <td><Money value={p.amount} /></td>
                  <td>from <AddressLink address={p.from_address} /></td>
                  <td>{p.screening && <Status value={p.screening.status} />}</td>
                  <td className="text-right">
                    <select
                      className="input max-w-[220px]"
                      defaultValue=""
                      onChange={(e) =>
                        e.target.value &&
                        act.run(async () => {
                          await api(`/api/requests/${e.target.value}`, { method: "PATCH", json: { action: "match", payment_id: p.id } });
                          await reqs.reload();
                        })
                      }
                    >
                      <option value="">Match to invoice…</option>
                      {reqs.data!.requests
                        .filter((r) => ["open", "part_paid"].includes(r.status))
                        .map((r) => (
                          <option key={r.id} value={r.id}>
                            {r.invoice_no} · {r.customer_name}
                          </option>
                        ))}
                    </select>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}
      {act.error && <Notice kind="bad">{act.error}</Notice>}
    </div>
  );
}
