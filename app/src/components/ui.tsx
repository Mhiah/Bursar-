"use client";

import { useCallback, useEffect, useState, type ReactNode } from "react";
import { explorerAddress, explorerTx } from "@/lib/arc";

export async function api<T = any>(url: string, init?: RequestInit & { json?: unknown }): Promise<T> {
  const res = await fetch(url, {
    ...init,
    headers: { "Content-Type": "application/json", ...(init?.headers || {}) },
    body: init?.json !== undefined ? JSON.stringify(init.json) : init?.body,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `Request failed (${res.status})`);
  return data as T;
}

/** Fetch JSON on mount, with a reload function. */
export function useApi<T = any>(url: string | null) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const reload = useCallback(async () => {
    if (!url) return;
    setLoading(true);
    try {
      setData(await api<T>(url));
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, [url]);
  useEffect(() => {
    reload();
  }, [reload]);
  return { data, error, loading, reload };
}

export function Field({ label, children, hint }: { label: string; children: ReactNode; hint?: string }) {
  return (
    <label className="block">
      <span className="label">{label}</span>
      {children}
      {hint && <span className="mt-1 block text-xs text-black/50">{hint}</span>}
    </label>
  );
}

export function Notice({ kind = "info", children }: { kind?: "info" | "warn" | "bad" | "ok"; children: ReactNode }) {
  const tone = {
    info: "bg-black/[0.03] border-black/10",
    warn: "bg-amber-50 border-amber-200 text-amber-900",
    bad: "bg-red-50 border-red-200 text-red-900",
    ok: "bg-brand-soft border-brand/20 text-brand",
  }[kind];
  return <div className={`rounded-lg border px-4 py-3 text-sm ${tone}`}>{children}</div>;
}

export function Status({ value }: { value: string }) {
  const tone: Record<string, string> = {
    paid: "bg-brand-soft text-brand",
    clear: "bg-brand-soft text-brand",
    open: "bg-blue-50 text-blue-800",
    new: "bg-blue-50 text-blue-800",
    scheduled: "bg-blue-50 text-blue-800",
    part_paid: "bg-amber-50 text-amber-900",
    held: "bg-amber-50 text-amber-900",
    review: "bg-amber-50 text-amber-900",
    awaiting_approval: "bg-amber-50 text-amber-900",
    blocked: "bg-red-50 text-red-800",
    rejected: "bg-red-50 text-red-800",
    cancelled: "bg-black/5 text-black/50",
  };
  return <span className={`pill ${tone[value] ?? "bg-black/5 text-black/70"}`}>{value.replace(/_/g, " ")}</span>;
}

export const short = (a?: string | null) => (a ? `${a.slice(0, 6)}…${a.slice(-4)}` : "");

export function AddressLink({ address }: { address: string }) {
  return (
    <a className="font-mono text-xs text-brand underline-offset-2 hover:underline" href={explorerAddress(address)} target="_blank" rel="noreferrer">
      {short(address)}
    </a>
  );
}

export function TxLink({ hash, label }: { hash: string; label?: string }) {
  return (
    <a className="font-mono text-xs text-brand underline-offset-2 hover:underline" href={explorerTx(hash)} target="_blank" rel="noreferrer">
      {label ?? short(hash)}
    </a>
  );
}

export function Money({ value, className = "" }: { value: string | number; className?: string }) {
  const n = Number(value);
  return <span className={`tabular-nums ${className}`}>{n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 6 })} USDC</span>;
}

/** Run an async action with a busy flag and an error message. */
export function useAction() {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const run = useCallback(async <T,>(fn: () => Promise<T>): Promise<T | undefined> => {
    setBusy(true);
    setError(null);
    try {
      return await fn();
    } catch (e: any) {
      setError(e?.shortMessage || e?.message || String(e));
    } finally {
      setBusy(false);
    }
  }, []);
  return { busy, error, run, setError };
}
