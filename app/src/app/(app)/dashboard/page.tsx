"use client";

import Link from "next/link";
import { useBusiness } from "@/components/business";
import { api, AddressLink, Money, Notice, Status, TxLink, useAction, useApi } from "@/components/ui";
import { AGENT_ADDRESS } from "@/lib/arc";

export default function Dashboard() {
  const { business, vault, reload } = useBusiness();
  const reqs = useApi<{ requests: any[]; unmatched: any[] }>("/api/requests");
  const bills = useApi<{ bills: any[] }>("/api/bills");
  const log = useApi<{ decisions: any[] }>("/api/decisions?limit=8");
  const agent = useAction();

  const owed = (reqs.data?.requests ?? []).filter((r) => r.status === "open" || r.status === "part_paid");
  const owedTotal = owed.reduce((s, r) => s + Number(r.amount) - Number(r.paid_amount), 0);
  const overdue = owed.filter((r) => new Date(r.due_date) < new Date());
  const due = (bills.data?.bills ?? []).filter((b) => ["new", "scheduled", "held"].includes(b.status));
  const dueTotal = due.reduce((s, b) => s + Number(b.amount), 0);
  const waiting = (bills.data?.bills ?? []).filter((b) => b.status === "awaiting_approval");
  const agentOn = vault.agent?.toLowerCase() === AGENT_ADDRESS.toLowerCase() && !vault.paused;

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">{business.name}</h1>
          <p className="text-sm text-black/50">
            Vault <AddressLink address={vault.address} />
          </p>
        </div>
        <button
          className="btn"
          disabled={agent.busy || !agentOn}
          onClick={() =>
            agent.run(async () => {
              await api("/api/agent/run", { method: "POST" });
              await Promise.all([reload(), reqs.reload(), bills.reload(), log.reload()]);
            })
          }
        >
          {agent.busy ? "Agent is working…" : "Run the agent now"}
        </button>
      </div>
      {agent.error && <Notice kind="bad">{agent.error}</Notice>}
      {!agentOn && (
        <Notice kind="warn">
          The agent is {vault.paused ? "paused" : "not authorised on your vault"}. Turn it back on in <Link className="underline" href="/settings">Rules & settings</Link>.
        </Notice>
      )}
      {waiting.length > 0 && (
        <Notice kind="warn">
          {waiting.length} payment{waiting.length > 1 ? "s" : ""} waiting for your approval. <Link className="underline" href="/approvals">Review</Link>
        </Notice>
      )}

      <div className="grid gap-4 md:grid-cols-4">
        <Stat label="Operating cash" value={<Money value={vault.operating} />} sub={`Keeps at least ${vault.cashFloor}`} />
        <Stat label="Reserve" value={<Money value={vault.reserve} />} sub="Set aside, not spent on bills" />
        <Stat label="Owed to you" value={<Money value={owedTotal} />} sub={`${owed.length} invoices, ${overdue.length} overdue`} />
        <Stat label="Bills to pay" value={<Money value={dueTotal} />} sub={`${due.length} waiting`} />
      </div>

      <section className="card">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="font-semibold">Latest decisions</h2>
          <Link className="text-sm text-brand" href="/log">
            Full log
          </Link>
        </div>
        {!log.data?.decisions.length ? (
          <p className="text-sm text-black/50">Nothing yet. Add invoices and bills, then run the agent.</p>
        ) : (
          <ul className="divide-y divide-black/5">
            {log.data.decisions.map((d) => (
              <li key={d.id} className="py-3">
                <div className="flex items-baseline justify-between gap-3">
                  <p className="text-sm font-medium">{d.summary}</p>
                  <span className="shrink-0 text-xs text-black/40">{new Date(d.created_at).toLocaleString()}</span>
                </div>
                <p className="mt-0.5 text-sm text-black/60">{d.reasoning}</p>
                {d.data?.tx && <TxLink hash={d.data.tx} label="View transaction" />}
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="card">
        <h2 className="mb-3 font-semibold">Overdue invoices</h2>
        {!overdue.length ? (
          <p className="text-sm text-black/50">None.</p>
        ) : (
          <table className="table">
            <tbody>
              {overdue.map((r) => (
                <tr key={r.id}>
                  <td>{r.customer_name}</td>
                  <td>{r.invoice_no}</td>
                  <td><Money value={Number(r.amount) - Number(r.paid_amount)} /></td>
                  <td>due {r.due_date}</td>
                  <td><Status value={r.status} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </div>
  );
}

function Stat({ label, value, sub }: { label: string; value: React.ReactNode; sub: string }) {
  return (
    <div className="card">
      <p className="label">{label}</p>
      <p className="text-xl font-semibold">{value}</p>
      <p className="mt-1 text-xs text-black/50">{sub}</p>
    </div>
  );
}
