"use client";

import { useCallback, useEffect, useState } from "react";
import { hexToString } from "viem";
import { useBusiness } from "@/components/business";
import { ConnectOwner, useOwnerSigner } from "@/components/signer";
import { AddressLink, api, Money, Notice, useAction, useApi } from "@/components/ui";
import { bursarVaultAbi } from "@/lib/abi/BursarVault";
import { browserPublicClient, ownerCall } from "@/lib/owner-tx";
import { fromUnits } from "@/lib/money";

export default function Approvals() {
  const { business, vault, reload } = useBusiness();
  const signer = useOwnerSigner(business.owner_address);
  const bills = useApi<{ bills: any[] }>("/api/bills");
  const log = useApi<{ decisions: any[] }>("/api/decisions?limit=500");
  const [items, setItems] = useState<any[]>([]);
  const act = useAction();

  // Read open approvals straight from the vault, so nothing can be hidden from the owner.
  const load = useCallback(async () => {
    const count = await browserPublicClient.readContract({ address: vault.address, abi: bursarVaultAbi, functionName: "pendingCount" });
    const ids = Array.from({ length: Number(count) }, (_, i) => BigInt(i));
    const rows = await Promise.all(
      ids.map((id) => browserPublicClient.readContract({ address: vault.address, abi: bursarVaultAbi, functionName: "pending", args: [id] })),
    );
    setItems(rows.map((p: any, i) => ({ id: i, ...p })).filter((p) => p.open));
  }, [vault.address]);
  useEffect(() => {
    load().catch(() => {});
  }, [load]);

  const decide = (id: number, approve: boolean) =>
    act.run(async () => {
      await ownerCall(signer.client!, vault.address, approve ? "approve" : "reject", [BigInt(id)]);
      await api("/api/bills/sync", { method: "PATCH" });
      await Promise.all([load(), bills.reload(), log.reload(), reload()]);
    });

  return (
    <div className="space-y-6">
      <h1 className="h-page">Approvals</h1>
      <p className="max-w-2xl text-sm text-ink">
        Payments the agent wasn't allowed to make or wasn't sure about. You approve or reject each one with your own wallet.
      </p>
      <ConnectOwner owner={business.owner_address} />
      {act.error && <Notice kind="bad">{act.error}</Notice>}
      {!items.length && <p className="text-sm text-ink">Nothing waiting for you.</p>}
      {items.map((p) => {
        const bill = bills.data?.bills.find((b) => b.approval_id != null && Number(b.approval_id) === p.id);
        const why = log.data?.decisions.find((d) => d.kind === "approval" && d.data?.billId === bill?.id);
        return (
          <div key={p.id} className="card space-y-3">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <p className="text-lg font-semibold">
                <Money value={fromUnits(p.amount)} /> to {bill?.supplier_name ?? <AddressLink address={p.to} />}
              </p>
              <span className="text-xs text-ink">
                {bill ? `Invoice ${bill.invoice_no} · due ${bill.due_date}` : ""} · {safeCategory(p.category)}
              </span>
            </div>
            {why && <p className="text-sm text-ink">{why.reasoning}</p>}
            {bill?.flags?.length > 0 && <Notice kind="warn">{bill.flags.map((f: any) => f.detail).join(" ")}</Notice>}
            {why?.data?.screening?.reasons?.length > 0 && (
              <Notice kind="warn">Wallet check: {why.data.screening.reasons.map((r: any) => r.detail).join(" ")}</Notice>
            )}
            <p className="text-xs text-ink">
              Pays <AddressLink address={p.to} />
            </p>
            <div className="flex gap-2">
              <button className="btn" disabled={!signer.ready || act.busy} onClick={() => decide(p.id, true)}>Approve and pay</button>
              <button className="btn-ghost" disabled={!signer.ready || act.busy} onClick={() => decide(p.id, false)}>Reject</button>
            </div>
          </div>
        );
      })}
    </div>
  );
}

function safeCategory(hex: `0x${string}`) {
  try {
    return hexToString(hex, { size: 32 }).replace(/\0/g, "");
  } catch {
    return "";
  }
}
