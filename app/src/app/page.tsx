import Link from "next/link";
import { Mark } from "@/components/mark";

const ledger = [
  ["09:12", "Matched a payment to invoice INV-1042", "+1,200.00", "in"],
  ["09:13", "Paid Flour Co, due Friday", "−320.00", "out"],
  ["09:13", "Held a new supplier wallet for your approval", "ask you", "ask"],
  ["09:14", "Reminded Ada about a late invoice, offered two parts", "chase", "note"],
  ["09:15", "Moved spare cash to reserve", "500.00", "note"],
] as const;

const strip = ["Collect", "Chase", "Pay", "Hold", "Reserve", "Check wallets", "Log"];

const steps = [
  ["Bring your wallet", "Connect the wallet you use, or make one here. The keys stay with you. Nobody, Bursar included, can recover or use them."],
  ["Write the rules", "Your wallet opens a vault on Arc. Set the most it may pay at once, monthly budgets, the cash to always keep, and who it may pay."],
  ["Let it keep the books", "Customers pay into the vault. The agent pays, holds, reserves and chases, and asks you before anything outside your rules."],
];

const rules = [
  ["Most per payment", "you set it"],
  ["Monthly budget per category", "you set them"],
  ["Cash it always keeps", "you set it"],
  ["Pays only wallets you approved", "always"],
  ["Never pays the same bill twice", "always"],
  ["Pause it or remove its key", "any time"],
];

const methods = [
  ["USDC on Arc", "Straight from their wallet into your vault."],
  ["EURC", "Swapped to USDC on the way in. They sign once."],
  ["USDC on another network", "Brought over to Arc for them, no Arc gas needed."],
];

const entries = [
  ["Asked you", "Bill is above your per-payment limit, so it needs your signature.", "0x41c2…09ab"],
  ["Paid", "Due in two days and cash covers the next month of bills.", "0x8ead…f592"],
  ["Held", "Not due yet and a large payment is expected Thursday.", "0x77f0…ee21"],
];

const limits = [
  ["It isn't a bank.", "Your money sits in a vault contract your wallet owns. Bursar can't freeze it, lend it or take a cut."],
  ["It can't recover lost keys.", "If you lose your wallet's keys, nobody can get the vault back. Keep them safe."],
  ["It only moves USDC.", "Customers can pay in EURC or from other networks, but the vault keeps USDC on Arc."],
  ["Wallet checks lower risk, they don't remove it.", "Sanctions lists and lookalike checks catch the common tricks, not every one. New wallets always come to you first."],
  ["It isn't your accountant.", "It keeps a clear record of what it did and why. Tax and filing are still yours."],
];

function Section({ id, n, title, lede, children, className = "" }: { id: string; n: string; title: React.ReactNode; lede?: string; children: React.ReactNode; className?: string }) {
  return (
    <section id={id} className={`mx-auto max-w-6xl px-6 py-20 ${className}`}>
      <div className="mb-10 grid gap-4 md:grid-cols-[1fr_1fr] md:items-end">
        <h2 className="font-serif text-4xl leading-tight md:text-5xl">
          <span className="mr-4 align-top font-mono text-sm text-ink">{n}</span>
          {title}
        </h2>
        {lede && <p className="max-w-md text-ink md:justify-self-end">{lede}</p>}
      </div>
      {children}
    </section>
  );
}

export default function Home() {
  return (
    <div className="min-h-screen bg-paper text-ink">
      <header className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-4 px-6 py-5">
        <Link href="/" className="flex items-center gap-2.5 no-underline">
          <Mark size={30} />
          <span className="font-serif text-2xl text-ink">Bursar</span>
        </Link>
        <nav aria-label="Main" className="hidden gap-7 text-sm text-ink md:flex">
          <a href="#how" className="hover:text-ink">How it works</a>
          <a href="#rules" className="hover:text-ink">The rules</a>
          <a href="#pay" className="hover:text-ink">Getting paid</a>
          <a href="#log" className="hover:text-ink">The ledger</a>
          <a href="#limits" className="hover:text-ink">Limits</a>
        </nav>
        <div className="flex items-center gap-3">
          <span className="hidden items-center gap-2 rounded-full border border-rule bg-card px-3 py-1 font-mono text-xs text-ink sm:inline-flex">
            <span aria-hidden className="h-1.5 w-1.5 rounded-full bg-brand-dot" />
            Live on Arc mainnet
          </span>
          <Link href="/start" className="btn-ink">
            Open your books →
          </Link>
        </div>
      </header>

      <section className="mx-auto grid max-w-6xl gap-12 px-6 pb-16 pt-12 md:grid-cols-[1.15fr_1fr] md:items-center md:pt-20">
        <div>
          <span className="eyebrow">An agent for your business&apos;s money</span>
          <h1 className="mt-5 font-serif text-5xl leading-[1.02] md:text-7xl">
            Keeps your books.
            <br />
            <em className="marker">Never</em> breaks your rules.
          </h1>
          <p className="mt-6 max-w-xl text-lg text-ink">
            Bursar collects what customers owe, pays your bills on time, keeps a reserve and checks every wallet before money moves. All in USDC,
            on a vault only you own.
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            <Link href="/start" className="btn px-6 py-3 text-base">
              Set up your business →
            </Link>
            <a href="#how" className="btn-ghost px-6 py-3 text-base">
              See how it decides
            </a>
          </div>
          <p className="mt-5 text-sm text-ink">You keep your keys. Bursar never holds your money.</p>
        </div>

        <div className="relative">
          <div className="rounded-2xl border border-rule bg-card p-6 shadow-[0_24px_60px_-30px_rgba(10,17,40,0.35)]">
            <div className="mb-3 flex items-center justify-between border-b border-dashed border-line pb-3">
              <span className="flex items-center gap-2 font-serif text-xl">
                <Mark size={24} mood="duty" /> Today&apos;s ledger
              </span>
              <span className="font-mono text-xs uppercase tracking-wider text-ink">Your business</span>
            </div>
            {ledger.map(([t, what, amt, kind]) => (
              <div key={t + what} className="grid grid-cols-[3rem_1fr_auto] items-baseline gap-3 border-b border-rule-soft py-2.5 text-sm last:border-0">
                <span className="font-mono text-xs text-ink">{t}</span>
                <span>{what}</span>
                <span
                  className={`font-mono text-xs ${kind === "in" ? "text-ink" : kind === "ask" ? "rounded bg-clay-soft px-1.5 py-0.5 text-ink" : kind === "out" ? "text-ink" : "text-ink"}`}
                >
                  {amt}
                </span>
              </div>
            ))}
            <div className="mt-3 flex items-center justify-between border-t border-dashed border-line pt-3">
              <span className="font-mono text-xs text-ink">fingerprint 0x8ead…f592</span>
            </div>
          </div>
          <span className="absolute -bottom-4 right-6 rotate-[-4deg] rounded-md border-2 border-brand px-3 py-1 font-mono text-xs uppercase tracking-widest text-ink bg-paper">
            Recorded on Arc
          </span>
        </div>
      </section>

      <div className="border-y border-rule bg-cream">
        <div className="mx-auto flex max-w-6xl gap-8 overflow-x-auto px-6 py-4 font-mono text-xs uppercase tracking-widest text-ink">
          {strip.map((s, i) => (
            <span key={s} className="whitespace-nowrap">
              <span className="text-ink">{String(i + 1).padStart(2, "0")}</span> {s}
            </span>
          ))}
        </div>
      </div>

      <Section id="how" n="01" title="How it works" lede="Three steps, then it runs on its own. You can pause it or take its key away at any time.">
        <div className="grid gap-5 md:grid-cols-3">
          {steps.map(([t, d], i) => (
            <div key={t} className={`rounded-2xl border p-7 ${i === 2 ? "border-brand bg-brand text-paper" : "border-rule bg-card"}`}>
              <span className={`font-serif text-6xl leading-none ${i === 2 ? "text-paper" : "text-ink"}`}>{i + 1}</span>
              <h3 className="mt-6 font-serif text-2xl">{t}</h3>
              <p className={`mt-2 text-sm ${i === 2 ? "text-paper" : "text-ink"}`}>{d}</p>
            </div>
          ))}
        </div>
      </Section>

      <Section
        id="rules"
        n="02"
        title={
          <>
            Rules it <em className="text-ink">can&apos;t</em> break
          </>
        }
        lede="The limits live in your vault contract, not in the agent's instructions. A wrong or tricked agent still can't go past them."
        className="pt-0"
      >
        <div className="overflow-hidden rounded-2xl border border-rule bg-card">
          <div className="flex items-center justify-between bg-ink px-6 py-3 text-paper">
            <span className="font-serif text-lg">Your vault&apos;s rules</span>
            <span className="font-mono text-xs uppercase tracking-widest opacity-70">owner only</span>
          </div>
          {rules.map(([r, v]) => (
            <div key={r} className="flex items-center justify-between border-b border-rule-soft px-6 py-4 last:border-0">
              <span>{r}</span>
              <span className="font-mono text-sm text-ink">{v}</span>
            </div>
          ))}
        </div>
      </Section>

      <Section id="pay" n="03" title="Customers pay their way" className="pt-0">
        <div className="grid gap-5 md:grid-cols-3">
          {methods.map(([t, d]) => (
            <div key={t} className="rounded-2xl border border-rule bg-card p-7">
              <h3 className="font-serif text-2xl">{t}</h3>
              <p className="mt-2 text-sm text-ink">{d}</p>
            </div>
          ))}
        </div>
      </Section>

      <section id="log" className="bg-ink text-paper">
        <div className="mx-auto grid max-w-6xl gap-10 px-6 py-20 md:grid-cols-[1fr_1.2fr]">
          <div>
            <h2 className="font-serif text-4xl leading-tight md:text-5xl">
              <span className="mr-4 align-top font-mono text-sm text-paper">04</span>
              Every decision, written down
            </h2>
            <p className="mt-5 max-w-md text-paper">
              Each entry carries its reason in plain words. Its fingerprint includes the one before, and the latest is written to your vault, so
              the record can&apos;t be quietly changed. Anyone you share it with can check it.
            </p>
          </div>
          <div className="space-y-3">
            {entries.map(([k, why, fp]) => (
              <div key={k} className="grid gap-2 rounded-xl border border-white/10 bg-white/5 p-5 sm:grid-cols-[6rem_1fr]">
                <span className="font-mono text-xs uppercase tracking-widest text-paper">{k}</span>
                <div>
                  <p>{why}</p>
                  <p className="mt-1 font-mono text-xs text-paper">{fp}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      <Section id="limits" n="05" title="What it isn't, and its limits" lede="Better you hear it here than find out later.">
        <div className="grid gap-x-10 gap-y-6 md:grid-cols-2">
          {limits.map(([t, d]) => (
            <div key={t} className="border-t border-rule pt-4">
              <h3 className="font-serif text-xl">{t}</h3>
              <p className="mt-1 text-sm text-ink">{d}</p>
            </div>
          ))}
        </div>
      </Section>

      <section id="start" className="mx-auto max-w-6xl px-6 pb-24">
        <div className="flex flex-col items-center rounded-3xl border border-rule bg-cream px-6 py-16 text-center">
          <Mark size={56} mood="paid" />
          <h2 className="mt-5 font-serif text-5xl md:text-6xl">Hire a bursar.</h2>
          <p className="mt-4 max-w-md text-ink">Set up takes a wallet and a few rules. Start small; raise the limits when you trust it.</p>
          <Link href="/start" className="btn mt-8 px-6 py-3 text-base">
            Set up your business →
          </Link>
        </div>
      </section>

      <footer className="border-t border-rule">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3 px-6 py-8 text-xs text-ink">
          <span>Bursar never holds your keys. Lost keys can&apos;t be recovered.</span>
          <span className="flex gap-5 font-mono">
            <a href="https://github.com/Mhiah/Bursar-" className="text-ink hover:text-ink">Code</a>
            <span>USDC · Arc · Circle</span>
          </span>
        </div>
      </footer>
    </div>
  );
}
