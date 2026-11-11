"use client";

import { useState } from "react";
import { getAddress, isAddress, parseUnits } from "viem";
import { useBusiness } from "@/components/business";
import { ConnectOwner, useOwnerSigner } from "@/components/signer";
import { storedLocalAddress } from "@/lib/local-wallet";
import { Field, Notice, short, TxLink, useAction } from "@/components/ui";
import { ownerCall } from "@/lib/owner-tx";

/** USDC text to units, or null if it isn't a positive number. */
const units = (v: string) => {
  try {
    const n = parseUnits(v.trim(), 6);
    return n > 0n ? n : null;
  } catch {
    return null;
  }
};

export default function Withdraw() {
  const { business, vault, reload } = useBusiness();
  const signer = useOwnerSigner(business.owner_address);
  const act = useAction();
  const [where, setWhere] = useState<"mine" | "other">("mine");
  const [other, setOther] = useState("");
  const [amount, setAmount] = useState("");
  const [done, setDone] = useState<{ amount: string; to: string; hash: string } | null>(null);
  // Pressing Withdraw opens a confirm step, signed by the main (owner) wallet, wherever the money goes.
  const [confirming, setConfirming] = useState(false);

  // An owner whose wallet was made on this site unlocks it with its password; everyone else signs in their browser wallet.
  const localOwner = typeof window !== "undefined" && storedLocalAddress()?.toLowerCase() === business.owner_address.toLowerCase();
  const needsUnlock = !signer.ready && localOwner;

  const to = where === "mine" ? business.owner_address : other.trim();
  const toOk = isAddress(to);
  const value = units(amount);
  const tooMuch = value != null && value > parseUnits(String(vault.balance), 6);

  return (
    <div className="space-y-8">
      <h1 className="h-page">Withdraw</h1>
      <section className="card space-y-5">
        <p className="text-sm text-ink">
          You can always take money out of your vault, reserve included. Balance: <b>{vault.balance} USDC</b>.
        </p>

        <div className="space-y-2">
          <span className="label">Send to</span>
          <label className="flex items-center gap-2 text-sm">
            <input type="radio" name="to" checked={where === "mine"} onChange={() => (setWhere("mine"), setConfirming(false))} />
            My connected wallet <span className="font-mono text-xs">{business.owner_address}</span>
          </label>
          <label className="flex items-center gap-2 text-sm">
            <input type="radio" name="to" checked={where === "other"} onChange={() => (setWhere("other"), setConfirming(false))} />
            Another wallet
          </label>
          {where === "other" && (
            <div className="max-w-xl pl-6">
              <input className="input font-mono" placeholder="0x…" value={other} onChange={(e) => (setOther(e.target.value), setConfirming(false))} />
              {other.trim() && !toOk && <p className="mt-1 text-xs text-bad">That isn't a wallet address.</p>}
              {toOk && <p className="mt-1 text-xs text-ink">Check this address carefully. Money sent to the wrong wallet can't be brought back.</p>}
            </div>
          )}
        </div>

        <div className="max-w-xs">
          <Field label="Amount (USDC)">
            <input className="input" inputMode="decimal" value={amount} onChange={(e) => (setAmount(e.target.value), setDone(null), setConfirming(false))} />
          </Field>
          {amount && value == null && <p className="mt-1 text-xs text-bad">Enter an amount more than zero.</p>}
          {tooMuch && <p className="mt-1 text-xs text-bad">That's more than your vault holds.</p>}
        </div>

        {!confirming ? (
          <button className="btn" disabled={!toOk || value == null || tooMuch} onClick={() => (setDone(null), setConfirming(true))}>
            Withdraw
          </button>
        ) : (
          <div className="space-y-3 rounded-xl border border-rule bg-cream p-4">
            <p className="text-sm">
              Send <b>{amount.trim()} USDC</b> to <span className="font-mono">{short(to)}</span>
              {where === "mine" ? " (your connected wallet)" : ""}?
            </p>
            {needsUnlock ? (
              <ConnectOwner owner={business.owner_address} why="To prove it's you, unlock your main wallet" />
            ) : (
              <p className="text-sm text-ink">Confirm with your main wallet <span className="font-mono">{short(business.owner_address)}</span> to prove it's you sending the money out.</p>
            )}
            <div className="flex flex-wrap gap-3">
              <button
                className="btn"
                disabled={needsUnlock || act.busy}
                onClick={() =>
                  act.run(async () => {
                    let client = signer.ready ? signer.client! : null;
                    if (!client) {
                      // Opens the browser wallet so the owner picks their main account, then signs.
                      client = await signer.pickInjected();
                      if (client.account.address.toLowerCase() !== business.owner_address.toLowerCase())
                        throw new Error(`Your wallet is on ${short(client.account.address)}. Choose your main wallet ${short(business.owner_address)} in it, then press Confirm and send again.`);
                    }
                    const hash = await ownerCall(client, vault.address, "withdraw", [getAddress(to), value!]);
                    setDone({ amount: amount.trim(), to: getAddress(to), hash });
                    setAmount("");
                    setConfirming(false);
                    await reload();
                  })
                }
              >
                {act.busy ? "Sending…" : "Confirm and send"}
              </button>
              <button className="btn-ghost" disabled={act.busy} onClick={() => setConfirming(false)}>Cancel</button>
            </div>
          </div>
        )}
        {act.error && <Notice kind="bad">{act.error}</Notice>}
        {done && (
          <Notice kind="ok">
            Sent {done.amount} USDC to <span className="font-mono text-xs">{done.to}</span>. <TxLink hash={done.hash} label="See the transaction" />
          </Notice>
        )}
      </section>
    </div>
  );
}
