"use client";

import { useState } from "react";
import { useBusiness } from "@/components/business";
import { api, Field, Notice, useAction } from "@/components/ui";

// How the agent works. Bursar keeps these, not the vault, so saving needs no wallet.
// The hard limits the agent can't break are on the Rules page.
export default function AgentSettings() {
  const { business, reload } = useBusiness();
  const [s, setS] = useState(business.settings);
  const [done, setDone] = useState<string | null>(null);
  const saveSettings = useAction();

  return (
    <div className="space-y-8">
      <h1 className="h-page">Agent settings</h1>
      <p className="max-w-2xl text-sm text-muted">Guidance the agent follows inside your rules. Saving here needs no wallet.</p>
      {done && <Notice kind="ok">{done}</Notice>}
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
        <button
          className="btn"
          disabled={saveSettings.busy}
          onClick={() => saveSettings.run(async () => { setDone(null); await api("/api/business/settings", { method: "POST", json: s }); await reload(); setDone("Agent settings saved."); })}
        >
          Save
        </button>
        {saveSettings.error && <Notice kind="bad">{saveSettings.error}</Notice>}
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
