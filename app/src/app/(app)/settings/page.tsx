"use client";

import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { getAddress, isAddress, parseUnits, zeroAddress } from "viem";
import { useBusiness } from "@/components/business";
import { useChanges } from "@/components/changes";
import { ConnectOwner, useOwnerSigner } from "@/components/signer";
import { AddressLink, api, Field, Notice, useAction, useApi } from "@/components/ui";
import { bursarVaultAbi } from "@/lib/abi/BursarVault";
import { categoryKey } from "@/lib/category";
import { AGENT_ADDRESS } from "@/lib/arc";
import { browserPublicClient, ownerCall } from "@/lib/owner-tx";
import { fromUnits } from "@/lib/money";

export default function Settings() {
  const { business, vault, reload } = useBusiness();
  const isNew = useSearchParams().get("new") === "1";
  const signer = useOwnerSigner(business.owner_address);
  const suppliers = useApi<{ suppliers: any[] }>("/api/suppliers");
  const act = useAction();
  const [done, setDone] = useState<string | null>(null);
  const changes = useChanges();

  // Vault changes wait in the list at the top and are approved together, once.
  const queue = (key: string, label: string, fn: string, args: readonly unknown[]) =>
    act.run(async () => {
      changes.add(key, label, fn, args);
      setDone("Added to your changes. Approve them all at once at the top of the page.");
    });

  const call = (label: string, fn: string, args: readonly unknown[]) =>
    act.run(async () => {
      setDone(null);
      await ownerCall(signer.client!, vault.address, fn, args);
      await reload();
      setDone(label);
    });

  // ---- vault rules
  const [maxPer, setMaxPer] = useState(vault.maxPerPayment);
  const [floor, setFloor] = useState(vault.cashFloor);

  // ---- budgets
  const [budgets, setBudgets] = useState<{ category: string; limit: string; left: string }[]>([]);
  const [newCat, setNewCat] = useState({ category: "", limit: "" });
  const loadBudgets = async (cats: string[]) => {
    const unique = [...new Set(cats.map((c) => c.toLowerCase()))];
    if (!unique.length) return setBudgets([]);
    const res = await Promise.all(
      unique.map(async (c) => {
        const [budget, left] = await Promise.all([
          browserPublicClient.readContract({ address: vault.address, abi: bursarVaultAbi, functionName: "budgets", args: [categoryKey(c)] }),
          browserPublicClient.readContract({ address: vault.address, abi: bursarVaultAbi, functionName: "budgetLeft", args: [categoryKey(c)] }),
        ]);
        return { category: c, limit: fromUnits(budget[0]), left: fromUnits(left) };
      }),
    );
    setBudgets(res);
  };
  const [extraCats, setExtraCats] = useState<string[]>([]);
  useEffect(() => {
    if (suppliers.data) loadBudgets([...suppliers.data.suppliers.map((s) => s.category), ...extraCats]).catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [suppliers.data, extraCats, changes.version]);

  // ---- withdraw
  const [wd, setWd] = useState({ to: business.owner_address, amount: "" });

  // ---- agent settings
  const [s, setS] = useState(business.settings);
  const saveSettings = useAction();

  const agentIsBursar = vault.agent?.toLowerCase() === AGENT_ADDRESS.toLowerCase();

  return (
    <div className="space-y-8">
      <h1 className="h-page">Rules & settings</h1>
      {isNew && (
        <Notice kind="ok">
          Your vault is ready. Next: set a monthly budget for each kind of bill, add suppliers and approve their wallets, then add customers and
          invoices. Send USDC to your vault <AddressLink address={vault.address} /> to give the agent cash to work with.
        </Notice>
      )}
      {act.error && <Notice kind="bad">{act.error}</Notice>}
      {done && <Notice kind="ok">{done}</Notice>}

      <section className="card space-y-4">
        <div>
          <h2 className="h-section">Vault rules</h2>
          <p className="text-sm text-muted">Enforced by your vault contract. The agent can't change them.</p>
        </div>
        <div className="grid gap-3 md:grid-cols-3">
          <Field label="Most per payment (USDC)"><input className="input" value={maxPer} onChange={(e) => setMaxPer(e.target.value)} /></Field>
          <Field label="Cash to always keep (USDC)"><input className="input" value={floor} onChange={(e) => setFloor(e.target.value)} /></Field>
        </div>
        <button className="btn" disabled={act.busy} onClick={() => queue("rules", `Rules: at most ${maxPer || 0} USDC per payment, keep ${floor || 0} USDC`, "setRules", [parseUnits(maxPer || "0", 6), parseUnits(floor || "0", 6)])}>
          Save rules
        </button>
      </section>

      <section className="card space-y-4">
        <div>
          <h2 className="h-section">Monthly budgets</h2>
          <p className="text-sm text-muted">How much the agent may pay per category every 30 days. A category with no budget can't be paid without you.</p>
        </div>
        <table className="table">
          <thead><tr><th>Category</th><th>Budget</th><th>Left this period</th><th></th></tr></thead>
          <tbody>
            {budgets.map((b) => (
              <BudgetRow key={b.category} b={b} waiting={!!changes.pending(`budget:${b.category}`)} disabled={act.busy} onSave={(limit) => queue(`budget:${b.category}`, `Budget for ${b.category}: ${limit || 0} USDC a month`, "setBudget", [categoryKey(b.category), parseUnits(limit || "0", 6)])} />
            ))}
          </tbody>
        </table>
        <div className="flex flex-wrap items-end gap-2">
          <Field label="New category"><input className="input" value={newCat.category} onChange={(e) => setNewCat({ ...newCat, category: e.target.value })} /></Field>
          <Field label="Monthly budget (USDC)"><input className="input" value={newCat.limit} onChange={(e) => setNewCat({ ...newCat, limit: e.target.value })} /></Field>
          <button
            className="btn-ghost"
            disabled={act.busy || !newCat.category}
            onClick={async () => {
              const c = newCat.category.toLowerCase();
              await queue(`budget:${c}`, `Budget for ${c}: ${newCat.limit || 0} USDC a month`, "setBudget", [categoryKey(c), parseUnits(newCat.limit || "0", 6)]);
              setExtraCats([...extraCats, c]);
              setNewCat({ category: "", limit: "" });
            }}
          >
            Add budget
          </button>
        </div>
      </section>

      <section className="card space-y-4">
        <div>
          <h2 className="h-section">The agent</h2>
          <p className="text-sm text-muted">
            Agent key: {vault.agent === zeroAddress ? "none" : <AddressLink address={vault.agent} />}
            {vault.agent !== zeroAddress && !agentIsBursar && " (not Bursar's)"}. {vault.paused ? "Paused." : ""}
          </p>
        </div>
        <ConnectOwner owner={business.owner_address} />
        <div className="flex flex-wrap gap-2">
          {/* Pause is the emergency stop, so it goes through straight away, not with the other changes. */}
          <button className="btn-ghost" disabled={!signer.ready || act.busy} onClick={() => call(vault.paused ? "Agent resumed." : "Agent paused.", "setPaused", [!vault.paused])}>
            {vault.paused ? "Resume the agent" : "Pause the agent"}
          </button>
          {agentIsBursar ? (
            <button className="btn-danger" disabled={act.busy} onClick={() => queue("agent", "Remove the agent's key", "setAgent", [zeroAddress])}>
              Remove the agent's key
            </button>
          ) : (
            <button className="btn" disabled={act.busy || !AGENT_ADDRESS} onClick={() => queue("agent", "Authorise Bursar's agent", "setAgent", [AGENT_ADDRESS])}>
              Authorise Bursar's agent
            </button>
          )}
        </div>
      </section>

      <section className="card space-y-4">
        <div>
          <h2 className="h-section">How the agent works</h2>
          <p className="text-sm text-muted">Guidance the agent follows inside the vault's rules.</p>
        </div>
        <div className="grid gap-3 md:grid-cols-3">
          <Num label="Keep cash for the next (days of bills)" v={s.operatingDays} on={(v) => setS({ ...s, operatingDays: v })} />
          <Num label="Pay early if due within (days)" v={s.earlyPayDays} on={(v) => setS({ ...s, earlyPayDays: v })} />
          <Num label="Days between reminders" v={s.chaseEveryDays} on={(v) => setS({ ...s, chaseEveryDays: v })} />
          <Num label="Most instalments (0 = off)" v={s.maxInstalments} on={(v) => setS({ ...s, maxInstalments: v })} />
          <Num label="Instalment plan at most (days)" v={s.maxInstalmentDays} on={(v) => setS({ ...s, maxInstalmentDays: v })} />
          <Num label="Smallest invoice to split (USDC)" v={s.minInstalmentAmount} on={(v) => setS({ ...s, minInstalmentAmount: v })} />
        </div>
        <div>
          <span className="label">Chase customers on</span>
          <div className="flex gap-4 text-sm">
            {(["email", "telegram", "whatsapp"] as const).map((c) => (
              <label key={c} className="flex items-center gap-1.5">
                <input
                  type="checkbox"
                  checked={s.chaseChannels.includes(c)}
                  onChange={(e) => setS({ ...s, chaseChannels: e.target.checked ? [...s.chaseChannels, c] : s.chaseChannels.filter((x: string) => x !== c) })}
                />
                {{ email: "Email", telegram: "Telegram", whatsapp: "WhatsApp" }[c]}
              </label>
            ))}
          </div>
        </div>
        <button className="btn" disabled={saveSettings.busy} onClick={() => saveSettings.run(async () => { await api("/api/business/settings", { method: "POST", json: s }); await reload(); setDone("Agent settings saved."); })}>
          Save
        </button>
        {saveSettings.error && <Notice kind="bad">{saveSettings.error}</Notice>}
      </section>

      <section className="card space-y-4">
        <div>
          <h2 className="h-section">Take money out</h2>
          <p className="text-sm text-muted">You can always withdraw, reserve included. Balance: {vault.balance} USDC.</p>
        </div>
        <div className="grid gap-3 md:grid-cols-3">
          <Field label="To wallet"><input className="input font-mono" value={wd.to} onChange={(e) => setWd({ ...wd, to: e.target.value })} /></Field>
          <Field label="Amount (USDC)"><input className="input" value={wd.amount} onChange={(e) => setWd({ ...wd, amount: e.target.value })} /></Field>
        </div>
        {wd.amount && <ConnectOwner owner={business.owner_address} />}
        <button
          className="btn-ghost"
          disabled={!signer.ready || act.busy || !isAddress(wd.to) || !wd.amount}
          onClick={() => call("Withdrawn.", "withdraw", [getAddress(wd.to), parseUnits(wd.amount, 6)])}
        >
          Withdraw
        </button>
      </section>
    </div>
  );
}

function BudgetRow({ b, waiting, disabled, onSave }: { b: { category: string; limit: string; left: string }; waiting: boolean; disabled: boolean; onSave: (limit: string) => void }) {
  const [limit, setLimit] = useState(b.limit);
  return (
    <tr>
      <td>{b.category}</td>
      <td><input className="input max-w-[140px]" value={limit} onChange={(e) => setLimit(e.target.value)} /></td>
      <td>{b.left} USDC</td>
      <td className="text-right text-xs">
        {waiting && <span className="mr-3 text-muted">Waiting for approval</span>}
        <button className="text-brand" disabled={disabled} onClick={() => onSave(limit)}>Save</button>
      </td>
    </tr>
  );
}

function Num({ label, v, on }: { label: string; v: number; on: (v: number) => void }) {
  return (
    <Field label={label}>
      <input className="input" type="number" min={0} value={v} onChange={(e) => on(Number(e.target.value))} />
    </Field>
  );
}
