"use client";

import Link from "next/link";
import { useBusiness } from "@/components/business";
import { api, AddressLink, Money, Notice, Status, TxLink, useAction, useApi } from "@/components/ui";
import { AGENT_ADDRESS } from "@/lib/arc";
import { Icon } from "@/components/icons";
import { CountUp } from "@/components/motion";

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
          <span className="text-sm font-medium text-muted">{new Date().toLocaleDateString(undefined, { weekday: "long", day: "numeric", month: "long" })}</span>
          <h1 style={{ animationDelay: "60ms" }} className="h-page rise mt-3">
            {greeting}, <span className="text-brand">{business.name}</span>.
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

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
        <Stat i={0} label="In your vault" value={total} sub="Operating cash plus reserve" big />
        <Stat i={1} label="Operating cash" value={Number(vault.operating)} sub={`Keeps at least ${vault.cashFloor}`} />
        <Stat i={2} label="Reserve" value={Number(vault.reserve)} sub="Set aside, not spent on bills" />
        <Stat i={3} label="Owed to you" value={owedTotal} sub={`${owed.length} invoices, ${overdue.length} late`} />
        <Stat i={4} label="Bills to pay" value={dueTotal} sub={`${due.length} waiting`} />
      </div>

      {waiting.length > 0 && (
        <div className="rise flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-clay-line bg-clay-soft px-6 py-4">
          <div className="flex items-center gap-4">
            <span className="relative inline-flex h-10 w-10 items-center justify-center rounded-xl bg-white text-clay">
              <span className="ping absolute inline-flex h-full w-full rounded-xl bg-clay/20" /><Icon name="bell" size={20} /></span>
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
              {log.data.decisions.map((d, i) => (
                <li key={d.id} style={{ animationDelay: `${200 + i * 70}ms` }} className="rise grid grid-cols-[6.5rem_1fr] gap-3 border-b border-rule-soft py-3.5 last:border-0">
                  <span className={`h-fit w-fit rounded-full px-2.5 py-0.5 text-xs font-semibold ${kindTone(d.kind)}`}>{kindLabel(d.kind)}</span>
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
                .map((r, i) => (
                  <li key={r.id} style={{ animationDelay: `${250 + i * 70}ms` }} className="rise flex items-center justify-between gap-3 border-b border-rule-soft py-3 last:border-0">
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
  pay: ["Paid", "bg-tile-mint text-tile-mintInk"],
  early_pay: ["Paid early", "bg-tile-mint text-tile-mintInk"],
  hold: ["Held", "bg-tile-violet text-tile-violetInk"],
  reserve: ["Reserve", "bg-tile-violet text-tile-violetInk"],
  release: ["Released", "bg-tile-violet text-tile-violetInk"],
  approval: ["Asked you", "bg-tile-amber text-tile-amberInk"],
  chase: ["Chased", "bg-tile-amber text-tile-amberInk"],
  instalment: ["Instalments", "bg-tile-amber text-tile-amberInk"],
  screen: ["Checked", "bg-rule-soft text-muted"],
  block: ["Blocked", "bg-bad-soft text-bad"],
  match: ["Matched", "bg-tile-mint text-tile-mintInk"],
  note: ["Note", "bg-rule-soft text-muted"],
};
const kindLabel = (k: string) => kinds[k]?.[0] ?? k;
const kindTone = (k: string) => kinds[k]?.[1] ?? "bg-rule-soft text-muted";

function Stat({ label, value, sub, big, i }: { label: string; value: number; sub: string; big?: boolean; i: number }) {
  return (
    <div style={{ animationDelay: `${i * 80}ms` }} className={`rise rounded-2xl p-5 shadow-card transition duration-300 hover:-translate-y-1 hover:shadow-lift ${big ? "bg-brand text-white" : "border border-rule bg-white"}`}>
      <p className={`text-xs font-medium ${big ? "text-white/80" : "text-muted"}`}>{label}</p>
      <p className={`mt-1 whitespace-nowrap font-display font-bold tracking-tight ${big ? "text-2xl" : "text-xl"}`}>
        <CountUp value={value} /> <span className="text-sm font-semibold opacity-60">USDC</span>
      </p>
      <p className={`mt-1 text-xs ${big ? "text-white/70" : "text-muted"}`}>{sub}</p>
    </div>
  );
}
