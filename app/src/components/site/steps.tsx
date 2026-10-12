"use client";

import type { ReactNode } from "react";
import { useSeen } from "./motion";

const card = "rounded-2xl bg-white shadow-[0_10px_30px_-12px_rgba(17,35,26,0.3)]";

function WalletArt({ on }: { on: boolean }) {
  return (
    <div className={`${card} w-[280px] p-5`}>
      <p className="font-code text-[10px] tracking-widest text-site-muted">YOUR WALLET</p>
      <div className="mt-3 flex flex-col gap-2 text-sm">
        <span className="rounded-full bg-site-deep px-4 py-2.5 text-center font-semibold text-white">Connect wallet</span>
        <span className="rounded-full border border-site-line px-4 py-2.5 text-center font-medium">Create one here</span>
      </div>
      <div className={`${on ? "site-in" : "opacity-0"} mt-4 flex items-center gap-2 rounded-lg bg-site-mint px-3 py-2 text-[12px] text-site-green`} style={{ animationDelay: "500ms" }}>
        <span className="h-2 w-2 rounded-full bg-site-green" /> Connected <span className="ml-auto font-code">0x5c1e…a77b</span>
      </div>
    </div>
  );
}

function VaultArt({ on }: { on: boolean }) {
  return (
    <svg width="230" height="220" viewBox="0 0 230 220" fill="none" aria-hidden>
      <rect x="25" y="20" width="180" height="180" rx="22" fill="#fff" stroke="#11231A" strokeWidth="2.5" />
      <rect x="40" y="35" width="150" height="150" rx="14" stroke="#11231A" strokeWidth="1.5" strokeDasharray="3 5" />
      <g style={{ transformOrigin: "115px 110px", transform: on ? "rotate(180deg)" : "rotate(0deg)", transition: "transform 1.6s cubic-bezier(0.3, 0.8, 0.3, 1) 0.3s" }}>
        <circle cx="115" cy="110" r="42" fill="#E3F0DE" stroke="#11231A" strokeWidth="2.5" />
        <circle cx="115" cy="110" r="10" fill="#11231A" />
        {[0, 60, 120, 180, 240, 300].map((a) => (
          <line key={a} x1="115" y1="74" x2="115" y2="84" stroke="#11231A" strokeWidth="2.5" strokeLinecap="round" transform={`rotate(${a} 115 110)`} />
        ))}
      </g>
      <rect x="205" y="70" width="10" height="26" rx="3" fill="#11231A" />
      <rect x="205" y="124" width="10" height="26" rx="3" fill="#11231A" />
      <g className={on ? "site-in" : "opacity-0"} style={{ animationDelay: "1.4s" }}>
        <rect x="70" y="190" width="90" height="24" rx="12" fill="#1E7A4C" />
        <text x="115" y="206" textAnchor="middle" fontSize="11" fontFamily="var(--font-code)" fill="#fff">ON ARC</text>
      </g>
    </svg>
  );
}

function RulesArt({ on }: { on: boolean }) {
  const rows: [string, string][] = [
    ["Most per payment", "500.00"],
    ["Supplies, per month", "2,000.00"],
    ["Cash to always keep", "1,000.00"],
    ["Pay new wallets", "Ask me"],
  ];
  return (
    <div className={`${card} w-[300px] p-5`}>
      <p className="font-code text-[10px] tracking-widest text-site-muted">YOUR RULES</p>
      <div className="mt-2">
        {rows.map(([k, v], i) => (
          <div key={k} className={`${on ? "site-in" : "opacity-0"} flex items-center justify-between border-b border-site-line py-2.5 text-[13px] last:border-0`} style={{ animationDelay: `${200 + i * 180}ms` }}>
            <span className="text-site-body">{k}</span>
            <span className="rounded-md bg-site-panel px-2 py-0.5 font-code text-[12px] text-site-ink">{v}</span>
          </div>
        ))}
      </div>
      <p className={`${on ? "site-in" : "opacity-0"} mt-3 text-[11px] font-medium text-site-green`} style={{ animationDelay: "1s" }}>
        ✓ Saved in your vault
      </p>
    </div>
  );
}

function ReceiptArt({ on }: { on: boolean }) {
  const lines: [string, string, boolean][] = [
    ["Matched INV-1042", "+1,200.00", true],
    ["Paid Flour Co", "−320.00", true],
    ["Moved to reserve", "500.00", true],
    ["Oven Supply, over limit", "asks you", false],
  ];
  return (
    <div className="w-[270px] border-2 border-b-0 border-site-ink bg-white px-5 pb-2 pt-4 font-code text-[12px]" style={{ clipPath: "polygon(0 0,100% 0,100% 100%,95% 97%,90% 100%,85% 97%,80% 100%,75% 97%,70% 100%,65% 97%,60% 100%,55% 97%,50% 100%,45% 97%,40% 100%,35% 97%,30% 100%,25% 97%,20% 100%,15% 97%,10% 100%,5% 97%,0 100%)" }}>
      <p className="text-center tracking-[0.2em] text-site-ink">BURSAR · TODAY</p>
      <div className="my-3 border-t border-dashed border-site-ink/40" />
      {lines.map(([k, v, ok], i) => (
        <div key={k} className={`${on ? "site-in" : "opacity-0"} flex items-center gap-2 py-1.5`} style={{ animationDelay: `${200 + i * 300}ms` }}>
          <span className={`flex h-4 w-4 items-center justify-center rounded-full border ${ok ? "border-site-green bg-site-mint text-site-green" : "border-site-gold bg-site-goldsoft text-[#8a6410]"} text-[9px]`}>{ok ? "✓" : "?"}</span>
          <span className="flex-1 text-site-ink">{k}</span>
          <span className={ok ? "text-site-ink" : "text-[#8a6410]"}>{v}</span>
        </div>
      ))}
      <div className="my-3 border-t border-dashed border-site-ink/40" />
      <p className={`${on ? "site-in" : "opacity-0"} pb-4 text-[10px] tracking-widest text-site-green`} style={{ animationDelay: "1.5s" }}>
        ✓ RECORDED ON ARC
      </p>
    </div>
  );
}

const steps: { title: string; sub: string; body: ReactNode; Art: (p: { on: boolean }) => JSX.Element }[] = [
  {
    title: "Bring your wallet.",
    sub: "You keep the keys. Always.",
    body: <>Connect the wallet you already use, or make one here in a minute. <b className="text-site-ink">Nobody, Bursar included, can recover or use your keys.</b></>,
    Art: WalletArt,
  },
  {
    title: "Open your vault on Arc.",
    sub: "Your money lives in a contract you own.",
    body: <>One signature makes a vault that only your wallet controls. Customers pay into it, and <b className="text-site-ink">Bursar never holds your money.</b></>,
    Art: VaultArt,
  },
  {
    title: "Write the rules.",
    sub: "The vault enforces them, not the agent.",
    body: <>Set the most it may pay at once, monthly budgets, and the cash it must always keep. <b className="text-site-ink">Even a wrong or tricked agent can&apos;t go past them.</b></>,
    Art: RulesArt,
  },
  {
    title: "Let it keep the books.",
    sub: "It asks you before anything outside the rules.",
    body: <>Bursar collects, pays, holds, reserves and chases on its own, and writes down why. <b className="text-site-ink">Bigger calls wait for your signature.</b></>,
    Art: ReceiptArt,
  },
];

function Step({ i, s }: { i: number; s: (typeof steps)[number] }) {
  const [ref, seen] = useSeen<HTMLDivElement>(0.45);
  const { Art } = s;
  return (
    <div ref={ref} className="sticky" style={{ top: `${96 + i * 18}px` }}>
      <div className="grid gap-6 rounded-[28px] border border-site-line bg-white p-6 shadow-[0_-12px_40px_-24px_rgba(17,35,26,0.25)] md:min-h-[430px] md:grid-cols-2 md:items-center md:p-10">
        <div>
          <p className="font-code text-xs tracking-widest text-site-muted">
            {String(i + 1).padStart(2, "0")} / {String(steps.length).padStart(2, "0")}
          </p>
          <h3 className="mt-4 font-head text-3xl font-bold tracking-[-0.015em] text-site-ink md:text-[38px]">{s.title}</h3>
          <p className="mt-2 font-semibold text-site-green">{s.sub}</p>
          <p className="mt-4 max-w-md leading-relaxed text-site-body">{s.body}</p>
        </div>
        <div className="site-grid flex min-h-[300px] items-center justify-center rounded-[20px] p-6">
          <Art on={seen} />
        </div>
      </div>
    </div>
  );
}

export function Steps() {
  return (
    <div className="flex flex-col gap-8 pb-10">
      {steps.map((s, i) => (
        <Step key={s.title} i={i} s={s} />
      ))}
    </div>
  );
}
