"use client";

import { useEffect, useMemo, useState } from "react";
import { createWalletClient, custom, getAddress, parseUnits, type Address } from "viem";
import { switchToArc } from "@/components/wallet";
import { Field, Money, Notice, Status, TxLink, useAction, useApi } from "@/components/ui";
import { appKitChain, bridgeSources, chain, EURC, network, USDC } from "@/lib/arc";
import { browserPublicClient } from "@/lib/owner-tx";
import { fromUnits } from "@/lib/money";

const erc20 = [
  { type: "function", name: "balanceOf", stateMutability: "view", inputs: [{ name: "a", type: "address" }], outputs: [{ type: "uint256" }] },
  { type: "function", name: "transfer", stateMutability: "nonpayable", inputs: [{ name: "to", type: "address" }, { name: "v", type: "uint256" }], outputs: [{ type: "bool" }] },
] as const;

type Method = "usdc" | "eurc" | "bridge";

export default function Pay({ params }: { params: { id: string } }) {
  const inv = useApi<any>(`/api/pay/${params.id}`);
  const [method, setMethod] = useState<Method>("usdc");
  const [part, setPart] = useState<"full" | "instalment">("full");
  const [account, setAccount] = useState<Address | null>(null);
  const [balances, setBalances] = useState<{ usdc: bigint; eurc: bigint } | null>(null);
  const [source, setSource] = useState(bridgeSources[0].id);
  const [quote, setQuote] = useState<string | null>(null);
  const [sent, setSent] = useState<{ hash?: string; note: string } | null>(null);
  const act = useAction();

  // Keep the page up to date while the payment is picked up.
  useEffect(() => {
    if (!sent) return;
    const t = setInterval(() => inv.reload(), 8000);
    return () => clearInterval(t);
  }, [sent, inv]);

  const d = inv.data;
  const amount = useMemo(() => (d ? (part === "instalment" && d.nextInstalment ? d.nextInstalment.amount : d.outstanding) : "0"), [d, part]);

  const connect = () =>
    act.run(async () => {
      if (!window.ethereum) throw new Error("You need a browser wallet such as MetaMask, Rabby or Coinbase Wallet to pay.");
      const [a] = await window.ethereum.request({ method: "eth_requestAccounts" });
      setAccount(getAddress(a));
      if (method !== "bridge") await refreshBalances(getAddress(a));
    });

  const refreshBalances = async (a: Address) => {
    await switchToArc(window.ethereum);
    const [usdc, eurc] = await Promise.all([
      browserPublicClient.readContract({ address: USDC, abi: erc20, functionName: "balanceOf", args: [a] }),
      browserPublicClient.readContract({ address: EURC, abi: erc20, functionName: "balanceOf", args: [a] }),
    ]);
    setBalances({ usdc, eurc });
  };

  const kitAdapter = async () => {
    const [{ AppKit }, { createViemAdapterFromProvider }] = await Promise.all([import("@circle-fin/app-kit"), import("@circle-fin/adapter-viem-v2")]);
    return { kit: new AppKit(), adapter: await createViemAdapterFromProvider({ provider: window.ethereum }) };
  };

  // How much EURC buys the USDC owed, with a little room for the rate moving.
  const eurcNeeded = async () => {
    const { kit, adapter } = await kitAdapter();
    const est = await kit.estimateSwap({ from: { adapter, chain: appKitChain as any }, tokenIn: "EURC", tokenOut: "USDC", amountIn: amount });
    const rate = Number(est.estimatedOutput.amount) / Number(amount); // USDC per EURC
    return (Math.ceil((Number(amount) / rate) * 1.005 * 100) / 100).toFixed(2);
  };

  const pay = () =>
    act.run(async () => {
      if (!account || !d?.payTo) return;
      const to = getAddress(d.payTo);
      if (method === "usdc") {
        await switchToArc(window.ethereum);
        const wallet = createWalletClient({ account, chain, transport: custom(window.ethereum) });
        const hash = await wallet.writeContract({ address: USDC, abi: erc20, functionName: "transfer", args: [to, parseUnits(amount, 6)] });
        await browserPublicClient.waitForTransactionReceipt({ hash });
        setSent({ hash, note: "Payment sent." });
      } else if (method === "eurc") {
        await switchToArc(window.ethereum);
        const { kit, adapter } = await kitAdapter();
        const amountIn = await eurcNeeded();
        const res: any = await kit.swap({ from: { adapter, chain: appKitChain as any }, tokenIn: "EURC", tokenOut: "USDC", amountIn, to: { recipientAddress: to } });
        setSent({ hash: res?.txHash, note: `Swapped ${amountIn} EURC for USDC and sent it.` });
      } else {
        const { kit, adapter } = await kitAdapter();
        const res: any = await kit.bridge({
          from: { adapter, chain: source as any },
          to: { chain: appKitChain as any, recipientAddress: to, useForwarder: true },
          amount: await bridgeAmount(),
        });
        if (res?.state && res.state !== "success") throw new Error("The transfer didn't finish. Nothing was taken that can't be recovered; try again.");
        setSent({ note: "USDC is on its way from the other network. It usually arrives within a few minutes." });
      }
    });

  // Bridge enough that the business receives the full amount after transfer fees.
  const bridgeAmount = async () => {
    const { kit, adapter } = await kitAdapter();
    const est: any = await kit.estimateBridge({
      from: { adapter, chain: source as any },
      to: { chain: appKitChain as any, recipientAddress: getAddress(d.payTo), useForwarder: true },
      amount,
    });
    const fees = (est.fees ?? []).filter((f: any) => f.token === "USDC" && f.amount).reduce((s: number, f: any) => s + Number(f.amount), 0);
    return (Number(amount) + fees).toFixed(6);
  };

  const getQuote = () =>
    act.run(async () => {
      setQuote(null);
      if (method === "eurc") setQuote(`About ${await eurcNeeded()} EURC`);
      if (method === "bridge") setQuote(`${await bridgeAmount()} USDC including transfer fees`);
    });

  if (inv.error) return <Shell><Notice kind="bad">{inv.error}</Notice></Shell>;
  if (!d) return <Shell><p className="text-sm text-black/50">Loading…</p></Shell>;

  return (
    <Shell>
      <div className="card space-y-1">
        <p className="text-sm text-black/50">{d.business} asks for payment</p>
        <p className="text-3xl font-semibold"><Money value={d.outstanding} /></p>
        <p className="text-sm text-black/70">
          Invoice {d.invoiceNo}
          {d.description ? ` · ${d.description}` : ""} · due {d.dueDate}
        </p>
        <div className="pt-1"><Status value={d.status} /></div>
      </div>

      {d.status === "paid" ? (
        <Notice kind="ok">This invoice is paid. Thank you.</Notice>
      ) : d.status === "cancelled" ? (
        <Notice>This invoice was cancelled.</Notice>
      ) : sent ? (
        <Notice kind="ok">
          {sent.note} {sent.hash && <TxLink hash={sent.hash} label="View transaction" />} {d.business} will see it shortly; this page updates by itself.
        </Notice>
      ) : (
        <div className="card space-y-5">
          {d.nextInstalment && (
            <div>
              <span className="label">Amount</span>
              <div className="flex gap-2 text-sm">
                <button className={part === "instalment" ? "btn" : "btn-ghost"} onClick={() => setPart("instalment")}>
                  Next instalment: {d.nextInstalment.amount} (by {d.nextInstalment.dueDate})
                </button>
                <button className={part === "full" ? "btn" : "btn-ghost"} onClick={() => setPart("full")}>Everything: {d.outstanding}</button>
              </div>
            </div>
          )}
          <div>
            <span className="label">Pay with</span>
            <div className="grid gap-2 sm:grid-cols-3">
              {([
                ["usdc", "USDC on Arc", "Straight from your wallet"],
                ["eurc", "EURC on Arc", "Swapped to USDC for you"],
                ["bridge", "USDC on another network", "Moved to Arc for you"],
              ] as const).map(([m, t, sub]) => (
                <button key={m} onClick={() => { setMethod(m); setQuote(null); }} className={`rounded-lg border p-3 text-left text-sm ${method === m ? "border-brand bg-brand-soft" : "border-black/10 bg-white"}`}>
                  <span className="block font-medium">{t}</span>
                  <span className="text-xs text-black/50">{sub}</span>
                </button>
              ))}
            </div>
          </div>
          {method === "bridge" && (
            <Field label="Your USDC is on">
              <select className="input" value={source} onChange={(e) => { setSource(e.target.value); setQuote(null); }}>
                {bridgeSources.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}
              </select>
            </Field>
          )}
          {!account ? (
            <button className="btn w-full" disabled={act.busy} onClick={connect}>Connect wallet</button>
          ) : (
            <div className="space-y-3">
              {balances && method !== "bridge" && (
                <p className="text-xs text-black/50">
                  Your wallet has {fromUnits(balances.usdc)} USDC and {fromUnits(balances.eurc)} EURC on Arc.
                </p>
              )}
              {method !== "usdc" && (
                <button className="btn-ghost" disabled={act.busy} onClick={getQuote}>See what you'll pay</button>
              )}
              {quote && <p className="text-sm">{quote}</p>}
              <button className="btn w-full" disabled={act.busy} onClick={pay}>
                {act.busy ? "Waiting for your wallet…" : `Pay ${amount} USDC`}
              </button>
            </div>
          )}
          {act.error && <Notice kind="bad">{act.error}</Notice>}
          <p className="text-xs text-black/40">
            Payment goes straight to {d.business}'s vault on Arc{network === "testnet" ? " testnet" : ""}. Bursar never holds it.
          </p>
        </div>
      )}
    </Shell>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="mx-auto max-w-lg space-y-4 px-5 py-12">
      <p className="text-sm font-semibold tracking-tight text-black/60">Bursar</p>
      {children}
    </div>
  );
}
