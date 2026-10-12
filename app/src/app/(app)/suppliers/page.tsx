"use client";

import { useEffect, useState } from "react";
import { getAddress } from "viem";
import { useBusiness } from "@/components/business";
import { ConnectOwner, useOwnerSigner } from "@/components/signer";
import { AddressLink, api, Field, Notice, Status, useAction, useApi } from "@/components/ui";
import { bursarVaultAbi } from "@/lib/abi/BursarVault";
import { browserPublicClient, ownerCall } from "@/lib/owner-tx";

const empty = { name: "", email: "", wallet_address: "", category: "suppliers" };

export default function Suppliers() {
  const { business, vault } = useBusiness();
  const signer = useOwnerSigner(business.owner_address);
  const list = useApi<{ suppliers: any[] }>("/api/suppliers");
  const [form, setForm] = useState(empty);
  const [approved, setApproved] = useState<Record<string, boolean>>({});
  const [result, setResult] = useState<any>(null);
  const [editing, setEditing] = useState<{ id: string; wallet: string } | null>(null);
  const act = useAction();
  const set = (k: keyof typeof empty) => (e: any) => setForm({ ...form, [k]: e.target.value });

  // Which suppliers the vault will let the agent pay.
  const refreshApproved = async (rows: any[]) => {
    const res = await Promise.all(
      rows.map((s) =>
        browserPublicClient.readContract({ address: vault.address, abi: bursarVaultAbi, functionName: "approvedPayee", args: [getAddress(s.wallet_address)] }),
      ),
    );
    setApproved(Object.fromEntries(rows.map((s, i) => [s.wallet_address, res[i] as boolean])));
  };
  useEffect(() => {
    if (list.data?.suppliers.length) refreshApproved(list.data.suppliers).catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [list.data]);

  const setPayee = (wallet: string, ok: boolean) =>
    act.run(async () => {
      await ownerCall(signer.client!, vault.address, "setPayee", [getAddress(wallet), ok]);
      await refreshApproved(list.data!.suppliers);
    });

  return (
    <div className="space-y-8">
      <h1 className="text-2xl font-semibold">Suppliers</h1>
      <p className="max-w-2xl text-sm text-black/60">
        The agent can only pay wallets you've approved on your vault. Approving is a transaction you sign; Bursar can't do it for you.
      </p>
      <section className="card space-y-4">
        <h2 className="font-semibold">Add a supplier</h2>
        <div className="grid gap-3 md:grid-cols-4">
          <Field label="Name"><input className="input" value={form.name} onChange={set("name")} /></Field>
          <Field label="Wallet"><input className="input font-mono" value={form.wallet_address} onChange={set("wallet_address")} /></Field>
          <Field label="Budget category"><input className="input" value={form.category} onChange={set("category")} /></Field>
          <Field label="Email"><input className="input" value={form.email} onChange={set("email")} /></Field>
        </div>
        <button
          className="btn"
          disabled={act.busy}
          onClick={() => act.run(async () => { setResult(await api("/api/suppliers", { method: "POST", json: form })); setForm(empty); await list.reload(); })}
        >
          Add supplier
        </button>
        {result && (
          <Notice kind={result.screening.status === "clear" && !result.lookalikeOf ? "ok" : result.screening.status === "blocked" ? "bad" : "warn"}>
            Wallet check: {result.screening.status}.{" "}
            {result.screening.reasons.map((r: any) => r.detail).join(" ")}
            {result.lookalikeOf && ` This wallet looks like ${result.lookalikeOf}'s but isn't the same. Check it with them before approving.`}
          </Notice>
        )}
      </section>
      <ConnectOwner owner={business.owner_address} />
      {act.error && <Notice kind="bad">{act.error}</Notice>}
      <section className="card overflow-x-auto">
        <table className="table">
          <thead><tr><th>Name</th><th>Wallet</th><th>Category</th><th>Agent may pay</th><th></th></tr></thead>
          <tbody>
            {list.data?.suppliers.map((s) => (
              <tr key={s.id}>
                <td>{s.name}</td>
                <td>
                  {editing && editing.id === s.id ? (
                    <div className="flex gap-2">
                      <input className="input font-mono" value={editing.wallet} onChange={(e) => setEditing({ id: s.id, wallet: e.target.value })} />
                      <button className="btn-ghost" onClick={() => act.run(async () => { await api(`/api/suppliers/${s.id}`, { method: "PATCH", json: { wallet_address: editing!.wallet } }); setEditing(null); await list.reload(); })}>Save</button>
                    </div>
                  ) : (
                    <>
                      <AddressLink address={s.wallet_address} />
                      {s.wallet_changed_at && <p className="text-xs text-amber-800">changed {new Date(s.wallet_changed_at).toLocaleDateString()}</p>}
                    </>
                  )}
                </td>
                <td>{s.category}</td>
                <td><Status value={approved[s.wallet_address] ? "yes" : "no"} /></td>
                <td className="whitespace-nowrap text-right text-xs">
                  {signer.ready && (
                    <button className="text-brand" disabled={act.busy} onClick={() => setPayee(s.wallet_address, !approved[s.wallet_address])}>
                      {approved[s.wallet_address] ? "Remove approval" : "Approve on vault"}
                    </button>
                  )}
                  <button className="ml-3 text-black/50" onClick={() => setEditing({ id: s.id, wallet: s.wallet_address })}>Change wallet</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {!list.data?.suppliers.length && <p className="pt-3 text-sm text-black/50">No suppliers yet.</p>}
      </section>
    </div>
  );
}
