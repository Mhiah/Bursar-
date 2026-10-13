"use client";

import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import type { Address, Hex } from "viem";
import { useBusiness } from "./business";
import { ConnectOwner, useOwnerSigner } from "./signer";
import { Notice, useAction } from "./ui";
import { encodeVaultCall, ownerBatch } from "@/lib/owner-tx";

// Vault changes the owner has set but not yet approved. They all go to the vault together,
// in one transaction, when the owner presses "Approve all changes".
type Change = { key: string; label: string; data: Hex };
type Ctx = {
  changes: Change[];
  /** Adds a change, replacing an earlier one with the same key. */
  add: (key: string, label: string, functionName: string, args: readonly unknown[]) => void;
  pending: (key: string) => Change | undefined;
  /** Goes up after the changes are sent, so pages re-read the vault. */
  version: number;
};

const ChangesContext = createContext<Ctx | null>(null);
export const useChanges = () => useContext(ChangesContext)!;

const storageKey = (vault: Address) => `bursar:changes:${vault.toLowerCase()}`;

export function ChangesProvider({ children }: { children: ReactNode }) {
  const { vault } = useBusiness();
  const [changes, setChanges] = useState<Change[]>([]);
  const [version, setVersion] = useState(0);

  useEffect(() => {
    try {
      setChanges(JSON.parse(localStorage.getItem(storageKey(vault.address)) || "[]"));
    } catch {}
  }, [vault.address]);

  const save = (next: Change[]) => {
    setChanges(next);
    try {
      localStorage.setItem(storageKey(vault.address), JSON.stringify(next));
    } catch {}
  };

  const ctx: Ctx = {
    changes,
    add: (key, label, functionName, args) => save([...changes.filter((c) => c.key !== key), { key, label, data: encodeVaultCall(functionName, args) }]),
    pending: (key) => changes.find((c) => c.key === key),
    version,
  };

  return (
    <ChangesContext.Provider value={ctx}>
      <ChangesBar changes={changes} clear={() => save([])} remove={(key) => save(changes.filter((c) => c.key !== key))} sent={() => setVersion((v) => v + 1)} />
      {children}
    </ChangesContext.Provider>
  );
}

function ChangesBar({ changes, clear, remove, sent }: { changes: Change[]; clear: () => void; remove: (key: string) => void; sent: () => void }) {
  const { business, vault, reload } = useBusiness();
  const signer = useOwnerSigner(business.owner_address);
  const act = useAction();
  const [done, setDone] = useState(false);

  if (!changes.length)
    return done ? <div className="mb-6"><Notice kind="ok">Your changes are on your vault.</Notice></div> : null;

  return (
    <div className="mb-6 space-y-3 rounded-xl border border-rule bg-card p-4">
      <p className="text-sm font-medium">
        {changes.length === 1 ? "1 change" : `${changes.length} changes`} waiting for your approval
      </p>
      <ul className="space-y-1 text-sm text-body">
        {changes.map((c) => (
          <li key={c.key} className="flex items-center justify-between gap-3">
            <span>{c.label}</span>
            <button className="text-xs text-muted hover:text-ink" disabled={act.busy} onClick={() => remove(c.key)}>
              Remove
            </button>
          </li>
        ))}
      </ul>
      <ConnectOwner owner={business.owner_address} />
      {act.error && <Notice kind="bad">{act.error}</Notice>}
      <div className="flex flex-wrap items-center gap-2">
        <button
          className="btn"
          disabled={!signer.ready || act.busy}
          onClick={() =>
            act.run(async () => {
              setDone(false);
              await ownerBatch(signer.client!, vault.address, changes.map((c) => c.data));
              clear();
              await reload();
              sent();
              setDone(true);
            })
          }
        >
          {act.busy ? "Working…" : "Approve all changes"}
        </button>
        <button className="btn-ghost" disabled={act.busy} onClick={clear}>
          Discard
        </button>
        {act.busy && <span className="text-sm text-muted">Confirm in your wallet, then wait for Arc…</span>}
      </div>
    </div>
  );
}
