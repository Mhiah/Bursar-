"use client";

import { useState, type ReactNode } from "react";
import { useSeen } from "./motion";

type Cat = "Getting paid" | "Paying" | "Safety";

type Service = { title: string; text: string; meta: string; tag: string; cat: Cat; art: (on: boolean) => ReactNode };

const Chip = ({ tone, children }: { tone: "ok" | "warn" | "bad" | "plain"; children: ReactNode }) => {
  const c = { ok: "bg-site-mint text-site-green", warn: "bg-site-goldsoft text-[#8a6410]", bad: "bg-site-redsoft text-site-red", plain: "bg-site-panel text-site-body" }[tone];
  return <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${c}`}>{children}</span>;
};

const Row = ({ i, on, children }: { i: number; on: boolean; children: ReactNode }) => (
  <div className={`${on ? "site-in" : "opacity-0"} flex items-center justify-between gap-2 rounded-lg bg-white px-3 py-2 text-[12px] shadow-[0_1px_2px_rgba(17,35,26,0.06)]`} style={{ animationDelay: `${i * 140}ms` }}>
    {children}
  </div>
);

const services: Service[] = [
  {
    title: "Get paid",
    text: "Send an invoice with a pay link. When the money lands, Bursar matches it to the right invoice.",
    meta: "Matched for you",
    tag: "USDC · EURC · other chains",
    cat: "Getting paid",
    art: (on) => (
      <div className="relative w-[78%] rounded-xl bg-white p-3.5 text-[12px] shadow-[0_6px_20px_-8px_rgba(17,35,26,0.25)]">
        <div className="flex justify-between font-code text-[10px] tracking-wider text-site-muted">
          <span>INVOICE</span>
          <span>INV-1042</span>
        </div>
        <p className="mt-2 font-medium text-site-ink">Ada Bakes</p>
        <p className="font-head text-xl font-bold text-site-ink">1,200.00 <span className="text-[11px] font-semibold text-site-muted">USDC</span></p>
        <div className="mt-2 h-1.5 w-2/3 rounded bg-site-panel" />
        <div className="mt-1 h-1.5 w-1/2 rounded bg-site-panel" />
        {on && <span className="site-stamp absolute right-3 top-9 rounded-md border-2 border-site-green px-2 py-0.5 font-code text-[11px] font-medium tracking-widest text-site-green">PAID</span>}
      </div>
    ),
  },
  {
    title: "Chase late payers",
    text: "Polite reminders by email, Telegram or WhatsApp, firmer when needed, with instalments inside your limits.",
    meta: "Most important first",
    tag: "Email · Telegram · WhatsApp",
    cat: "Getting paid",
    art: (on) => (
      <div className="flex w-[82%] flex-col gap-1.5">
        {[
          ["Email", "INV-1039 is 12 days late."],
          ["WhatsApp", "Pay in two parts of 150.00?"],
          ["Ada", "Yes please!"],
        ].map(([who, msg], i) => (
          <div key={who} className={`${on ? "site-in" : "opacity-0"} max-w-[88%] rounded-2xl px-3 py-1.5 text-[12px] ${i === 2 ? "self-end rounded-br-sm bg-site-deep text-white" : "rounded-bl-sm bg-white text-site-ink shadow-[0_1px_2px_rgba(17,35,26,0.08)]"}`} style={{ animationDelay: `${i * 380}ms` }}>
            <span className={`block font-code text-[9px] uppercase tracking-wider ${i === 2 ? "text-white/60" : "text-site-muted"}`}>{who}</span>
            {msg}
          </div>
        ))}
      </div>
    ),
  },
  {
    title: "Pay bills",
    text: "Pays suppliers on time, holds when cash is tight, and pays early when it helps. Big ones wait for you.",
    meta: "Inside your limits",
    tag: "Per payment · monthly budgets",
    cat: "Paying",
    art: (on) => (
      <div className="flex w-[84%] flex-col gap-1.5">
        <Row i={0} on={on}><span>Flour Co</span><span className="flex items-center gap-2 font-code">320.00 <Chip tone="ok">Paid</Chip></span></Row>
        <Row i={1} on={on}><span>Power</span><span className="flex items-center gap-2 font-code">140.00 <Chip tone="plain">Held</Chip></span></Row>
        <Row i={2} on={on}><span>Ovens</span><span className="flex items-center gap-2 font-code">2,400.00 <Chip tone="warn">Asks you</Chip></span></Row>
      </div>
    ),
  },
  {
    title: "Keep a reserve",
    text: "Spare cash moves to a reserve, and the vault never lets the agent dip below the floor you set.",
    meta: "Never below your floor",
    tag: "Floor · operating · reserve",
    cat: "Paying",
    art: (on) => (
      <div className="w-[84%] rounded-xl bg-white p-3.5 shadow-[0_6px_20px_-8px_rgba(17,35,26,0.25)]">
        <div className="flex h-3 overflow-hidden rounded-full bg-site-panel">
          {[
            ["25%", "bg-site-ink"],
            ["45%", "bg-site-green"],
            ["30%", "bg-site-gold"],
          ].map(([w, c], i) => (
            <span key={c} className={`h-full ${c} transition-[width] duration-1000 ease-out`} style={{ width: on ? w : "0%", transitionDelay: `${i * 250}ms` }} />
          ))}
        </div>
        <div className="mt-3 grid grid-cols-3 gap-1 text-[11px]">
          {[
            ["Floor", "1,000"],
            ["Operating", "1,840"],
            ["Reserve", "1,200"],
          ].map(([k, v]) => (
            <div key={k}>
              <p className="text-site-muted">{k}</p>
              <p className="font-code font-medium text-site-ink">{v}</p>
            </div>
          ))}
        </div>
      </div>
    ),
  },
  {
    title: "Check every wallet",
    text: "Sanctions lists, brand-new wallets and lookalike addresses are caught before a single cent moves.",
    meta: "Before money moves",
    tag: "Chainalysis · lookalikes",
    cat: "Safety",
    art: (on) => (
      <div className="flex w-[84%] flex-col gap-1.5">
        <Row i={0} on={on}><span className="font-code">0x8f3a…21c0</span><Chip tone="ok">Safe</Chip></Row>
        <Row i={1} on={on}><span className="font-code">0x8f3a…21c1</span><Chip tone="warn">Lookalike</Chip></Row>
        <Row i={2} on={on}><span className="font-code">0x0000…dEaD</span><Chip tone="bad">Blocked</Chip></Row>
      </div>
    ),
  },
  {
    title: "Catch duplicate bills",
    text: "Same supplier, same amount, a few days apart? Bursar spots it and asks before paying twice.",
    meta: "Never pays twice",
    tag: "Invoice matching",
    cat: "Safety",
    art: (on) => (
      <div className="relative h-[120px] w-[80%]">
        {[0, 1].map((i) => (
          <div
            key={i}
            className="absolute w-[78%] rounded-xl bg-white p-3 text-[12px] shadow-[0_6px_20px_-8px_rgba(17,35,26,0.25)] transition-all duration-700 ease-out"
            style={{ left: on ? `${i * 22}%` : "11%", top: on ? `${i * 26}px` : "13px", transitionDelay: `${i * 150}ms` }}
          >
            <div className="flex justify-between font-code text-[10px] text-site-muted">
              <span>FLOUR CO</span>
              <span>{i ? "F-019" : "F-017"}</span>
            </div>
            <p className="mt-1 font-head text-base font-bold">320.00</p>
            {i === 1 && on && <span className="site-stamp absolute -right-2 -top-2 rounded-full bg-site-red px-2 py-0.5 text-[10px] font-semibold text-white">Duplicate?</span>}
          </div>
        ))}
      </div>
    ),
  },
  {
    title: "Log every decision",
    text: "Each decision is written down with its reason. The fingerprints link together and land on Arc.",
    meta: "Anyone can check it",
    tag: "Recorded on Arc",
    cat: "Safety",
    art: (on) => (
      <div className="w-[84%] rounded-xl bg-white p-3 font-code text-[11px] shadow-[0_6px_20px_-8px_rgba(17,35,26,0.25)]">
        {[
          ["PAID", "0x8ead…f592"],
          ["HELD", "0x77f0…ee21"],
          ["ASKED", "0x41c2…09ab"],
        ].map(([k, h], i) => (
          <div key={h} className={`${on ? "site-in" : "opacity-0"} flex justify-between border-b border-dashed border-site-line py-1.5 last:border-0`} style={{ animationDelay: `${i * 160}ms` }}>
            <span className="text-site-green">{k}</span>
            <span className="text-site-muted">{h}</span>
          </div>
        ))}
        <p className="mt-1.5 text-[10px] text-site-green">✓ chain verified</p>
      </div>
    ),
  },
  {
    title: "Take any USDC or EURC",
    text: "Customers pay in EURC or from another network. It arrives in your vault as USDC on Arc.",
    meta: "One link, many ways to pay",
    tag: "Circle swap · bridge",
    cat: "Getting paid",
    art: (on) => (
      <div className="flex w-[84%] flex-col gap-2 text-[12px]">
        {[
          ["EURC", "USDC"],
          ["Base", "Arc"],
          ["Ethereum", "Arc"],
        ].map(([a, b], i) => (
          <div key={a} className={`${on ? "site-in" : "opacity-0"} flex items-center justify-between rounded-lg bg-white px-3 py-2 shadow-[0_1px_2px_rgba(17,35,26,0.06)]`} style={{ animationDelay: `${i * 160}ms` }}>
            <span className="font-medium">{a}</span>
            <svg width="40" height="10" viewBox="0 0 40 10" className="text-site-green" aria-hidden>
              <line x1="0" y1="5" x2="34" y2="5" stroke="currentColor" strokeWidth="1.5" className="site-flow" />
              <path d="M33 1l5 4-5 4" fill="none" stroke="currentColor" strokeWidth="1.5" />
            </svg>
            <span className="font-medium text-site-green">{b}</span>
          </div>
        ))}
      </div>
    ),
  },
];

const cats: ("Everything" | Cat)[] = ["Everything", "Getting paid", "Paying", "Safety"];

function Card({ s, i }: { s: Service; i: number }) {
  const [ref, seen] = useSeen<HTMLDivElement>(0.25);
  return (
    <div
      ref={ref}
      className={`site-reveal ${seen ? "is-in" : ""} group flex flex-col overflow-hidden rounded-[22px] border border-site-line bg-site-card transition-shadow duration-300 hover:shadow-[0_18px_40px_-20px_rgba(17,35,26,0.35)]`}
      style={{ transitionDelay: `${(i % 4) * 90}ms` }}
    >
      <div className="flex h-[184px] items-center justify-center bg-site-panel transition-colors duration-300 group-hover:bg-[#EAE7DD]">{s.art(seen)}</div>
      <div className="flex flex-1 flex-col p-5">
        <h3 className="font-head text-[19px] font-bold tracking-[-0.015em] text-site-ink">{s.title}</h3>
        <p className="mt-1.5 flex-1 text-[14px] leading-relaxed text-site-body">{s.text}</p>
        <div className="mt-4 flex items-center justify-between border-t border-site-line pt-3 text-[12px]">
          <span className="font-semibold text-site-green">{s.meta}</span>
          <span className="font-code text-site-muted">{s.tag.split(" · ")[0]}</span>
        </div>
      </div>
    </div>
  );
}

export function Services() {
  const [cat, setCat] = useState<(typeof cats)[number]>("Everything");
  const shown = services.filter((s) => cat === "Everything" || s.cat === cat);
  return (
    <>
      <div className="mt-8 flex flex-wrap gap-2" role="tablist" aria-label="Filter">
        {cats.map((c) => (
          <button
            key={c}
            role="tab"
            aria-selected={cat === c}
            onClick={() => setCat(c)}
            className={`rounded-full border px-4 py-2 text-sm font-medium transition-colors duration-200 ${cat === c ? "border-site-deep bg-site-deep text-white" : "border-site-line bg-white text-site-ink hover:border-site-ink/30"}`}
          >
            {c}
          </button>
        ))}
      </div>
      <div key={cat} className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {shown.map((s, i) => (
          <Card key={s.title} s={s} i={i} />
        ))}
      </div>
    </>
  );
}
