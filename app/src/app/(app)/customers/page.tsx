"use client";

import { useState } from "react";
import { api, Field, Money, Notice, useAction, useApi } from "@/components/ui";

const empty = { name: "", email: "", telegram_chat_id: "", whatsapp: "", wallet_address: "" };

export default function Customers() {
  const list = useApi<{ customers: any[] }>("/api/customers");
  const [form, setForm] = useState(empty);
  const add = useAction();
  const set = (k: keyof typeof empty) => (e: any) => setForm({ ...form, [k]: e.target.value });

  return (
    <div className="space-y-8">
      <h1 className="text-2xl font-semibold">Customers</h1>
      <section className="card space-y-4">
        <h2 className="font-semibold">Add a customer</h2>
        <div className="grid gap-3 md:grid-cols-3">
          <Field label="Name"><input className="input" value={form.name} onChange={set("name")} /></Field>
          <Field label="Email"><input className="input" value={form.email} onChange={set("email")} /></Field>
          <Field label="WhatsApp number" hint="With country code, e.g. +2348012345678"><input className="input" value={form.whatsapp} onChange={set("whatsapp")} /></Field>
          <Field label="Telegram chat ID" hint="They message your bot once; the ID shows in the bot's updates."><input className="input" value={form.telegram_chat_id} onChange={set("telegram_chat_id")} /></Field>
          <Field label="Their wallet (optional)" hint="Helps match payments to them."><input className="input font-mono" value={form.wallet_address} onChange={set("wallet_address")} /></Field>
        </div>
        <button
          className="btn"
          disabled={add.busy}
          onClick={() => add.run(async () => { await api("/api/customers", { method: "POST", json: form }); setForm(empty); await list.reload(); })}
        >
          Add customer
        </button>
        {add.error && <Notice kind="bad">{add.error}</Notice>}
      </section>
      <section className="card overflow-x-auto">
        <table className="table">
          <thead>
            <tr><th>Name</th><th>Reach on</th><th>Owes</th><th>Payment history</th></tr>
          </thead>
          <tbody>
            {list.data?.customers.map((c) => (
              <tr key={c.id}>
                <td>{c.name}</td>
                <td className="text-xs text-black/60">{[c.email && "email", c.telegram_chat_id && "Telegram", c.whatsapp && "WhatsApp"].filter(Boolean).join(", ") || "none"}</td>
                <td><Money value={c.reliability.outstanding} /></td>
                <td>
                  <span className="font-medium">{c.reliability.label}</span>
                  <span className="ml-2 text-xs text-black/50">
                    score {c.reliability.score} · {c.reliability.paidOnTime} on time, {c.reliability.paidLate} late
                    {c.reliability.overdueNow ? `, ${c.reliability.overdueNow} overdue now` : ""}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {!list.data?.customers.length && <p className="pt-3 text-sm text-black/50">No customers yet.</p>}
      </section>
    </div>
  );
}
