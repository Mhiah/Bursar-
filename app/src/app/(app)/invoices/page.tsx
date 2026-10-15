"use client";

import { useEffect, useState } from "react";
import { api, Field, Money, Notice, Status, AddressLink, useAction, useApi } from "@/components/ui";

export default function Invoices() {
  const reqs = useApi<{ requests: any[]; unmatched: any[] }>("/api/requests");
  const customers = useApi<{ customers: any[] }>("/api/customers");
  const [form, setForm] = useState({ customer_id: "", invoice_no: "", description: "", amount: "", due_date: "" });
  const [copied, setCopied] = useState<string | null>(null);
  const [qr, setQr] = useState<string | null>(null);
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
                  {r.instalments && <p className="text-xs text-ink">{r.instalments.length} instalments left</p>}
                </td>
                <td><Money value={r.amount} /></td>
                <td><Money value={r.paid_amount} /></td>
                <td>{r.due_date}</td>
                <td><Status value={r.status} /></td>
                <td className="whitespace-nowrap text-right">
                  {["open", "part_paid"].includes(r.status) && (
                    <>
                      <button
                        className="text-xs text-ink"
                        onClick={() => {
                          navigator.clipboard.writeText(link(r.id));
                          setCopied(r.id);
                        }}
                      >
                        {copied === r.id ? "Copied" : "Copy pay link"}
                      </button>
                      <button className="ml-3 text-xs text-ink" onClick={() => setQr(qr === r.id ? null : r.id)}>
                        {qr === r.id ? "Hide QR code" : "QR code"}
                      </button>
                      {qr === r.id && <PayQr url={link(r.id)} invoiceNo={r.invoice_no} />}
                    </>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {!reqs.data?.requests.length && <p className="pt-3 text-sm text-ink">No invoices yet.</p>}
      </section>

      {!!reqs.data?.unmatched.length && (
        <section className="card space-y-3">
          <h2 className="h-section">Payments we couldn't match</h2>
          <p className="text-sm text-ink">Money arrived but it isn't clear which invoice it's for. The agent will try; you can match it yourself.</p>
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

/** A QR code customers can scan to open this invoice's pay page. */
function PayQr({ url, invoiceNo }: { url: string; invoiceNo: string }) {
  const [src, setSrc] = useState<string | null>(null);
  useEffect(() => {
    import("qrcode").then((q) => q.toDataURL(url, { margin: 1, width: 360 })).then(setSrc).catch(() => setSrc(null));
  }, [url]);
  if (!src) return null;
  return (
    <div className="mt-3 flex flex-col items-end gap-2">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={src} alt={`QR code to pay invoice ${invoiceNo}`} className="h-44 w-44 rounded-lg border border-rule bg-white p-2" />
      <a className="text-xs text-ink" href={src} download={`pay-${invoiceNo}.png`}>
        Download QR code
      </a>
    </div>
  );
}
