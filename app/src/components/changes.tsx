"use client";

import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { usePathname } from "next/navigation";
import type { Address, Hex } from "viem";
import { useBusiness } from "./business";
import { ConnectOwner, useOwnerSigner } from "./signer";
import { Notice, useAction } from "./ui";
import { encodeVaultCall, ownerBatch } from "@/lib/owner-tx";

// Vault changes the owner has set but not yet approved. They all go to the vault together,
// in one transaction, when the owner presses "Approve all changes".
export type Change = { key: string; label: string; data: Hex };
type Ctx = {
  changes: Change[];
  /** Adds a change, replacing an earlier one with the same key. */
  add: (key: string, label: string, functionName: string, args: readonly unknown[]) => void;
  pending: (key: string) => Change | undefined;
  remove: (key: string) => void;
  clear: () => void;
  /** Goes up after the changes are sent, so pages re-read the vault. */
  version: number;
  sent: () => void;
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

  // Updates build on the latest list, so several changes added at once all stay.
  const save = (update: (prev: Change[]) => Change[]) =>
    setChanges((prev) => {
      const next = update(prev);
      try {
        localStorage.setItem(storageKey(vault.address), JSON.stringify(next));
      } catch {}
      return next;
    });

  const ctx: Ctx = {
    changes,
    add: (key, label, functionName, args) => {
      const data = encodeVaultCall(functionName, args);
      save((prev) => [...prev.filter((c) => c.key !== key), { key, label, data }]);
    },
    pending: (key) => changes.find((c) => c.key === key),
    remove: (key) => save((prev) => prev.filter((c) => c.key !== key)),
    clear: () => save(() => []),
    version,
    sent: () => setVersion((v) => v + 1),
  };

  // Rules & settings and Savings show the list lower down their own pages.
  const onSettings = ["/settings", "/savings"].includes(usePathname());
  return (
    <ChangesContext.Provider value={ctx}>
      {!onSettings && <ChangesBar className="mb-6" />}
      {children}
    </ChangesContext.Provider>
  );
}

export type PageChange = Change & { undo: () => void };

/**
 * The list of waiting vault changes and the one button that sends them all.
 * A page can add its own unsaved edits (`extra`), work to do first that needs no wallet (`before`),
 * and a reset once everything is saved (`after`).
 */
export function ChangesBar({ className = "", extra = [], before, after, hasBefore = false, beforeLabel }: { className?: string; extra?: PageChange[]; before?: () => Promise<void>; after?: () => void; hasBefore?: boolean; beforeLabel?: string }) {
  const { business, vault, reload } = useBusiness();
  const queue = useChanges();
  const signer = useOwnerSigner(business.owner_address);
  const act = useAction();
  const [done, setDone] = useState(false);
  const changes: (Change & { undo?: () => void })[] = [...queue.changes.filter((c) => !extra.some((e) => e.key === c.key)), ...extra];
  const clear = () => {
    queue.clear();
    extra.forEach((e) => e.undo());
  };
  const remove = (key: string) => {
    queue.remove(key);
    extra.find((e) => e.key === key)?.undo();
  };

  if (!changes.length && !hasBefore)
    return done ? <div className={className}><Notice kind="ok">Your changes are saved.</Notice></div> : null;

  return (
    <div className={`space-y-3 rounded-xl border border-rule bg-card p-4 ${className}`}>
      {changes.length > 0 && (
        <p className="text-sm font-medium">
          {changes.length === 1 ? "1 change" : `${changes.length} changes`} waiting for your approval
        </p>
      )}
      <ul className="space-y-1 text-sm text-body">
        {changes.map((c) => (
          <li key={c.key} className="flex items-center justify-between gap-3">
            <span>{c.label}</span>
            <button className="text-xs text-muted hover:text-ink" disabled={act.busy} onClick={() => remove(c.key)}>
              Remove
            </button>
          </li>
        ))}
        {hasBefore && beforeLabel && <li>{beforeLabel}</li>}
      </ul>
      {changes.length > 0 && <ConnectOwner owner={business.owner_address} />}
      {act.error && <Notice kind="bad">{act.error}</Notice>}
      <div className="flex flex-wrap items-center gap-2">
        <button
          className="btn"
          disabled={(changes.length > 0 && !signer.ready) || act.busy}
          onClick={() =>
            act.run(async () => {
              setDone(false);
              if (before) await before();
              if (changes.length) {
                await ownerBatch(signer.client!, vault.address, changes.map((c) => c.data));
                queue.clear();
              }
              await reload();
              after?.();
              queue.sent();
              setDone(true);
            })
          }
        >
          {act.busy ? "Working…" : changes.length ? "Approve all changes" : "Save"}
        </button>
        {changes.length > 0 && (
          <button className="btn-ghost" disabled={act.busy} onClick={clear}>
            Discard
          </button>
        )}
        {act.busy && changes.length > 0 && <span className="text-sm text-muted">Confirm in your wallet, then wait for Arc…</span>}
      </div>
    </div>
  );
}
