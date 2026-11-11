"use client";

import { useState } from "react";
import { getAddress, isAddress, parseUnits } from "viem";
import { useBusiness } from "@/components/business";
import { ConnectOwner, useOwnerSigner } from "@/components/signer";
import { Field, Notice, TxLink, useAction } from "@/components/ui";
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
            <input type="radio" name="to" checked={where === "mine"} onChange={() => setWhere("mine")} />
            My connected wallet <span className="font-mono text-xs">{business.owner_address}</span>
          </label>
          <label className="flex items-center gap-2 text-sm">
            <input type="radio" name="to" checked={where === "other"} onChange={() => setWhere("other")} />
            Another wallet
          </label>
          {where === "other" && (
            <div className="max-w-xl pl-6">
              <input className="input font-mono" placeholder="0x…" value={other} onChange={(e) => setOther(e.target.value)} />
              {other.trim() && !toOk && <p className="mt-1 text-xs text-bad">That isn't a wallet address.</p>}
              {toOk && <p className="mt-1 text-xs text-ink">Check this address carefully. Money sent to the wrong wallet can't be brought back.</p>}
            </div>
          )}
        </div>

        <div className="max-w-xs">
          <Field label="Amount (USDC)">
            <input className="input" inputMode="decimal" value={amount} onChange={(e) => (setAmount(e.target.value), setDone(null))} />
          </Field>
          {amount && value == null && <p className="mt-1 text-xs text-bad">Enter an amount more than zero.</p>}
          {tooMuch && <p className="mt-1 text-xs text-bad">That's more than your vault holds.</p>}
        </div>

        {value != null && !signer.ready && <ConnectOwner owner={business.owner_address} />}
        <button
          className="btn"
          disabled={!signer.ready || act.busy || !toOk || value == null || tooMuch}
          onClick={() =>
            act.run(async () => {
              setDone(null);
              const hash = await ownerCall(signer.client!, vault.address, "withdraw", [getAddress(to), value!]);
              setDone({ amount: amount.trim(), to: getAddress(to), hash });
              setAmount("");
              await reload();
            })
          }
        >
          {act.busy ? "Withdrawing…" : "Withdraw"}
        </button>
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
