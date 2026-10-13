"use client";

import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { getAddress, isAddress, parseUnits, zeroAddress } from "viem";
import { useBusiness } from "@/components/business";
import { ChangesBar, useChanges, type PageChange } from "@/components/changes";
import { ConnectOwner, useOwnerSigner } from "@/components/signer";
import { AddressLink, api, Field, Notice, useAction, useApi } from "@/components/ui";
import { bursarVaultAbi } from "@/lib/abi/BursarVault";
import { categoryKey } from "@/lib/category";
import { AGENT_ADDRESS } from "@/lib/arc";
import { browserPublicClient, encodeVaultCall, ownerCall } from "@/lib/owner-tx";
import { fromUnits } from "@/lib/money";

/** USDC text to units, or null if it isn't a number. */
const units = (v: string) => {
  try {
    return parseUnits((v || "0").trim(), 6);
  } catch {
    return null;
  }
};

export default function Settings() {
  const { business, vault, reload } = useBusiness();
  const isNew = useSearchParams().get("new") === "1";
  const signer = useOwnerSigner(business.owner_address);
  const suppliers = useApi<{ suppliers: any[] }>("/api/suppliers");
  const act = useAction();
  const [done, setDone] = useState<string | null>(null);
  const changes = useChanges();

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
  useEffect(() => {
    setMaxPer(vault.maxPerPayment);
    setFloor(vault.cashFloor);
  }, [vault.maxPerPayment, vault.cashFloor]);

  // ---- budgets
  const [budgets, setBudgets] = useState<{ category: string; limit: string; left: string }[]>([]);
  const [edits, setEdits] = useState<Record<string, string>>({});
  const [newCats, setNewCats] = useState([{ category: "", limit: "" }]);
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

  // ---- agent settings (kept by Bursar, not on the vault, so no wallet needed)
  const [s, setS] = useState(business.settings);
  const settingsChanged = JSON.stringify(s) !== JSON.stringify(business.settings);

  const agentIsBursar = vault.agent?.toLowerCase() === AGENT_ADDRESS.toLowerCase();

  // Everything typed on this page that differs from the vault becomes one change in the list at the end.
  const pageChanges: PageChange[] = [];
  const [mp, fl] = [units(maxPer), units(floor)];
  if (mp !== null && fl !== null && (mp !== units(vault.maxPerPayment) || fl !== units(vault.cashFloor)))
    pageChanges.push({
      key: "rules",
      label: `Rules: at most ${maxPer || 0} USDC per payment, keep ${floor || 0} USDC`,
      data: encodeVaultCall("setRules", [mp, fl]),
      undo: () => { setMaxPer(vault.maxPerPayment); setFloor(vault.cashFloor); },
    });
  for (const b of budgets) {
    const v = edits[b.category];
    const u = v === undefined ? null : units(v);
    if (u !== null && u !== units(b.limit))
      pageChanges.push({
        key: `budget:${b.category}`,
        label: `Budget for ${b.category}: ${v || 0} USDC a month`,
        data: encodeVaultCall("setBudget", [categoryKey(b.category), u]),
        undo: () => setEdits(({ [b.category]: _, ...rest }) => rest),
      });
  }
  newCats.forEach((n, i) => {
    const c = n.category.trim().toLowerCase();
    const u = units(n.limit);
    if (c && u !== null && !pageChanges.some((p) => p.key === `budget:${c}`))
      pageChanges.push({
        key: `budget:${c}`,
        label: `Budget for ${c}: ${n.limit || 0} USDC a month`,
        data: encodeVaultCall("setBudget", [categoryKey(c), u]),
        undo: () => setNewCats((all) => (all.length > 1 ? all.filter((_, j) => j !== i) : [{ category: "", limit: "" }])),
      });
  });

  const afterSave = () => {
    setExtraCats((x) => [...x, ...newCats.map((n) => n.category.trim().toLowerCase()).filter(Boolean)]);
    setNewCats([{ category: "", limit: "" }]);
    setEdits({});
  };

  return (
    <div className="space-y-8">
      <h1 className="h-page">Rules & settings</h1>
      {isNew && (
        <Notice kind="ok">
          Your vault is ready. Fill in this page, then approve everything once at the end. Add suppliers and approve their wallets, then add
          customers and invoices. Send USDC to your vault <AddressLink address={vault.address} /> to give the agent cash to work with.
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
      </section>

      <section className="card space-y-4">
        <div>
          <h2 className="h-section">Monthly budgets</h2>
          <p className="text-sm text-muted">How much the agent may pay per category every 30 days. A category with no budget can't be paid without you.</p>
        </div>
        {budgets.length > 0 && (
          <table className="table">
            <thead><tr><th>Category</th><th>Budget</th><th>Left this period</th></tr></thead>
            <tbody>
              {budgets.map((b) => (
                <tr key={b.category}>
                  <td>{b.category}</td>
                  <td>
                    <input className="input max-w-[140px]" value={edits[b.category] ?? b.limit} onChange={(e) => setEdits({ ...edits, [b.category]: e.target.value })} />
                  </td>
                  <td>{b.left} USDC</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        {newCats.map((n, i) => (
          <div key={i} className="flex flex-wrap items-end gap-2">
            <Field label="New category">
              <input className="input" value={n.category} onChange={(e) => setNewCats(newCats.map((x, j) => (j === i ? { ...x, category: e.target.value } : x)))} />
            </Field>
            <Field label="Monthly budget (USDC)">
              <input className="input" value={n.limit} onChange={(e) => setNewCats(newCats.map((x, j) => (j === i ? { ...x, limit: e.target.value } : x)))} />
            </Field>
          </div>
        ))}
        <button className="text-xs text-brand" onClick={() => setNewCats([...newCats, { category: "", limit: "" }])}>
          Add another category
        </button>
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
            <button className="btn-danger" disabled={act.busy} onClick={() => changes.add("agent", "Remove the agent's key", "setAgent", [zeroAddress])}>
              Remove the agent's key
            </button>
          ) : (
            <button className="btn" disabled={act.busy || !AGENT_ADDRESS} onClick={() => changes.add("agent", "Authorise Bursar's agent", "setAgent", [AGENT_ADDRESS])}>
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
      </section>

      <ChangesBar
        extra={pageChanges}
        hasBefore={settingsChanged}
        beforeLabel="How the agent works (saved by Bursar, no wallet needed)"
        before={async () => {
          if (settingsChanged) await api("/api/business/settings", { method: "POST", json: s });
        }}
        after={afterSave}
      />

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

function Num({ label, v, on }: { label: string; v: number; on: (v: number) => void }) {
  return (
    <Field label={label}>
      <input className="input" type="number" min={0} value={v} onChange={(e) => on(Number(e.target.value))} />
    </Field>
  );
}
