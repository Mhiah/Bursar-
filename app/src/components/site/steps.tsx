"use client";

import { useEffect, useState, type ReactNode } from "react";
import { reduced, useSeen } from "./motion";

const shadow = "shadow-[0_1px_2px_rgba(20,26,38,0.05),0_14px_36px_-16px_rgba(29,58,110,0.35)]";
const BLUE = "#1D3A6E";

function WalletArt() {
  return (
    <div className={`w-[290px] rounded-2xl bg-white p-5 ${shadow}`}>
      <p className="font-code text-[10px] tracking-widest text-site-muted">YOUR WALLET</p>
      <div className="mt-3 flex flex-col gap-2 text-sm">
        <span className="rounded-full bg-site-main px-4 py-2.5 text-center font-semibold text-white">Connect wallet</span>
        <span className="rounded-full border border-site-line px-4 py-2.5 text-center font-medium text-site-ink">Create one here</span>
      </div>
      <div className="site-in mt-4 flex items-center gap-2 rounded-xl bg-site-soft px-3 py-2 text-[12px] text-site-main" style={{ animationDelay: "700ms" }}>
        <span className="site-live h-2 w-2 rounded-full bg-site-main" /> Connected <span className="ml-auto font-code">0x5c1e…a77b</span>
      </div>
    </div>
  );
}

function VaultArt() {
  return (
    <div className="flex flex-col items-center">
      <svg width="210" height="200" viewBox="0 0 210 200" fill="none" aria-hidden>
        <rect x="15" y="10" width="180" height="180" rx="26" fill="#fff" stroke={BLUE} strokeWidth="2.5" />
        <rect x="32" y="27" width="146" height="146" rx="18" stroke="#C7D3E8" strokeWidth="1.5" />
        <g className="site-dial" style={{ transformOrigin: "105px 100px" }}>
          <circle cx="105" cy="100" r="44" fill="#EAEFF8" stroke={BLUE} strokeWidth="2.5" />
          <circle cx="105" cy="100" r="9" fill={BLUE} />
          {[0, 60, 120, 180, 240, 300].map((a) => (
            <line key={a} x1="105" y1="62" x2="105" y2="72" stroke={BLUE} strokeWidth="2.5" strokeLinecap="round" transform={`rotate(${a} 105 100)`} />
          ))}
        </g>
      </svg>
      <span className="site-in -mt-3 rounded-full bg-site-main px-3 py-1 font-code text-[11px] tracking-widest text-white" style={{ animationDelay: "1.3s" }}>
        VAULT OPEN · ARC
      </span>
    </div>
  );
}

function RulesArt() {
  const rows: [string, string][] = [
    ["Most per payment", "500.00"],
    ["Supplies, per month", "2,000.00"],
    ["Cash to always keep", "1,000.00"],
    ["Pay new wallets", "Ask me"],
  ];
  return (
    <div className={`w-[310px] rounded-2xl bg-white p-5 ${shadow}`}>
      <p className="font-code text-[10px] tracking-widest text-site-muted">YOUR RULES</p>
      {rows.map(([k, v], i) => (
        <div key={k} className="site-in flex items-center justify-between border-b border-site-line py-2.5 text-[13px] last:border-0" style={{ animationDelay: `${150 + i * 220}ms` }}>
          <span className="text-site-body">{k}</span>
          <span className="rounded-md bg-site-soft px-2 py-0.5 font-code text-[12px] text-site-main">{v}</span>
        </div>
      ))}
      <p className="site-in mt-2 text-[11px] font-semibold text-site-main" style={{ animationDelay: "1.1s" }}>
        ✓ Locked into your vault
      </p>
    </div>
  );
}

function DayArt() {
  const lines: [string, string, boolean][] = [
    ["Matched INV-1042", "+1,200.00", true],
    ["Paid Flour Co", "−320.00", true],
    ["Moved to reserve", "500.00", true],
    ["Ovens, over your limit", "asks you", false],
  ];
  return (
    <div className={`w-[320px] rounded-2xl bg-white p-5 ${shadow}`}>
      <div className="flex items-center justify-between">
        <p className="font-code text-[10px] tracking-widest text-site-muted">TODAY</p>
        <span className="flex items-center gap-1.5 text-[11px] font-medium text-site-main">
          <span className="site-live h-1.5 w-1.5 rounded-full bg-site-main" /> on duty
        </span>
      </div>
      {lines.map(([k, v, ok], i) => (
        <div key={k} className="site-in flex items-center gap-2.5 border-b border-site-line py-2.5 text-[13px] last:border-0" style={{ animationDelay: `${150 + i * 380}ms` }}>
          <span className={`flex h-5 w-5 items-center justify-center rounded-full text-[10px] ${ok ? "bg-site-main text-white" : "border border-site-main text-site-main"}`}>{ok ? "✓" : "?"}</span>
          <span className="flex-1 text-site-ink">{k}</span>
          <span className={`font-code text-[12px] ${ok ? "text-site-body" : "font-semibold text-site-main"}`}>{v}</span>
        </div>
      ))}
    </div>
  );
}

const steps: { title: string; sub: string; body: ReactNode; Art: () => JSX.Element }[] = [
  { title: "Bring your wallet", sub: "You keep the keys", body: <>Connect the wallet you already use, or make one here in a minute. Nobody, Bursar included, can recover or use your keys.</>, Art: WalletArt },
  { title: "Open your vault on Arc", sub: "A contract only you own", body: <>One signature makes a vault that only your wallet controls. Customers pay into it, and Bursar never holds your money.</>, Art: VaultArt },
  { title: "Write the rules", sub: "The vault enforces them", body: <>Set the most it may pay at once, monthly budgets and the cash it must always keep. Even a wrong or tricked agent can&apos;t go past them.</>, Art: RulesArt },
  { title: "Let it keep the books", sub: "It asks before big calls", body: <>Bursar collects, pays, holds, reserves and chases on its own, and writes down why. Anything outside your rules waits for you.</>, Art: DayArt },
];

const STEP_MS = 5000;

export function Steps() {
  const [ref, seen] = useSeen<HTMLDivElement>(0.35);
  const [active, setActive] = useState(0);
  const [paused, setPaused] = useState(false);
  useEffect(() => {
    if (!seen || paused || reduced()) return;
    const id = setTimeout(() => setActive((a) => (a + 1) % steps.length), STEP_MS);
    return () => clearTimeout(id);
  }, [seen, active, paused]);
  const { Art } = steps[active];
  return (
    <div ref={ref} className="grid gap-6 lg:grid-cols-[0.9fr_1.1fr]" onMouseEnter={() => setPaused(true)} onMouseLeave={() => setPaused(false)}>
      <ol className="flex flex-col gap-2">
        {steps.map((s, i) => {
          const on = i === active;
          return (
            <li key={s.title}>
              <button
                onClick={() => setActive(i)}
                aria-expanded={on}
                className={`w-full rounded-[20px] border p-5 text-left transition-all duration-300 ${on ? "border-site-mid bg-white shadow-[0_18px_40px_-26px_rgba(29,58,110,0.45)]" : "border-transparent hover:bg-white/70"}`}
              >
                <div className="flex items-center gap-4">
                  <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full font-head text-sm font-bold transition-colors duration-300 ${on ? "bg-site-main text-white" : "bg-site-soft text-site-main"}`}>{i + 1}</span>
                  <span>
                    <span className="block font-head text-[19px] font-bold text-site-ink">{s.title}</span>
                    <span className="text-[13px] font-medium text-site-main">{s.sub}</span>
                  </span>
                </div>
                <div className={`grid transition-[grid-template-rows] duration-500 ease-out ${on ? "grid-rows-[1fr]" : "grid-rows-[0fr]"}`}>
                  <div className="overflow-hidden">
                    <p className="pl-[52px] pt-3 text-[15px] leading-relaxed text-site-body">{s.body}</p>
                    <div className="ml-[52px] mt-4 h-[3px] overflow-hidden rounded-full bg-site-soft">
                      {on && seen && <div key={`${active}-${paused}`} className="site-fill h-full w-full bg-site-main" style={{ animationDuration: `${STEP_MS}ms`, animationPlayState: paused ? "paused" : "running" }} />}
                    </div>
                  </div>
                </div>
              </button>
            </li>
          );
        })}
      </ol>
      <div className="flex min-h-[380px] items-center justify-center rounded-[26px] border border-site-line bg-site-panel p-8">
        <div key={active} className="site-in flex justify-center">
          <Art />
        </div>
      </div>
    </div>
  );
}
