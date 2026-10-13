"use client";

import Link from "next/link";
import { useBusiness } from "@/components/business";
import { api, AddressLink, Money, Notice, Status, TxLink, useAction, useApi } from "@/components/ui";
import { AGENT_ADDRESS } from "@/lib/arc";
import { Mark } from "@/components/mark";

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

  const hour = new Date().getHours();
  const greeting = hour < 12 ? "Good morning" : hour < 18 ? "Good afternoon" : "Good evening";
  const total = Number(vault.operating) + Number(vault.reserve);

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <span className="eyebrow">{new Date().toLocaleDateString(undefined, { weekday: "long", day: "numeric", month: "long" })}</span>
          <h1 className="h-page mt-3">
            {greeting}, <em className="text-brand">{business.name}</em>.
          </h1>
          <p className="mt-2 text-sm text-muted">
            Vault <AddressLink address={vault.address} />
          </p>
        </div>
        <button
          className="btn-ink"
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

      <div className="grid overflow-hidden rounded-2xl border border-rule bg-card sm:grid-cols-2 lg:grid-cols-5">
        <Stat label="In your vault" value={<Money value={total} />} sub="Operating cash plus reserve" big />
        <Stat label="Operating cash" value={<Money value={vault.operating} />} sub={`Keeps at least ${vault.cashFloor}`} />
        <Stat label="Reserve" value={<Money value={vault.reserve} />} sub="Set aside, not spent on bills" />
        <Stat label="Owed to you" value={<Money value={owedTotal} />} sub={`${owed.length} invoices, ${overdue.length} late`} />
        <Stat label="Bills to pay" value={<Money value={dueTotal} />} sub={`${due.length} waiting`} />
      </div>

      {waiting.length > 0 && (
        <div className="flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-clay-line bg-clay-soft px-6 py-4">
          <div className="flex items-center gap-4">
            <Mark size={36} mood="asking" />
            <div>
              <p className="eyebrow">Needs you</p>
              <p className="mt-1 text-clay-dark">
                {waiting.length} payment{waiting.length > 1 ? "s are" : " is"} waiting for your signature.
              </p>
            </div>
          </div>
          <Link className="btn-ink" href="/approvals">
            Review →
          </Link>
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-[1.4fr_1fr]">
        <section className="card">
          <div className="mb-2 flex items-baseline justify-between">
            <h2 className="h-section">The ledger</h2>
            <Link className="text-sm text-brand" href="/log">
              Full log →
            </Link>
          </div>
          {!log.data?.decisions.length ? (
            <p className="py-4 text-sm text-muted">Nothing yet. Add invoices and bills, then run the agent.</p>
          ) : (
            <ul>
              {log.data.decisions.map((d) => (
                <li key={d.id} className="grid grid-cols-[5.5rem_1fr] gap-3 border-b border-rule-soft py-3.5 last:border-0">
                  <span className={`pt-0.5 font-mono text-[11px] uppercase tracking-wider ${kindTone(d.kind)}`}>{kindLabel(d.kind)}</span>
                  <div className="min-w-0">
                    <div className="flex items-baseline justify-between gap-3">
                      <p className="text-sm font-medium">{d.summary}</p>
                      <span className="shrink-0 font-mono text-[11px] text-muted">{new Date(d.created_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</span>
                    </div>
                    <p className="mt-0.5 text-sm text-muted">{d.reasoning}</p>
                    {d.data?.tx && <TxLink hash={d.data.tx} label="View transaction" />}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="card">
          <div className="mb-2 flex items-baseline justify-between">
            <h2 className="h-section">Who owes you</h2>
            <Link className="text-sm text-brand" href="/invoices">
              Invoices →
            </Link>
          </div>
          {!owed.length ? (
            <p className="py-4 text-sm text-muted">Nobody. Every invoice is paid.</p>
          ) : (
            <ul>
              {[...owed]
                .sort((a, b) => a.due_date.localeCompare(b.due_date))
                .slice(0, 8)
                .map((r) => (
                  <li key={r.id} className="flex items-center justify-between gap-3 border-b border-rule-soft py-3 last:border-0">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium">{r.customer_name}</p>
                      <p className="font-mono text-[11px] text-muted">
                        {r.invoice_no} · due {r.due_date}
                      </p>
                    </div>
                    <div className="flex shrink-0 items-center gap-2">
                      <Money className="text-sm" value={Number(r.amount) - Number(r.paid_amount)} />
                      {new Date(r.due_date) < new Date() ? <span className="pill bg-bad-soft text-bad">late</span> : <Status value={r.status} />}
                    </div>
                  </li>
                ))}
            </ul>
          )}
        </section>
      </div>
    </div>
  );
}

const kinds: Record<string, [string, string]> = {
  pay: ["Paid", "text-brand"],
  early_pay: ["Paid early", "text-brand"],
  hold: ["Held", "text-body"],
  reserve: ["Reserve", "text-body"],
  release: ["Released", "text-body"],
  approval: ["Asked you", "text-clay"],
  chase: ["Chased", "text-clay"],
  instalment: ["Instalments", "text-clay"],
  screen: ["Checked", "text-muted"],
  block: ["Blocked", "text-bad"],
  match: ["Matched", "text-brand"],
  save: ["Saved", "text-brand"],
  note: ["Note", "text-muted"],
};
const kindLabel = (k: string) => kinds[k]?.[0] ?? k;
const kindTone = (k: string) => kinds[k]?.[1] ?? "text-muted";

function Stat({ label, value, sub, big }: { label: string; value: React.ReactNode; sub: string; big?: boolean }) {
  return (
    <div className={`border-b border-rule-soft p-5 sm:border-r lg:border-b-0 ${big ? "bg-cream" : ""}`}>
      <p className="label">{label}</p>
      <p className={`whitespace-nowrap ${big ? "font-serif text-[28px] leading-tight" : "text-lg"}`}>{value}</p>
      <p className="mt-1 text-xs text-muted">{sub}</p>
    </div>
  );
}
