"use client";

import { useState } from "react";
import { useWallet } from "./wallet";
import { storedLocalAddress } from "@/lib/local-wallet";
import { short } from "./ui";

/** Makes sure the owner's wallet is connected and unlocked before they sign something. */
export function useOwnerSigner(owner: string | undefined) {
  const w = useWallet();
  const ready = !!w.client && !!owner && w.address?.toLowerCase() === owner.toLowerCase();
  return { ...w, ready };
}

export function ConnectOwner({ owner }: { owner: string }) {
  const w = useWallet();
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const local = typeof window !== "undefined" ? storedLocalAddress() : null;
  const localIsOwner = local?.toLowerCase() === owner.toLowerCase();

  if (w.address && w.address.toLowerCase() === owner.toLowerCase()) return null;

  return (
    <div className="rounded-lg border border-clay-line bg-clay-soft p-4 text-sm text-clay-dark">
      <p className="mb-3">
        To sign this, connect your business wallet <span className="font-mono">{short(owner)}</span>.
        {w.address && <> You're connected as {short(w.address)}, which isn't it.</>}
      </p>
      <div className="flex flex-wrap items-center gap-2">
        {localIsOwner ? (
          <>
            <input className="input max-w-xs" type="password" placeholder="Wallet password" value={password} onChange={(e) => setPassword(e.target.value)} />
            <button className="btn" onClick={() => w.unlockLocal(password).catch((e) => setError(e.message))}>
              Unlock
            </button>
          </>
        ) : (
          <button className="btn" onClick={() => w.connectInjected().catch((e) => setError(e.message))}>
            Connect browser wallet
          </button>
        )}
      </div>
      {error && <p className="mt-2 text-bad">{error}</p>}
    </div>
  );
}
