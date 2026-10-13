"use client";

import { useState } from "react";
import { Notice, TxLink, useApi } from "@/components/ui";

const kinds: Record<string, string> = {
  pay: "Paid", early_pay: "Paid early", hold: "Held", approval: "Asked you", block: "Blocked", reserve: "Reserve",
  release: "Reserve", chase: "Chased", instalment: "Instalments", screen: "Wallet check", match: "Matched", save: "Saved", note: "Note",
};

export default function Log() {
  const { data } = useApi<{ decisions: any[]; integrity: any }>("/api/decisions?limit=500");
  const [open, setOpen] = useState<string | null>(null);
  return (
    <div className="space-y-6">
      <h1 className="h-page">Decision log</h1>
      <p className="max-w-2xl text-sm text-muted">
        Every decision the agent makes, with its reason. Each entry's fingerprint includes the one before it, and the latest fingerprint is
        written to your vault on Arc, so the log can't be changed after the fact without it showing.
      </p>
      {data?.integrity &&
        (data.integrity.ok ? (
          <Notice kind="ok">All {data.integrity.count} entries check out.</Notice>
        ) : (
          <Notice kind="bad">The log doesn't match its fingerprints from entry {data.integrity.brokenAt}. Something was changed.</Notice>
        ))}
      <div className="card divide-y divide-rule-soft p-0">
        {data?.decisions.map((d) => (
          <div key={d.id} className="px-5 py-3">
            <button className="w-full text-left" onClick={() => setOpen(open === d.id ? null : d.id)}>
              <div className="flex items-baseline gap-3">
                <span className="w-24 shrink-0 text-xs font-medium uppercase tracking-wide text-muted">{kinds[d.kind] ?? d.kind}</span>
                <span className="flex-1 text-sm font-medium">{d.summary}</span>
                <span className="shrink-0 text-xs text-muted">{new Date(d.created_at).toLocaleString()}</span>
              </div>
            </button>
            <p className="mt-1 pl-[6.75rem] text-sm text-muted">{d.reasoning}</p>
            {open === d.id && (
              <div className="mt-2 space-y-1 pl-[6.75rem] text-xs text-muted">
                {d.data?.tx && <p>Transaction <TxLink hash={d.data.tx} /></p>}
                {d.anchor_tx && <p>Fingerprint written to Arc in <TxLink hash={d.anchor_tx} /></p>}
                <p className="break-all font-mono">Fingerprint {d.hash}</p>
              </div>
            )}
          </div>
        ))}
        {!data?.decisions.length && <p className="px-5 py-4 text-sm text-muted">No decisions yet.</p>}
      </div>
    </div>
  );
}
