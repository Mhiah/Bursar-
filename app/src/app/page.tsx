import Link from "next/link";
import { code, head, text } from "@/components/site/fonts";
import { Reveal } from "@/components/site/motion";
import { PayMock } from "@/components/site/paymock";
import { Services } from "@/components/site/services";
import { Steps } from "@/components/site/steps";
import { Vault } from "@/components/site/vault";

function Eyebrow({ n, children, dark }: { n: string; children: string; dark?: boolean }) {
  return (
    <p className={`flex items-center gap-2 font-code text-xs uppercase tracking-[0.14em] ${dark ? "text-site-main" : "text-site-main"}`}>
      <span className={`rounded px-1.5 py-0.5 ${dark ? "bg-site-soft" : "bg-site-soft"}`}>{n}</span>
      {children}
      <span className={`h-px w-10 ${dark ? "bg-site-mid" : "bg-site-mid"}`} />
    </p>
  );
}

function Arrow() {
  return (
    <span className="flex h-7 w-7 items-center justify-center rounded-full bg-white/15 transition-transform duration-200 group-hover:translate-x-0.5">
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
        <path d="M5 12h14M13 6l6 6-6 6" />
      </svg>
    </span>
  );
}

const rules: [string, string][] = [
  ["Most it may pay at once", "you set it"],
  ["Monthly budget per category", "you set them"],
  ["Cash it must always keep", "you set it"],
  ["Pays only wallets you approved", "always"],
  ["Never pays the same bill twice", "always"],
  ["Pause it or remove its key", "any time"],
];

export default function Home() {
  return (
    <div className={`${head.variable} ${text.variable} ${code.variable} min-h-screen bg-site-bg font-text text-site-ink`}>
      <header className="sticky top-0 z-30 border-b border-site-line bg-site-bg/95 backdrop-blur">
        <div className="mx-auto flex max-w-[1200px] items-center justify-between gap-4 px-5 py-3.5">
          <Link href="/" className="flex items-center gap-2.5 text-site-ink no-underline">
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-site-main font-head text-[15px] font-extrabold text-white">B</span>
            <span className="font-head text-[21px] font-bold tracking-normal">Bursar</span>
          </Link>
          <nav aria-label="Main" className="hidden items-center gap-7 text-[14px] text-site-body lg:flex">
            <a href="#what" className="hover:text-site-ink">What it does</a>
            <a href="#how" className="hover:text-site-ink">How it works</a>
            <a href="#vault" className="hover:text-site-ink">The vault</a>
            <a href="#paid" className="hover:text-site-ink">Getting paid</a>
            <a href="#rules" className="hover:text-site-ink">Rules</a>
          </nav>
          <div className="flex items-center gap-4">
            <span className="hidden items-center gap-2 font-code text-[11px] tracking-widest text-site-muted sm:flex">
              <span className="site-live h-1.5 w-1.5 rounded-full bg-site-main" /> LIVE ON ARC
            </span>
            <Link href="/start" className="group flex items-center gap-3 rounded-full bg-site-main py-1.5 pl-5 pr-1.5 text-[14px] font-semibold text-white no-underline transition-colors hover:bg-site-maindark">
              Open your vault <Arrow />
            </Link>
          </div>
        </div>
      </header>

      <main>
        <section id="what" className="mx-auto max-w-[1200px] scroll-mt-20 px-5 pb-20 pt-10 md:pt-14">
          <Reveal>
            <Eyebrow n="01">What it does</Eyebrow>
            <h1 className="mt-5 max-w-[760px] font-head text-[40px] font-bold leading-[1.05] tracking-normal md:text-[60px]">
              Your business money, handled. Inside rules it can&apos;t break.
            </h1>
            <p className="mt-5 max-w-[560px] text-[17px] leading-relaxed text-site-body">
              Bursar is an agent that collects what customers owe, pays your bills, keeps a reserve and checks every wallet, in USDC on Arc. Your
              money stays in a vault only you own.
            </p>
          </Reveal>
          <Services />
        </section>

        <section id="how" className="mx-auto max-w-[1200px] scroll-mt-20 px-5 pb-16">
          <Reveal>
            <Eyebrow n="02">How it works</Eyebrow>
            <h2 className="mb-8 mt-5 max-w-[720px] font-head text-[34px] font-bold leading-[1.08] tracking-normal md:text-[48px]">
              Four steps, then it runs on its own.
            </h2>
          </Reveal>
          <Steps />
        </section>

        <section id="vault" className="scroll-mt-20 px-3 pb-20 md:px-5">
          <div className="mx-auto grid max-w-[1240px] gap-10 rounded-[30px] bg-site-soft px-6 py-14 md:px-12 lg:grid-cols-[1fr_1.1fr] lg:items-center">
            <Reveal>
              <Eyebrow n="03" dark>
                Behind the scenes
              </Eyebrow>
              <h2 className="mt-5 font-head text-[34px] font-bold leading-[1.08] tracking-normal md:text-[46px]">
                An agent runs the money. Your vault keeps it <span className="text-site-main">honest.</span>
              </h2>
              <p className="mt-5 max-w-[480px] leading-relaxed text-site-body">
                Every few minutes Bursar reads your vault, your invoices and your bills, then decides what to do. The limits live in the vault
                contract, so it can only move money the way your rules allow.
              </p>
              <div className="mt-8 grid gap-3 sm:grid-cols-2">
                {[
                  ["Pays and holds", "Due soon and cash is fine? Paid. Cash tight? Held, with the reason."],
                  ["Asks you first", "Over your limit or a new wallet? It waits for your signature."],
                ].map(([t, d]) => (
                  <div key={t} className="rounded-2xl border border-site-mid bg-white/60 p-4">
                    <p className="font-code text-[11px] uppercase tracking-widest text-site-main">→ {t}</p>
                    <p className="mt-2 text-[14px] leading-relaxed text-site-body">{d}</p>
                  </div>
                ))}
              </div>
            </Reveal>
            <Reveal delay={150}>
              <Vault />
            </Reveal>
          </div>
        </section>

        <section id="paid" className="mx-auto grid max-w-[1200px] scroll-mt-20 gap-12 px-5 pb-24 md:grid-cols-2 md:items-center">
          <Reveal>
            <Eyebrow n="04">Getting paid</Eyebrow>
            <h2 className="mt-5 font-head text-[34px] font-bold leading-[1.08] tracking-normal md:text-[46px]">Customers pay their way. You get USDC.</h2>
            <p className="mt-5 max-w-[480px] leading-relaxed text-site-body">
              Every invoice gets its own pay link. Customers can pay in USDC on Arc, in EURC, or with USDC from another network. It all lands in your
              vault as USDC, and Bursar marks the invoice paid.
            </p>
            <ul className="mt-6 space-y-2.5 text-[15px]">
              {["No account needed for your customers", "Part payments and instalments tracked", "A reminder goes out if it's late"].map((x) => (
                <li key={x} className="flex items-center gap-3">
                  <span className="flex h-5 w-5 items-center justify-center rounded-full bg-site-soft text-[11px] text-site-main">✓</span>
                  {x}
                </li>
              ))}
            </ul>
          </Reveal>
          <Reveal delay={150}>
            <div className="rounded-[28px] border border-site-line bg-site-panel px-6 py-10">
              <PayMock />
            </div>
          </Reveal>
        </section>

        <section id="rules" className="mx-auto grid max-w-[1200px] scroll-mt-20 gap-10 px-5 pb-24 md:grid-cols-[1fr_1.1fr] md:items-start">
          <Reveal>
            <Eyebrow n="05">Rules</Eyebrow>
            <h2 className="mt-5 font-head text-[34px] font-bold leading-[1.08] tracking-normal md:text-[46px]">Rules it can&apos;t break.</h2>
            <p className="mt-5 max-w-[440px] leading-relaxed text-site-body">
              The limits aren&apos;t instructions the agent could ignore. They&apos;re written into your vault contract on Arc, and only your wallet can
              change them.
            </p>
          </Reveal>
          <Reveal delay={120}>
            <div className="overflow-hidden rounded-[22px] border border-site-line bg-white">
              {rules.map(([r, v], i) => (
                <div key={r} className="flex items-center justify-between gap-4 border-b border-site-line px-6 py-4 last:border-0">
                  <span className="flex items-center gap-3">
                    <span className="font-code text-[11px] text-site-muted">{String(i + 1).padStart(2, "0")}</span>
                    {r}
                  </span>
                  <span className={`rounded-full px-2.5 py-0.5 font-code text-[11px] ${v === "always" || v === "any time" ? "bg-site-soft text-site-main" : "bg-[#F0F1F4] text-site-body"}`}>{v}</span>
                </div>
              ))}
            </div>
          </Reveal>
        </section>

        <section className="mx-auto max-w-[1200px] px-5 pb-20">
          <Reveal>
            <div className="flex flex-col gap-6 rounded-[24px] border border-site-line bg-white px-7 py-8 md:flex-row md:items-center md:justify-between">
              <p className="max-w-[640px] text-[16px] leading-relaxed text-site-body">
                <b className="text-site-ink">Start small.</b> Set low limits, watch what it decides and why, then raise them when you trust it. You can pause it
                or take its key away at any time.
              </p>
              <Link href="/start" className="group flex shrink-0 items-center gap-3 self-start rounded-full bg-site-main py-1.5 pl-5 pr-1.5 font-semibold text-white no-underline transition-colors hover:bg-site-maindark md:self-auto">
                Set up your business
                <span className="flex h-7 w-7 items-center justify-center rounded-full bg-white/15 transition-transform duration-200 group-hover:translate-x-0.5">→</span>
              </Link>
            </div>
          </Reveal>
        </section>
      </main>

      <footer className="border-t border-site-line">
        <div className="mx-auto flex max-w-[1200px] flex-wrap items-center justify-between gap-3 px-5 py-8 text-[13px] text-site-muted">
          <span>Bursar never holds your keys or your money. Lost keys can&apos;t be recovered.</span>
          <span className="flex gap-5 font-code text-[12px]">
            <a href="https://github.com/Mhiah/Bursar-" className="text-site-muted hover:text-site-ink">Code</a>
            <span>USDC · Arc · Circle</span>
          </span>
        </div>
      </footer>
    </div>
  );
}
