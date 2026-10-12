import Link from "next/link";

const steps = [
  ["Connect your wallet", "Use the wallet you already have, or create one here. You keep the keys. Nobody else, Bursar included, can recover or use them."],
  ["Set the rules", "Make a business vault your wallet owns. Set the most the agent may pay at once, monthly budgets, the cash to always keep, and who it may pay."],
  ["Let it run", "Customers pay invoices into the vault. The agent pays bills, holds or pays early, moves spare cash to a reserve, chases late payers, and asks you before anything outside your rules."],
];

const features = [
  ["Pays and holds bills", "Decides each bill against your cash position. Pays on time, holds when cash is tight, pays early when it helps."],
  ["Chases what you're owed", "Reminds customers by email, Telegram and WhatsApp in order of what matters, and offers instalments within your limits."],
  ["Checks every wallet", "Sanctions lists, new or lookalike wallets, changed supplier details and duplicate invoices are caught before money moves."],
  ["Rules it can't break", "Limits live in your vault contract on Arc. Even a wrong or tricked agent can't go past them. You can pause it or take its key away anytime."],
  ["Customers pay their way", "USDC on Arc, EURC (swapped for them), or USDC from other chains, bridged straight into your vault."],
  ["Every decision written down", "Each decision is logged with its reason and fingerprinted on Arc, so the record can't be quietly changed later."],
];

export default function Home() {
  return (
    <div className="min-h-screen">
      <header className="mx-auto flex max-w-5xl items-center justify-between px-6 py-6">
        <span className="text-xl font-semibold tracking-tight">Bursar</span>
        <Link href="/start" className="btn">
          Get started
        </Link>
      </header>
      <section className="mx-auto max-w-5xl px-6 pb-16 pt-12">
        <h1 className="max-w-3xl text-4xl font-semibold leading-tight tracking-tight md:text-5xl">
          An agent that runs your business's money, inside rules you set.
        </h1>
        <p className="mt-5 max-w-2xl text-lg text-black/70">
          Bursar takes payments in USDC, pays your bills, keeps a reserve, chases late customers and checks every wallet before money moves. It
          works on Arc, and your wallet stays yours.
        </p>
        <div className="mt-8 flex gap-3">
          <Link href="/start" className="btn px-5 py-2.5 text-base">
            Set up your business
          </Link>
        </div>
      </section>
      <section className="mx-auto grid max-w-5xl gap-4 px-6 pb-16 md:grid-cols-3">
        {steps.map(([t, d], i) => (
          <div key={t} className="card">
            <p className="mb-2 text-sm font-medium text-brand">Step {i + 1}</p>
            <h3 className="mb-1 font-semibold">{t}</h3>
            <p className="text-sm text-black/70">{d}</p>
          </div>
        ))}
      </section>
      <section className="border-t border-black/10 bg-white">
        <div className="mx-auto grid max-w-5xl gap-8 px-6 py-16 md:grid-cols-3">
          {features.map(([t, d]) => (
            <div key={t}>
              <h3 className="mb-1 font-semibold">{t}</h3>
              <p className="text-sm text-black/70">{d}</p>
            </div>
          ))}
        </div>
      </section>
      <footer className="mx-auto max-w-5xl px-6 py-10 text-xs text-black/50">Bursar never holds your keys. Lost keys can't be recovered.</footer>
    </div>
  );
}
