"use client";

import { useEffect, useState } from "react";
import { Count, useSeen } from "./motion";

const decisions = [
  ["PAID", "Flour Co 320.00. Due Friday and cash covers the next month."],
  ["MATCHED", "Ada Bakes paid INV-1042 in full, 1,200.00."],
  ["HELD", "Power bill until Friday. A large payment is expected Thursday."],
  ["ASKED YOU", "Oven Supply 2,400.00 is over your per-payment limit."],
  ["RESERVE", "Moved 500.00 aside. More than the next 30 days need."],
];

// node positions in the 560 x 330 drawing
const N = { cust: [70, 80], vault: [280, 165], supp: [490, 80], res: [150, 285], you: [410, 285] } as const;
const path = (a: readonly number[], b: readonly number[]) => `M${a[0]},${a[1]} C${(a[0] + b[0]) / 2},${a[1]} ${(a[0] + b[0]) / 2},${b[1]} ${b[0]},${b[1]}`;
const flows = [
  { d: path(N.cust, N.vault), c: "#7FD39B", dur: 2.4 },
  { d: path(N.vault, N.supp), c: "#E7B23A", dur: 2.8 },
  { d: path(N.vault, N.res), c: "#9DB8F5", dur: 3.2 },
  { d: path(N.vault, N.you), c: "#F29C83", dur: 3.6 },
];

function Node({ at, label, sub, big }: { at: readonly number[]; label: string; sub: string; big?: boolean }) {
  const w = big ? 132 : 108;
  const h = big ? 64 : 50;
  return (
    <g transform={`translate(${at[0] - w / 2},${at[1] - h / 2})`}>
      <rect width={w} height={h} rx="14" fill={big ? "#1E7A4C" : "#16301F"} stroke={big ? "#7FD39B" : "#2C4A37"} />
      <text x={w / 2} y={big ? 28 : 22} textAnchor="middle" fontSize={big ? 15 : 12.5} fontWeight="600" fill="#fff" fontFamily="var(--font-text)">
        {label}
      </text>
      <text x={w / 2} y={big ? 46 : 38} textAnchor="middle" fontSize="10" fill="#A9BDB0" fontFamily="var(--font-code)">
        {sub}
      </text>
    </g>
  );
}

export function Vault() {
  const [ref, seen] = useSeen<HTMLDivElement>(0.3);
  const [k, setK] = useState(0);
  useEffect(() => {
    if (!seen) return;
    const t = setInterval(() => setK((x) => (x + 1) % decisions.length), 3200);
    return () => clearInterval(t);
  }, [seen]);
  const [kind, text] = decisions[k];
  return (
    <div ref={ref} className="rounded-[22px] border border-white/10 bg-[#0B1C13] p-5 md:p-6">
      <div className="flex justify-between font-code text-[10px] tracking-widest text-[#A9BDB0]">
        <span>YOUR VAULT · ARC MAINNET</span>
        <span className="flex items-center gap-1.5">
          <span className="site-live h-1.5 w-1.5 rounded-full bg-[#7FD39B]" /> LIVE
        </span>
      </div>
      <svg viewBox="0 0 560 330" className="mt-2 w-full" role="img" aria-label="Money flowing from customers into your vault, then to suppliers, your reserve, or to you for approval">
        {flows.map((f) => (
          <path key={f.d} d={f.d} fill="none" stroke="#2C4A37" strokeWidth="2" />
        ))}
        {seen &&
          flows.map((f) =>
            [0, 1, 2].map((j) => (
              <circle key={f.d + j} r="4" fill={f.c}>
                <animateMotion dur={`${f.dur}s`} begin={`${j * (f.dur / 3)}s`} repeatCount="indefinite" path={f.d} />
              </circle>
            )),
          )}
        <Node at={N.cust} label="Customers" sub="invoices paid" />
        <Node at={N.supp} label="Suppliers" sub="bills paid" />
        <Node at={N.res} label="Reserve" sub="set aside" />
        <Node at={N.you} label="You" sub="big calls" />
        <Node at={N.vault} label="Your vault" sub="rules enforced" big />
      </svg>
      <div className="mt-3 grid grid-cols-3 gap-3 border-t border-white/10 pt-4">
        {[
          ["Operating", 1840],
          ["Reserve", 1200],
          ["Floor kept", 1000],
        ].map(([l, v]) => (
          <div key={l as string}>
            <p className="font-code text-[10px] uppercase tracking-widest text-[#A9BDB0]">{l}</p>
            <p className="mt-0.5 font-head text-xl font-bold text-white">
              <Count to={v as number} decimals={2} />
            </p>
          </div>
        ))}
      </div>
      <div className="mt-4 rounded-xl bg-white/5 px-4 py-3">
        <p className="font-code text-[10px] tracking-widest text-[#A9BDB0]">LATEST DECISION</p>
        <p key={k} className="site-in mt-1 text-[14px] text-white">
          <span className="mr-2 font-code text-[11px] text-[#7FD39B]">{kind}</span>
          {text}
        </p>
      </div>
    </div>
  );
}
