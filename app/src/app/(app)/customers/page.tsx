"use client";

import { useState } from "react";
import { api, Field, Money, Notice, useAction, useApi } from "@/components/ui";

const empty = { name: "", email: "", telegram_chat_id: "", whatsapp: "", wallet_address: "" };

export default function Customers() {
  const list = useApi<{ customers: any[] }>("/api/customers");
  const [form, setForm] = useState(empty);
  const add = useAction();
  const [warn, setWarn] = useState<string | null>(null);
  const set = (k: keyof typeof empty) => (e: any) => setForm({ ...form, [k]: e.target.value });

  return (
    <div className="space-y-8">
      <h1 className="h-page">Customers</h1>
      <section className="card space-y-4">
        <h2 className="h-section">Add a customer</h2>
        <div className="grid gap-3 md:grid-cols-3">
          <Field label="Name"><input className="input" value={form.name} onChange={set("name")} /></Field>
          <Field label="Email"><input className="input" value={form.email} onChange={set("email")} /></Field>
          <Field label="Their wallet (optional)" hint="Helps match payments to them."><input className="input font-mono" value={form.wallet_address} onChange={set("wallet_address")} /></Field>
        </div>
        <button
          className="btn"
          disabled={add.busy}
          onClick={() => add.run(async () => {
            const res = await api("/api/customers", { method: "POST", json: form });
            setWarn(res.screening?.status === "blocked" ? `${form.name}'s wallet is on a sanctions list. Payments from it will be flagged.` : null);
            setForm(empty);
            await list.reload();
          })}
        >
          Add customer
        </button>
        {add.error && <Notice kind="bad">{add.error}</Notice>}
        {warn && <Notice kind="bad">{warn}</Notice>}
      </section>
      <section className="card overflow-x-auto">
        <table className="table">
          <thead>
            <tr><th>Name</th><th>Email</th><th>Owes</th><th>Payment history</th></tr>
          </thead>
          <tbody>
            {list.data?.customers.map((c) => (
              <tr key={c.id}>
                <td>{c.name}</td>
                <td className="text-xs text-ink">{c.email || "none"}</td>
                <td><Money value={c.reliability.outstanding} /></td>
                <td>
                  <span className="font-medium">{c.reliability.label}</span>
                  <span className="ml-2 text-xs text-ink">
                    score {c.reliability.score} · {c.reliability.paidOnTime} on time, {c.reliability.paidLate} late
                    {c.reliability.overdueNow ? `, ${c.reliability.overdueNow} overdue now` : ""}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {!list.data?.customers.length && <p className="pt-3 text-sm text-ink">No customers yet.</p>}
      </section>
    </div>
  );
}
