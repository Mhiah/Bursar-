"use client";

import { useState, type ReactNode } from "react";
import { useSeen, useTick } from "./motion";

type Cat = "Getting paid" | "Paying" | "Safety";
type Service = { title: string; text: string; meta: string; cat: Cat; Art: (p: { on: boolean }) => JSX.Element };

const shadow = "shadow-[0_1px_2px_rgba(20,26,38,0.05),0_8px_24px_-12px_rgba(29,58,110,0.25)]";

const Pill = ({ tone, children }: { tone: "main" | "soft" | "grey" | "bad"; children: ReactNode }) => {
  const c = { main: "bg-site-main text-white", soft: "bg-site-soft text-site-main", grey: "bg-[#F0F1F4] text-site-muted", bad: "bg-site-redsoft text-site-red" }[tone];
  return <span className={`whitespace-nowrap rounded-full px-2 py-0.5 text-[10.5px] font-semibold transition-colors duration-300 ${c}`}>{children}</span>;
};

/* ---- Get paid: an invoice that gets stamped, again and again ---- */
function InvoiceArt({ on }: { on: boolean }) {
  const t = useTick(on, 2600, 1);
  const paid = t % 2 === 1;
  return (
    <div className={`relative w-[76%] rounded-2xl bg-white p-4 text-[12px] ${shadow}`}>
      <div className="flex justify-between font-code text-[10px] tracking-wider text-site-muted">
        <span>INVOICE</span>
        <span>INV-1042</span>
      </div>
      <p className="mt-2 font-medium text-site-ink">Ada Bakes</p>
      <p className="font-head text-xl font-bold text-site-ink">
        1,200.00 <span className="text-[11px] font-semibold text-site-muted">USDC</span>
      </p>
      <div className="mt-2.5 h-1.5 overflow-hidden rounded-full bg-site-panel">
        <div className="h-full rounded-full bg-site-main transition-[width] duration-[1400ms] ease-out" style={{ width: paid ? "100%" : "0%" }} />
      </div>
      <p className="mt-1.5 text-[10.5px] text-site-muted">{paid ? "Paid in full, matched" : "Waiting for payment"}</p>
      {paid && (
        <span key={t} className="site-stamp absolute right-3 top-9 rounded-md border-2 border-site-main px-2 py-0.5 font-code text-[11px] font-medium tracking-widest text-site-main">
          PAID
        </span>
      )}
    </div>
  );
}

/* ---- Chase: reminder, offer, typing, reply; then again ---- */
function ChaseArt({ on }: { on: boolean }) {
  const t = useTick(on, 900, 5) % 7;
  const msgs = [
    ["Email", "INV-1039 is 12 days late.", false],
    ["WhatsApp", "Pay in two parts of 150.00?", false],
    ["Ada", "Yes please!", true],
  ] as const;
  return (
    <div className="flex h-[136px] w-[82%] flex-col justify-end gap-1.5">
      {msgs.map(([who, msg, me], i) =>
        t > i * 2 ? (
          <div key={who} className={`site-in max-w-[88%] rounded-2xl px-3 py-1.5 text-[12px] ${me ? "self-end rounded-br-md bg-site-main text-white" : `rounded-bl-md bg-white text-site-ink ${shadow}`}`}>
            <span className={`block font-code text-[9px] uppercase tracking-wider ${me ? "text-white/60" : "text-site-muted"}`}>{who}</span>
            {msg}
          </div>
        ) : null,
      )}
      {t === 4 && (
        <div className="site-in flex gap-1 self-end rounded-2xl rounded-br-md bg-site-soft px-3 py-2.5">
          {[0, 1, 2].map((d) => (
            <span key={d} className="site-dot h-1.5 w-1.5 rounded-full bg-site-main" style={{ animationDelay: `${d * 150}ms` }} />
          ))}
        </div>
      )}
    </div>
  );
}

/* ---- Pay bills: each bill gets decided in turn ---- */
function BillsArt({ on }: { on: boolean }) {
  const t = useTick(on, 1100, 4) % 5;
  const bills: [string, string, ReactNode][] = [
    ["Flour Co", "320.00", <Pill key="p" tone="main">Paid</Pill>],
    ["Power", "140.00", <Pill key="h" tone="grey">Held to Fri</Pill>],
    ["Ovens", "2,400.00", <Pill key="a" tone="soft">Asks you</Pill>],
  ];
  return (
    <div className="flex w-[84%] flex-col gap-1.5">
      {bills.map(([n, a, done], i) => (
        <div key={n} className={`flex items-center justify-between gap-2 rounded-xl bg-white px-3 py-2 text-[12px] transition-all duration-300 ${shadow} ${t === i + 1 ? "ring-2 ring-site-mid" : ""}`}>
          <span className="text-site-ink">{n}</span>
          <span className="flex items-center gap-2 font-code text-site-body">
            {a} {t > i ? done : <Pill tone="grey">Due</Pill>}
          </span>
        </div>
      ))}
    </div>
  );
}

/* ---- Reserve: cash moves between operating and reserve, floor stays ---- */
function ReserveArt({ on }: { on: boolean }) {
  const t = useTick(on, 2200, 1);
  const moved = t % 2 === 1;
  const parts: [string, number, number, string][] = [
    ["Floor", 25, 25, "bg-site-maindark"],
    ["Operating", 55, 40, "bg-site-main"],
    ["Reserve", 20, 35, "bg-site-mid"],
  ];
  return (
    <div className={`w-[84%] rounded-2xl bg-white p-4 ${shadow}`}>
      <div className="flex h-3.5 gap-0.5 overflow-hidden rounded-full">
        {parts.map(([k, a, b, c]) => (
          <span key={k} className={`h-full ${c} transition-[width] duration-1000 ease-in-out`} style={{ width: `${moved ? b : a}%` }} />
        ))}
      </div>
      <div className="mt-3 grid grid-cols-3 gap-1 text-[11px]">
        {[
          ["Floor", "1,000", "1,000"],
          ["Operating", "2,200", "1,600"],
          ["Reserve", "800", "1,400"],
        ].map(([k, a, b]) => (
          <div key={k}>
            <p className="text-site-muted">{k}</p>
            <p className="font-code font-medium text-site-ink">{moved ? b : a}</p>
          </div>
        ))}
      </div>
      <p className="mt-2 text-[10.5px] font-medium text-site-main">{moved ? "↓ 600.00 moved to reserve" : "Floor always kept"}</p>
    </div>
  );
}

/* ---- Wallet check: a scan line passes each wallet and gives a verdict ---- */
function WalletArt({ on }: { on: boolean }) {
  const t = useTick(on, 900, 4) % 5;
  const rows: [string, ReactNode][] = [
    ["0x8f3a…21c0", <Pill key="s" tone="main">Safe</Pill>],
    ["0x8f3a…21c1", <Pill key="l" tone="soft">Lookalike</Pill>],
    ["0x0000…dEaD", <Pill key="b" tone="bad">Blocked</Pill>],
  ];
  return (
    <div className="flex w-[84%] flex-col gap-1.5">
      {rows.map(([a, verdict], i) => (
        <div key={a} className={`relative flex items-center justify-between overflow-hidden rounded-xl bg-white px-3 py-2 text-[12px] ${shadow}`}>
          {t === i + 1 && <span className="site-scan absolute inset-y-0 left-0 w-1/3 bg-site-soft" />}
          <span className="relative font-code text-site-ink">{a}</span>
          <span className="relative">{t > i + 1 || t === 0 ? verdict : <Pill tone="grey">{t === i + 1 ? "Checking" : "…"}</Pill>}</span>
        </div>
      ))}
    </div>
  );
}

/* ---- Duplicates: a second bill slides in and gets flagged ---- */
function DuplicateArt({ on }: { on: boolean }) {
  const t = useTick(on, 1500, 2) % 3;
  return (
    <div className="relative h-[124px] w-[80%]">
      {[0, 1].map((i) => (
        <div
          key={i}
          className={`absolute w-[74%] rounded-2xl bg-white p-3 text-[12px] transition-all duration-700 ease-out ${shadow}`}
          style={i === 0 ? { left: 0, top: 0 } : { left: t >= 1 ? "26%" : "60%", top: t >= 1 ? "34px" : "34px", opacity: t >= 1 ? 1 : 0 }}
        >
          <div className="flex justify-between font-code text-[10px] text-site-muted">
            <span>FLOUR CO</span>
            <span>{i ? "F-019" : "F-017"}</span>
          </div>
          <p className="mt-1 font-head text-base font-bold text-site-ink">320.00</p>
          <p className="text-[10.5px] text-site-muted">{i ? "Mar 7" : "Mar 4"}</p>
          {i === 1 && t === 2 && (
            <span className="site-stamp absolute -right-2 -top-2.5 rounded-full bg-site-main px-2 py-0.5 text-[10px] font-semibold text-white">Same bill?</span>
          )}
        </div>
      ))}
    </div>
  );
}

/* ---- Log: new entries keep arriving at the top ---- */
const entries: [string, string][] = [
  ["PAID", "0x8ead…f592"],
  ["HELD", "0x77f0…ee21"],
  ["ASKED", "0x41c2…09ab"],
  ["MATCHED", "0x2b9d…1c04"],
  ["RESERVE", "0xc30e…7a18"],
];
function LogArt({ on }: { on: boolean }) {
  const t = useTick(on, 1600, 0);
  const shown = [0, 1, 2].map((k) => entries[(t + 2 - k + entries.length * 10) % entries.length]);
  return (
    <div className={`w-[84%] rounded-2xl bg-white p-3 font-code text-[11px] ${shadow}`}>
      {shown.map(([k, h], i) => (
        <div key={`${t}-${i}`} className={`${i === 0 ? "site-in" : ""} flex justify-between border-b border-dashed border-site-line py-1.5 last:border-0`}>
          <span className="text-site-main">{k}</span>
          <span className="text-site-muted">{h}</span>
        </div>
      ))}
      <p className="mt-1.5 text-[10px] text-site-main">✓ chain verified on Arc</p>
    </div>
  );
}

/* ---- Any currency: a coin travels along each route ---- */
function RoutesArt({ on }: { on: boolean }) {
  return (
    <div className="flex w-[84%] flex-col gap-1.5 text-[12px]">
      {[
        ["EURC", "USDC"],
        ["Base", "Arc"],
        ["Ethereum", "Arc"],
      ].map(([a, b], i) => (
        <div key={a} className={`flex items-center gap-3 rounded-xl bg-white px-3 py-2 ${shadow}`}>
          <span className="w-16 font-medium text-site-ink">{a}</span>
          <span className="relative h-px flex-1 bg-site-mid">
            {on && <span className="site-travel absolute -top-[3px] h-[7px] w-[7px] rounded-full bg-site-main" style={{ animationDelay: `${i * 0.5}s` }} />}
          </span>
          <span className="w-10 text-right font-medium text-site-main">{b}</span>
        </div>
      ))}
    </div>
  );
}

const services: Service[] = [
  { title: "Get paid", text: "Send an invoice with a pay link. When the money lands, Bursar matches it to the right invoice.", meta: "Matched for you", cat: "Getting paid", Art: InvoiceArt },
  { title: "Chase late payers", text: "Polite reminders by email, Telegram or WhatsApp, firmer when needed, with instalments inside your limits.", meta: "Most important first", cat: "Getting paid", Art: ChaseArt },
  { title: "Pay bills", text: "Pays suppliers on time, holds when cash is tight, and pays early when it helps. Big ones wait for you.", meta: "Inside your limits", cat: "Paying", Art: BillsArt },
  { title: "Keep a reserve", text: "Spare cash moves to a reserve, and the vault never lets the agent dip below the floor you set.", meta: "Never below your floor", cat: "Paying", Art: ReserveArt },
  { title: "Check every wallet", text: "Sanctions lists, brand-new wallets and lookalike addresses are caught before a single cent moves.", meta: "Before money moves", cat: "Safety", Art: WalletArt },
  { title: "Catch duplicate bills", text: "Same supplier, same amount, a few days apart? Bursar spots it and asks before paying twice.", meta: "Never pays twice", cat: "Safety", Art: DuplicateArt },
  { title: "Log every decision", text: "Each decision is written down with its reason. The fingerprints link together and land on Arc.", meta: "Anyone can check it", cat: "Safety", Art: LogArt },
  { title: "Take USDC or EURC", text: "Customers pay in EURC or from another network. It arrives in your vault as USDC on Arc.", meta: "One link, many ways", cat: "Getting paid", Art: RoutesArt },
];

const cats: ("Everything" | Cat)[] = ["Everything", "Getting paid", "Paying", "Safety"];

function Card({ s, i }: { s: Service; i: number }) {
  const [ref, seen] = useSeen<HTMLDivElement>(0.3);
  const { Art } = s;
  return (
    <div
      ref={ref}
      className={`site-reveal ${seen ? "is-in" : ""} group flex flex-col overflow-hidden rounded-[22px] border border-site-line bg-site-card transition-[transform,box-shadow] duration-300 hover:-translate-y-1 hover:shadow-[0_24px_48px_-24px_rgba(29,58,110,0.35)]`}
      style={{ transitionDelay: seen ? "0ms" : `${(i % 4) * 90}ms` }}
    >
      <div className="m-2 mb-0 flex h-[184px] items-center justify-center rounded-[16px] bg-site-panel">
        <div className="flex w-full justify-center transition-transform duration-500 group-hover:scale-[1.03]">
          <Art on={seen} />
        </div>
      </div>
      <div className="flex flex-1 flex-col p-5">
        <h3 className="font-head text-[18px] font-bold text-site-ink">{s.title}</h3>
        <p className="mt-1.5 flex-1 text-[14px] leading-relaxed text-site-body">{s.text}</p>
        <p className="mt-4 flex items-center gap-2 text-[12.5px] font-semibold text-site-main">
          <span className="h-1.5 w-1.5 rounded-full bg-site-main" />
          {s.meta}
        </p>
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
            className={`rounded-full border px-4 py-2 text-sm font-medium transition-colors duration-200 ${cat === c ? "border-site-main bg-site-main text-white" : "border-site-line bg-white text-site-ink hover:border-site-mid"}`}
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
