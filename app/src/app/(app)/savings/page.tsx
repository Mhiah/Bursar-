"use client";

import { useEffect, useState } from "react";
import { getAddress, isAddress, parseUnits, type Address } from "viem";
import { useBusiness } from "@/components/business";
import { useChanges } from "@/components/changes";
import { ConnectOwner, useOwnerSigner } from "@/components/signer";
import { AddressLink, api, Field, Notice, useAction, useApi } from "@/components/ui";
import { bursarSavingsAbi } from "@/lib/abi/BursarSavings";
import { bursarSavingsFactoryAbi } from "@/lib/abi/BursarSavingsFactory";
import { bursarVaultAbi } from "@/lib/abi/BursarVault";
import { AGENT_ADDRESS, SAVINGS_FACTORY } from "@/lib/arc";
import { categoryKey } from "@/lib/category";
import { fromUnits } from "@/lib/money";
import { browserPublicClient, ownerCall, savingsCall } from "@/lib/owner-tx";

const KINDS = ["Flex", "Locked", "Target"] as const;
const KIND_NOTE = {
  Flex: "Take money out anytime.",
  Locked: "Can't be taken out before its date. Nobody can open it early, not even Bursar.",
  Target: "Save toward a goal amount. Take money out anytime.",
};
type Pot = { id: number; name: string; kind: (typeof KINDS)[number]; balance: bigint; goal: bigint; unlockAt: number };

export default function Savings() {
  const { business, vault } = useBusiness();
  const data = useApi<{ savings: string | null; plans: any; moves: any[] }>("/api/savings");
  const savings = data.data?.savings as Address | null | undefined;

  return (
    <div className="space-y-8">
      <h1 className="h-page">Savings</h1>
      <p className="max-w-2xl text-sm text-muted">
        Your business's savings, kept apart from the vault in an account only you own. The agent can put money into your pots but can never take it out.
      </p>
      {!SAVINGS_FACTORY ? (
        <Notice kind="warn">Savings isn't set up on this site yet.</Notice>
      ) : data.loading && !data.data ? (
        <p className="text-sm text-muted">Loading…</p>
      ) : !savings ? (
        <OpenSavings owner={business.owner_address} onDone={data.reload} />
      ) : (
        <SavingsAccount savings={savings} vault={vault.address} owner={business.owner_address} plans={data.data!.plans} moves={data.data!.moves} reload={data.reload} />
      )}
    </div>
  );
}

function OpenSavings({ owner, onDone }: { owner: string; onDone: () => Promise<void> }) {
  const signer = useOwnerSigner(owner);
  const act = useAction();
  const [existing, setExisting] = useState<Address | null>(null);
  useEffect(() => {
    browserPublicClient
      .readContract({ address: SAVINGS_FACTORY, abi: bursarSavingsFactoryAbi, functionName: "savingsOf", args: [getAddress(owner)] })
      .then((list) => setExisting(list.length ? (list[list.length - 1] as Address) : null))
      .catch(() => {});
  }, [owner]);

  const save = async (addr: Address) => {
    await api("/api/savings/account", { method: "POST", json: { savings: addr } });
    await onDone();
  };

  return (
    <section className="card space-y-4">
      <div>
        <h2 className="h-section">Open your savings account</h2>
        <p className="text-sm text-muted">One approval in your wallet. After that you can make pots: Flex, Locked and Target.</p>
      </div>
      <ConnectOwner owner={owner} />
      {act.error && <Notice kind="bad">{act.error}</Notice>}
      {existing ? (
        <button className="btn" disabled={act.busy} onClick={() => act.run(() => save(existing))}>
          Use my savings account
        </button>
      ) : (
        <button
          className="btn"
          disabled={!signer.ready || act.busy}
          onClick={() =>
            act.run(async () => {
              const hash = await signer.client!.writeContract({
                address: SAVINGS_FACTORY,
                abi: bursarSavingsFactoryAbi,
                functionName: "createSavings",
                args: [AGENT_ADDRESS],
              } as any);
              await browserPublicClient.waitForTransactionReceipt({ hash });
              const list = await browserPublicClient.readContract({ address: SAVINGS_FACTORY, abi: bursarSavingsFactoryAbi, functionName: "savingsOf", args: [getAddress(owner)] });
              await save(list[list.length - 1] as Address);
            })
          }
        >
          {act.busy ? "Working…" : "Open savings account"}
        </button>
      )}
    </section>
  );
}

function SavingsAccount({
  savings,
  vault,
  owner,
  plans,
  moves,
  reload,
}: {
  savings: Address;
  vault: Address;
  owner: string;
  plans: any;
  moves: any[];
  reload: () => Promise<void>;
}) {
  const signer = useOwnerSigner(owner);
  const changes = useChanges();
  const act = useAction();
  const [done, setDone] = useState<string | null>(null);
  const [pots, setPots] = useState<Pot[]>([]);
  const [unassigned, setUnassigned] = useState(0n);
  const [setup, setSetup] = useState<{ approved: boolean; budget: bigint; left: bigint } | null>(null);
  const [version, setVersion] = useState(0);

  useEffect(() => {
    (async () => {
      const read = (functionName: any, args: any[] = []) => browserPublicClient.readContract({ address: savings, abi: bursarSavingsAbi, functionName, args } as any) as Promise<any>;
      const count = Number(await read("potCount"));
      const list: Pot[] = [];
      for (let i = 0; i < count; i++) {
        const p = await read("pot", [BigInt(i)]);
        list.push({ id: i, name: p.name, kind: KINDS[p.kind], balance: p.balance, goal: p.goal, unlockAt: Number(p.unlockAt) });
      }
      setPots(list);
      setUnassigned(await read("unassigned"));
      const [approved, budget, left] = await Promise.all([
        browserPublicClient.readContract({ address: vault, abi: bursarVaultAbi, functionName: "approvedPayee", args: [savings] }),
        browserPublicClient.readContract({ address: vault, abi: bursarVaultAbi, functionName: "budgets", args: [categoryKey("savings")] }),
        browserPublicClient.readContract({ address: vault, abi: bursarVaultAbi, functionName: "budgetLeft", args: [categoryKey("savings")] }),
      ]);
      setSetup({ approved: approved as boolean, budget: (budget as any)[0], left: left as bigint });
    })().catch(() => {});
  }, [savings, vault, version, changes.version]);

  const refresh = async () => {
    setVersion((v) => v + 1);
    await reload();
  };

  const total = pots.reduce((s, p) => s + p.balance, 0n);

  return (
    <div className="space-y-8">
      {act.error && <Notice kind="bad">{act.error}</Notice>}
      {done && <Notice kind="ok">{done}</Notice>}

      <section className="card space-y-2">
        <p className="text-sm text-muted">Total saved</p>
        <p className="font-serif text-4xl">{fromUnits(total)} USDC</p>
        <p className="text-xs text-muted">
          Savings account <AddressLink address={savings} />
          {unassigned > 0n && <> · {fromUnits(unassigned)} USDC arriving, not in a pot yet</>}
        </p>
      </section>

      <SavingsBudget savings={savings} setup={setup} onSaved={setDone} />

      <section className="space-y-4">
        <h2 className="h-section">Your pots</h2>
        {!pots.length && <p className="text-sm text-muted">No pots yet. Make your first one below.</p>}
        <div className="grid gap-4 md:grid-cols-2">
          {pots.map((p) => (
            <PotCard key={p.id} p={p} savings={savings} vault={vault} owner={owner} signerReady={signer.ready} client={signer.client} onDone={async (msg) => { setDone(msg); await refresh(); }} />
          ))}
        </div>
        <NewPot savings={savings} owner={owner} onDone={async (msg) => { setDone(msg); await refresh(); }} />
      </section>

      <Plans pots={pots} plans={plans} onSaved={async (msg) => { setDone(msg); await reload(); }} />

      <section className="card space-y-3">
        <h2 className="h-section">Recent savings</h2>
        {!moves.length && <p className="text-sm text-muted">Nothing saved yet.</p>}
        <ul className="divide-y divide-rule text-sm">
          {moves.map((m) => (
            <li key={m.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
              <span>
                {fromUnits(m.amount)} USDC to {pots[m.pot]?.name ?? `pot ${m.pot + 1}`} ·{" "}
                <span className="text-muted">{{ auto: "AutoSave", paid: "Save when paid", owner: "You" }[m.source as string] ?? m.source}</span>
              </span>
              <span className={`text-xs ${m.status === "failed" ? "text-bad" : "text-muted"}`}>
                {m.status === "failed" ? "Didn't go through" : m.status === "pending" ? "Arriving" : new Date(m.created_at).toLocaleDateString()}
              </span>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}

/** The vault side: savings must be an approved payee with a monthly budget. That budget caps AutoSave and Save when paid. */
function SavingsBudget({ savings, setup, onSaved }: { savings: Address; setup: { approved: boolean; budget: bigint; left: bigint } | null; onSaved: (m: string) => void }) {
  const changes = useChanges();
  const [limit, setLimit] = useState("");
  useEffect(() => {
    if (setup) setLimit(fromUnits(setup.budget));
  }, [setup]);
  const waiting = changes.pending("budget:savings") || changes.pending(`payee:${savings.toLowerCase()}`);
  return (
    <section className="card space-y-4">
      <div>
        <h2 className="h-section">Savings budget</h2>
        <p className="text-sm text-muted">
          The most the agent may move from your vault into savings every 30 days, for AutoSave and Save when paid. Your vault enforces it.
          {setup && setup.approved && <> Left this period: {fromUnits(setup.left)} USDC.</>}
        </p>
      </div>
      <div className="flex flex-wrap items-end gap-3">
        <Field label="Most per month (USDC)">
          <input className="input max-w-[160px]" value={limit} onChange={(e) => setLimit(e.target.value)} />
        </Field>
        <button
          className="btn"
          onClick={() => {
            let units: bigint;
            try {
              units = parseUnits((limit || "0").trim(), 6);
            } catch {
              return;
            }
            if (!setup?.approved) changes.add(`payee:${savings.toLowerCase()}`, "Let the agent move money into your savings", "setPayee", [savings, true]);
            changes.add("budget:savings", `Savings budget: ${limit || 0} USDC a month`, "setBudget", [categoryKey("savings"), units]);
            onSaved("Savings budget saved. Approve all changes at the top of the page.");
          }}
        >
          Save
        </button>
        {waiting && <span className="text-xs text-muted">Waiting for approval</span>}
      </div>
    </section>
  );
}

function PotCard({
  p,
  savings,
  vault,
  owner,
  signerReady,
  client,
  onDone,
}: {
  p: Pot;
  savings: Address;
  vault: Address;
  owner: string;
  signerReady: boolean;
  client: any;
  onDone: (msg: string) => Promise<void>;
}) {
  const act = useAction();
  const [mode, setMode] = useState<"add" | "out" | null>(null);
  const [amount, setAmount] = useState("");
  const [to, setTo] = useState(owner);
  const locked = p.kind === "Locked" && p.unlockAt * 1000 > Date.now();
  const pct = p.kind === "Target" && p.goal > 0n ? Math.min(100, Number((p.balance * 100n) / p.goal)) : null;

  return (
    <div className="card space-y-3">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="font-medium">{p.name}</p>
          <p className="text-xs text-muted">
            {p.kind}
            {p.kind === "Locked" && ` · ${locked ? "locked until" : "unlocked since"} ${new Date(p.unlockAt * 1000).toLocaleDateString()}`}
            {p.kind === "Target" && ` · goal ${fromUnits(p.goal)} USDC`}
          </p>
        </div>
        <p className="font-serif text-2xl">{fromUnits(p.balance)}</p>
      </div>
      {pct !== null && (
        <div className="h-1.5 rounded bg-rule-soft">
          <div className="h-1.5 rounded bg-ink" style={{ width: `${pct}%` }} />
        </div>
      )}
      {act.error && <Notice kind="bad">{act.error}</Notice>}
      {mode ? (
        <div className="space-y-2">
          {!signerReady && <ConnectOwner owner={owner} />}
          <div className="flex flex-wrap items-end gap-2">
            <Field label={mode === "add" ? "From your vault (USDC)" : "Amount (USDC)"}>
              <input className="input max-w-[140px]" value={amount} onChange={(e) => setAmount(e.target.value)} />
            </Field>
            {mode === "out" && (
              <Field label="To wallet">
                <input className="input font-mono" value={to} onChange={(e) => setTo(e.target.value)} />
              </Field>
            )}
          </div>
          <div className="flex gap-2">
            <button
              className="btn"
              disabled={!signerReady || act.busy || !amount || (mode === "out" && !isAddress(to))}
              onClick={() =>
                act.run(async () => {
                  const units = parseUnits(amount.trim(), 6);
                  if (mode === "add") {
                    const txHash = await ownerCall(client, vault, "withdraw", [savings, units]);
                    await api("/api/savings/deposit", { method: "POST", json: { pot: p.id, txHash } });
                    await onDone(`${amount} USDC moved from your vault into ${p.name}.`);
                  } else {
                    await savingsCall(client, savings, "withdraw", [BigInt(p.id), getAddress(to), units]);
                    await onDone(`${amount} USDC taken out of ${p.name}.`);
                  }
                  setMode(null);
                  setAmount("");
                })
              }
            >
              {act.busy ? "Working…" : mode === "add" ? "Add money" : "Take out"}
            </button>
            <button className="btn-ghost" disabled={act.busy} onClick={() => setMode(null)}>
              Cancel
            </button>
          </div>
        </div>
      ) : (
        <div className="flex gap-3 text-xs">
          <button className="text-brand" onClick={() => setMode("add")}>Add money</button>
          {!locked && p.balance > 0n && (
            <button className="text-brand" onClick={() => setMode("out")}>Take out</button>
          )}
        </div>
      )}
    </div>
  );
}

function NewPot({ savings, owner, onDone }: { savings: Address; owner: string; onDone: (msg: string) => Promise<void> }) {
  const signer = useOwnerSigner(owner);
  const act = useAction();
  const [f, setF] = useState({ name: "", kind: "Flex" as (typeof KINDS)[number], goal: "", unlock: "" });
  return (
    <div className="card space-y-4">
      <h3 className="h-section">New pot</h3>
      <div className="grid gap-3 md:grid-cols-4">
        <Field label="Name">
          <input className="input" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} />
        </Field>
        <Field label="Type">
          <select className="input" value={f.kind} onChange={(e) => setF({ ...f, kind: e.target.value as any })}>
            {KINDS.map((k) => (
              <option key={k}>{k}</option>
            ))}
          </select>
        </Field>
        {f.kind === "Target" && (
          <Field label="Goal (USDC)">
            <input className="input" value={f.goal} onChange={(e) => setF({ ...f, goal: e.target.value })} />
          </Field>
        )}
        {f.kind === "Locked" && (
          <Field label="Locked until">
            <input className="input" type="date" value={f.unlock} onChange={(e) => setF({ ...f, unlock: e.target.value })} />
          </Field>
        )}
      </div>
      <p className="text-xs text-muted">{KIND_NOTE[f.kind]}</p>
      <ConnectOwner owner={owner} />
      {act.error && <Notice kind="bad">{act.error}</Notice>}
      <button
        className="btn"
        disabled={!signer.ready || act.busy || !f.name.trim() || (f.kind === "Locked" && !f.unlock)}
        onClick={() =>
          act.run(async () => {
            const kind = KINDS.indexOf(f.kind);
            const goal = f.kind === "Target" ? parseUnits((f.goal || "0").trim(), 6) : 0n;
            const unlockAt = f.kind === "Locked" ? BigInt(Math.floor(new Date(`${f.unlock}T00:00:00`).getTime() / 1000)) : 0n;
            await savingsCall(signer.client!, savings, "createPot", [f.name.trim(), kind, goal, unlockAt]);
            setF({ name: "", kind: "Flex", goal: "", unlock: "" });
            await onDone(`Pot "${f.name.trim()}" made.`);
          })
        }
      >
        {act.busy ? "Working…" : "Make pot"}
      </button>
    </div>
  );
}

/** AutoSave and Save when paid. Kept by Bursar, so saving these needs no wallet. */
function Plans({ pots, plans, onSaved }: { pots: Pot[]; plans: any; onSaved: (msg: string) => Promise<void> }) {
  const act = useAction();
  const a = plans.autoSave;
  const w = plans.whenPaid;
  const [auto, setAuto] = useState({ pot: a?.pot ?? 0, amount: a ? fromUnits(a.amount) : "", every: a?.every ?? "week" });
  const [paid, setPaid] = useState({ pot: w?.pot ?? 0, percent: w ? String(w.percent) : "" });
  const save = (json: unknown, msg: string) => act.run(async () => {
    await api("/api/savings/plans", { method: "POST", json });
    await onSaved(msg);
  });
  const potSelect = (v: number, on: (v: number) => void) => (
    <select className="input" value={v} onChange={(e) => on(Number(e.target.value))}>
      {pots.map((p) => (
        <option key={p.id} value={p.id}>{p.name}</option>
      ))}
    </select>
  );

  if (!pots.length) return null;
  return (
    <div className="grid gap-4 md:grid-cols-2">
      {act.error && <div className="md:col-span-2"><Notice kind="bad">{act.error}</Notice></div>}
      <section className="card space-y-4">
        <div>
          <h2 className="h-section">AutoSave</h2>
          <p className="text-sm text-muted">The agent saves a set amount from your vault on a schedule. {a ? `On: ${fromUnits(a.amount)} USDC every ${a.every}, next ${new Date(a.nextAt).toLocaleDateString()}.` : "Off."}</p>
        </div>
        <div className="grid gap-3 md:grid-cols-3">
          <Field label="Amount (USDC)">
            <input className="input" value={auto.amount} onChange={(e) => setAuto({ ...auto, amount: e.target.value })} />
          </Field>
          <Field label="Every">
            <select className="input" value={auto.every} onChange={(e) => setAuto({ ...auto, every: e.target.value })}>
              <option value="day">day</option>
              <option value="week">week</option>
              <option value="month">month</option>
            </select>
          </Field>
          <Field label="Into">{potSelect(auto.pot, (pot) => setAuto({ ...auto, pot }))}</Field>
        </div>
        <div className="flex gap-2">
          <button className="btn" disabled={act.busy || !auto.amount} onClick={() => save({ autoSave: { pot: auto.pot, amount: auto.amount.trim(), every: auto.every } }, "AutoSave saved.")}>
            Save
          </button>
          {a && (
            <button className="btn-ghost" disabled={act.busy} onClick={() => save({ autoSave: null }, "AutoSave turned off.")}>
              Turn off
            </button>
          )}
        </div>
      </section>

      <section className="card space-y-4">
        <div>
          <h2 className="h-section">Save when paid</h2>
          <p className="text-sm text-muted">When a customer pays an invoice, the agent saves a share of it. {w ? `On: ${w.percent}% of every payment.` : "Off."}</p>
        </div>
        <div className="grid gap-3 md:grid-cols-2">
          <Field label="Share of each payment (%)">
            <input className="input" value={paid.percent} onChange={(e) => setPaid({ ...paid, percent: e.target.value })} />
          </Field>
          <Field label="Into">{potSelect(paid.pot, (pot) => setPaid({ ...paid, pot }))}</Field>
        </div>
        <div className="flex gap-2">
          <button
            className="btn"
            disabled={act.busy || !paid.percent || isNaN(Number(paid.percent))}
            onClick={() => save({ whenPaid: { pot: paid.pot, percent: Number(paid.percent) } }, "Save when paid saved.")}
          >
            Save
          </button>
          {w && (
            <button className="btn-ghost" disabled={act.busy} onClick={() => save({ whenPaid: null }, "Save when paid turned off.")}>
              Turn off
            </button>
          )}
        </div>
      </section>
    </div>
  );
}
