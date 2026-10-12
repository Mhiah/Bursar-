import Link from "next/link";
import { Icon, Logo } from "@/components/icons";
import { CountUp, Reveal } from "@/components/motion";

const tiles = {
  mint: "bg-tile-mint text-tile-mintInk",
  violet: "bg-tile-violet text-tile-violetInk",
  sky: "bg-tile-sky text-tile-skyInk",
  amber: "bg-tile-amber text-tile-amberInk",
  rose: "bg-tile-rose text-tile-roseInk",
} as const;
type Tile = keyof typeof tiles;

const services: [string, string, string, Tile][] = [
  ["inbox", "Get paid", "Send invoices with a pay link. Customers pay in USDC, EURC or from another network.", "mint"],
  ["send", "Pay bills", "Pays suppliers on time, holds when cash is tight, pays early when it helps.", "sky"],
  ["bell", "Chase late payers", "Reminds by email, Telegram and WhatsApp, and offers instalments within your limits.", "amber"],
  ["piggy", "Keep a reserve", "Moves spare cash aside so you never dip below the amount you always keep.", "violet"],
  ["shield", "Check every wallet", "Sanctions lists, lookalike wallets, changed details and duplicate invoices, before money moves.", "rose"],
  ["book", "Log every decision", "Each choice is written down with its reason and fingerprinted on Arc.", "mint"],
];

const today: [string, string, number, string, string, Tile][] = [
  ["Ada Bakes", "Paid invoice INV-1042", 1200, "+", "Received", "mint"],
  ["Flour Co", "Bill due Friday, cash is fine", 320, "−", "Paid", "sky"],
  ["New supplier", "First payment to an unknown wallet", 450, "", "Asks you", "amber"],
  ["Corner Café", "3 days late, friendly reminder sent", 180, "", "Chased", "rose"],
];

const ticker: [string, string, string][] = [
  ["Ada Bakes paid INV-1042", "+1,200.00", "bg-tile-mintInk"],
  ["Paid Flour Co", "−320.00", "bg-tile-skyInk"],
  ["Moved spare cash to reserve", "500.00", "bg-tile-violetInk"],
  ["Reminded Corner Café", "180.00", "bg-tile-amberInk"],
  ["Blocked a sanctioned wallet", "stopped", "bg-tile-roseInk"],
  ["Bo's Deli paid in EURC", "+90.00", "bg-tile-mintInk"],
  ["Held a bill until Friday", "640.00", "bg-tile-skyInk"],
  ["Matched a payment bridged from Base", "+75.00", "bg-tile-mintInk"],
];

const steps = [
  ["Bring your wallet", "Connect the wallet you use, or make one here. You keep the keys."],
  ["Set your rules", "Most per payment, monthly budgets, cash to always keep, who it may pay."],
  ["Let it run", "Bursar handles the day to day and asks you before anything outside your rules."],
];

const rules = [
  "Never pays more than your per-payment limit",
  "Stays inside each monthly budget",
  "Always keeps the cash you set aside",
  "Pays only wallets you approved",
  "Never pays the same bill twice",
  "You can pause it or remove its key any time",
];

const methods: [string, string, string, Tile][] = [
  ["coins", "USDC on Arc", "Straight from their wallet into your vault.", "mint"],
  ["swap", "EURC", "Swapped to USDC on the way in. They sign once.", "violet"],
  ["globe", "USDC on other networks", "Base, Ethereum, Arbitrum and more, brought over to Arc.", "sky"],
];

export default function Home() {
  return (
    <div className="min-h-screen bg-paper text-ink">
      <header className="sticky top-0 z-10 border-b border-rule bg-white/90 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-5 py-3.5">
          <Link href="/" className="flex items-center gap-2.5 no-underline">
            <Logo size={32} />
            <span className="font-display text-xl font-extrabold tracking-tight text-ink">Bursar</span>
          </Link>
          <nav aria-label="Main" className="hidden gap-7 text-sm font-medium text-body md:flex">
            <a href="#services" className="hover:text-ink">What it does</a>
            <a href="#how" className="hover:text-ink">How it works</a>
            <a href="#rules" className="hover:text-ink">Your rules</a>
            <a href="#pay" className="hover:text-ink">Getting paid</a>
          </nav>
          <div className="flex items-center gap-2">
            <Link href="/start" className="btn-ghost hidden sm:inline-flex">Sign in</Link>
            <Link href="/start" className="btn">Get started</Link>
          </div>
        </div>
      </header>

      <section className="relative isolate overflow-hidden">
        <div aria-hidden className="pointer-events-none absolute inset-0 -z-10">
          <span className="drift absolute -left-24 top-10 h-72 w-72 rounded-full bg-tile-mint blur-3xl" />
          <span className="drift absolute -right-16 top-24 h-80 w-80 rounded-full bg-tile-violet blur-3xl" style={{ animationDelay: "-5s" }} />
          <span className="drift absolute bottom-0 left-1/3 h-64 w-64 rounded-full bg-tile-sky blur-3xl" style={{ animationDelay: "-9s" }} />
        </div>
      <div className="mx-auto max-w-6xl px-5 pb-12 pt-14 text-center md:pt-20">
        <span className="eyebrow rise">
          <span className="relative flex h-2 w-2">
            <span className="ping absolute inline-flex h-full w-full rounded-full bg-brand-dot opacity-60" />
            <span className="relative inline-flex h-2 w-2 rounded-full bg-brand-dot" />
          </span>
          Live on Arc mainnet
        </span>
        <h1 style={{ animationDelay: "80ms" }} className="rise mx-auto mt-5 max-w-3xl font-display text-[40px] font-extrabold leading-[1.08] tracking-tight md:text-6xl">
          Your business money, <span className="underline-sweep text-brand">handled</span>.
        </h1>
        <p style={{ animationDelay: "200ms" }} className="rise mx-auto mt-5 max-w-2xl text-lg text-body">
          Bursar is an agent that collects what customers owe, pays your bills, keeps a reserve and checks every wallet. In USDC, from a vault only
          you own, inside rules it can&apos;t break.
        </p>
        <div style={{ animationDelay: "320ms" }} className="rise mt-8 flex flex-wrap justify-center gap-3">
          <Link href="/start" className="btn px-6 py-3 text-base">
            Set up your business <Icon name="arrow" size={18} />
          </Link>
          <a href="#how" className="btn-ghost px-6 py-3 text-base">See how it works</a>
        </div>
        <div className="mt-10 flex flex-wrap justify-center gap-2">
          {services.map(([icon, t, , tone], i) => (
            <a key={t} href="#services" style={{ animationDelay: `${500 + i * 70}ms` }} className="pop group inline-flex items-center gap-2 rounded-full border border-rule bg-white py-1.5 pl-1.5 pr-4 text-sm font-medium text-ink no-underline shadow-card hover:border-line">
              <span className={`nudge inline-flex h-7 w-7 items-center justify-center rounded-full ${tiles[tone]}`}>
                <Icon name={icon} size={15} />
              </span>
              {t}
            </a>
          ))}
        </div>
      </div>
      </section>

      <div className="relative overflow-hidden border-y border-rule bg-white py-3" aria-label="Things Bursar does">
        <div className="marquee flex w-max gap-3">
          {[...ticker, ...ticker].map(([what, amt, dot], i) => (
            <span key={i} className="inline-flex items-center gap-2 whitespace-nowrap rounded-full bg-cream py-1.5 pl-3 pr-3.5 text-sm">
              <span className={`h-2 w-2 rounded-full ${dot}`} />
              <span className="text-body">{what}</span>
              <span className="font-semibold tabular-nums">{amt}</span>
            </span>
          ))}
        </div>
        <div className="pointer-events-none absolute inset-y-0 left-0 w-16 bg-gradient-to-r from-white" />
        <div className="pointer-events-none absolute inset-y-0 right-0 w-16 bg-gradient-to-l from-white" />
      </div>

      <section className="mx-auto max-w-6xl px-5 pb-20 pt-12">
        <Reveal className="rounded-3xl bg-cream p-4 md:p-6">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-2 px-1">
            <p className="font-display text-lg font-bold">Today at a bakery using Bursar</p>
            <span className="text-sm text-muted">4 things handled before 9:15</span>
          </div>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {today.map(([who, what, amt, sign, tag, tone], i) => (
              <Reveal key={who} delay={150 + i * 120}>
              <div className="float overflow-hidden rounded-2xl border border-rule bg-white shadow-card transition hover:shadow-lift" style={{ animationDelay: `${-i * 1.5}s` }}>
                <div className={`flex h-24 items-end justify-between p-4 ${tiles[tone]}`}>
                  <span className="rounded-full bg-white/80 px-2.5 py-0.5 text-xs font-semibold">{tag}</span>
                  <span className="font-display text-xl font-extrabold"><CountUp value={amt} prefix={sign} /></span>
                </div>
                <div className="p-4">
                  <p className="font-semibold">{who}</p>
                  <p className="mt-0.5 text-sm text-muted">{what}</p>
                </div>
              </div>
              </Reveal>
            ))}
          </div>
        </Reveal>
      </section>

      <section id="services" className="mx-auto max-w-6xl px-5 pb-20">
        <Reveal>
          <h2 className="font-display text-3xl font-extrabold tracking-tight md:text-4xl">Everything your money needs</h2>
          <p className="mt-2 max-w-xl text-body">One agent, six jobs. Turn on what you need.</p>
        </Reveal>
        <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {services.map(([icon, t, d, tone], i) => (
            <Reveal key={t} delay={(i % 3) * 100}>
              <div className="group h-full rounded-2xl border border-rule bg-white p-6 shadow-card transition duration-300 hover:-translate-y-1 hover:shadow-lift">
                <span className={`nudge inline-flex h-11 w-11 items-center justify-center rounded-xl ${tiles[tone]}`}>
                  <Icon name={icon} size={22} />
                </span>
                <h3 className="mt-4 font-display text-lg font-bold">{t}</h3>
                <p className="mt-1 text-sm text-body">{d}</p>
              </div>
            </Reveal>
          ))}
        </div>
      </section>

      <section id="how" className="bg-cream">
        <div className="mx-auto max-w-6xl px-5 py-20">
          <Reveal>
            <h2 className="font-display text-3xl font-extrabold tracking-tight md:text-4xl">Up and running in three steps</h2>
          </Reveal>
          <div className="mt-8 grid gap-4 md:grid-cols-3">
            {steps.map(([t, d], i) => (
              <Reveal key={t} delay={i * 140} className="rounded-2xl bg-white p-6 shadow-card">
                <span className="inline-flex h-9 w-9 items-center justify-center rounded-full bg-brand font-display font-bold text-white">{i + 1}</span>
                <h3 className="mt-4 font-display text-lg font-bold">{t}</h3>
                <p className="mt-1 text-sm text-body">{d}</p>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      <section id="rules" className="mx-auto grid max-w-6xl gap-10 px-5 py-20 md:grid-cols-2 md:items-center">
        <Reveal>
          <span className="eyebrow"><Icon name="lock" size={13} /> Built into your vault</span>
          <h2 className="mt-4 font-display text-3xl font-extrabold tracking-tight md:text-4xl">Rules it can&apos;t break</h2>
          <p className="mt-3 max-w-md text-body">
            Your limits live in your own vault contract on Arc, not in the agent&apos;s instructions. Even a wrong or tricked agent can&apos;t go past
            them.
          </p>
          <p className="mt-4 text-sm text-muted">You keep your keys. Bursar never holds your money.</p>
        </Reveal>
        <ul className="rounded-2xl border border-rule bg-white p-2 shadow-card">
          {rules.map((r, i) => (
            <Reveal as="li" key={r} delay={i * 90} className="flex items-center gap-3 rounded-xl px-4 py-3.5 even:bg-cream">
              <span className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-brand-soft text-brand">
                <Icon name="check" size={14} />
              </span>
              <span className="text-sm font-medium">{r}</span>
            </Reveal>
          ))}
        </ul>
      </section>

      <section id="pay" className="mx-auto max-w-6xl px-5 pb-20">
        <Reveal>
          <h2 className="font-display text-3xl font-extrabold tracking-tight md:text-4xl">Customers pay their way</h2>
          <p className="mt-2 max-w-xl text-body">Whatever they pay with, it lands in your vault as USDC on Arc.</p>
        </Reveal>
        <div className="mt-8 grid gap-4 md:grid-cols-3">
          {methods.map(([icon, t, d, tone], i) => (
            <Reveal key={t} delay={i * 120} className="group flex items-start gap-4 rounded-2xl border border-rule bg-white p-6 shadow-card transition duration-300 hover:-translate-y-1 hover:shadow-lift">
              <span className={`nudge inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-xl ${tiles[tone]}`}>
                <Icon name={icon} size={22} />
              </span>
              <div>
                <h3 className="font-display text-lg font-bold">{t}</h3>
                <p className="mt-1 text-sm text-body">{d}</p>
              </div>
            </Reveal>
          ))}
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-5 pb-20">
        <Reveal className="relative isolate flex flex-col items-center overflow-hidden rounded-3xl bg-brand px-6 py-14 text-center text-white">
          <span aria-hidden className="drift absolute -left-10 -top-16 -z-10 h-64 w-64 rounded-full bg-brand-dot/60 blur-3xl" />
          <span aria-hidden className="drift absolute -bottom-20 right-0 -z-10 h-72 w-72 rounded-full bg-[#0b6b4a] blur-3xl" style={{ animationDelay: "-6s" }} />
          <h2 className="font-display text-3xl font-extrabold tracking-tight md:text-5xl">Hire a bursar today</h2>
          <p className="mt-3 max-w-md text-white/80">It takes a wallet and a few rules. Start with small limits and raise them when you trust it.</p>
          <Link href="/start" className="mt-7 inline-flex items-center gap-2 rounded-full bg-white px-6 py-3 font-semibold text-brand no-underline hover:bg-brand-soft">
            Set up your business <Icon name="arrow" size={18} />
          </Link>
        </Reveal>
      </section>

      <footer className="border-t border-rule">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3 px-5 py-8 text-sm text-muted">
          <span className="flex items-center gap-2">
            <Logo size={22} /> Bursar never holds your keys. Lost keys can&apos;t be recovered.
          </span>
          <span className="flex gap-5">
            <a href="https://github.com/Mhiah/Bursar-" className="text-muted hover:text-ink">Code</a>
            <span>USDC · Arc · Circle</span>
          </span>
        </div>
      </footer>
    </div>
  );
}
