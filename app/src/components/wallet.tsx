"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { createPublicClient, createWalletClient, custom, formatEther, http, numberToHex, type Address, type WalletClient, type Account, type Chain, type LocalAccount, type Transport } from "viem";
import { chain } from "@/lib/arc";
import { unlockLocalWallet } from "@/lib/local-wallet";
import { MOCK, MOCK_OWNER_KEY } from "@/lib/mock";
import { privateKeyToAccount } from "viem/accounts";

type Client = WalletClient<Transport, Chain, Account>;
type Ctx = {
  address: Address | null;
  kind: "injected" | "local" | null;
  client: Client | null;
  connectInjected: () => Promise<Address>;
  /** The connected wallet, reconnecting the browser wallet first if the page was reloaded. */
  ensureClient: () => Promise<Client>;
  unlockLocal: (password: string) => Promise<Address>;
  disconnect: () => void;
};

const WalletCtx = createContext<Ctx | null>(null);

/** A transaction from the wallet made on this site, waiting for the owner to approve it. */
type Pending = { from: Address; to: Address | null; fee: bigint; balance: bigint | null; resolve: () => void; reject: (e: Error) => void };

declare global {
  interface Window {
    ethereum?: any;
  }
}

/** Ask a browser wallet to switch to Arc, adding the network if it doesn't know it. */
export async function switchToArc(provider: any) {
  const chainId = numberToHex(chain.id);
  try {
    await provider.request({ method: "wallet_switchEthereumChain", params: [{ chainId }] });
  } catch (e: any) {
    if (e?.code !== 4902 && e?.data?.originalError?.code !== 4902) throw e;
    await provider.request({
      method: "wallet_addEthereumChain",
      params: [
        {
          chainId,
          chainName: chain.name,
          nativeCurrency: chain.nativeCurrency,
          rpcUrls: chain.rpcUrls.default.http,
          blockExplorerUrls: [chain.blockExplorers!.default.url],
        },
      ],
    });
  }
}

export function WalletProvider({ children }: { children: ReactNode }) {
  const [client, setClient] = useState<Client | null>(null);
  const [kind, setKind] = useState<Ctx["kind"]>(null);

  const openInjected = useCallback(async () => {
    if (!window.ethereum) throw new Error("No browser wallet found. Install one, or create a wallet here instead.");
    const [addr] = (await window.ethereum.request({ method: "eth_requestAccounts" })) as Address[];
    await switchToArc(window.ethereum);
    const c = createWalletClient({ account: addr, chain, transport: custom(window.ethereum) }) as unknown as Client;
    setClient(c);
    setKind("injected");
    return c;
  }, []);

  const connectInjected = useCallback(async () => (await openInjected()).account.address, [openInjected]);

  const ensureClient = useCallback(async () => client ?? openInjected(), [client, openInjected]);

  const [pending, setPending] = useState<Pending | null>(null);

  const unlockLocal = useCallback(async (password: string) => {
    const unlocked = await unlockLocalWallet(password);
    const rpc = http(`${window.location.origin}/api/rpc`);
    const reader = createPublicClient({ chain, transport: rpc });
    // Like any wallet app, show what is about to be signed and wait for the owner to approve it.
    const account: LocalAccount = {
      ...unlocked,
      signTransaction: async (tx, opts) => {
        const fee = (tx.gas ?? 0n) * ((tx as any).maxFeePerGas ?? (tx as any).gasPrice ?? 0n);
        const balance = await reader.getBalance({ address: unlocked.address }).catch(() => null);
        await new Promise<void>((resolve, reject) =>
          setPending({ from: unlocked.address, to: (tx.to as Address) ?? null, fee, balance, resolve, reject }),
        );
        return unlocked.signTransaction(tx, opts);
      },
    };
    const c = createWalletClient({ account, chain, transport: rpc });
    setClient(c);
    setKind("local");
    return account.address;
  }, []);

  const disconnect = useCallback(() => {
    setClient(null);
    setKind(null);
  }, []);

  // Test mode: the test owner wallet is always connected, so there's nothing to install or sign for real.
  useEffect(() => {
    if (!MOCK) return;
    // Through this site, so test mode also works from a phone on the same Wi-Fi.
    setClient(createWalletClient({ account: privateKeyToAccount(MOCK_OWNER_KEY), chain, transport: http(`${window.location.origin}/api/rpc`) }));
    setKind("local");
  }, []);

  // Follow account changes in the browser wallet.
  useEffect(() => {
    if (kind !== "injected" || !window.ethereum?.on) return;
    const onChange = () => disconnect();
    window.ethereum.on("accountsChanged", onChange);
    return () => window.ethereum.removeListener?.("accountsChanged", onChange);
  }, [kind, disconnect]);

  const value = useMemo<Ctx>(
    () => ({ address: client?.account.address ?? null, kind, client, connectInjected, ensureClient, unlockLocal, disconnect }),
    [client, kind, connectInjected, ensureClient, unlockLocal, disconnect],
  );
  const answer = (ok: boolean) => {
    if (!pending) return;
    if (ok) pending.resolve();
    else pending.reject(new Error("You rejected the transaction."));
    setPending(null);
  };

  return (
    <WalletCtx.Provider value={value}>
      {children}
      {pending && <ConfirmTx p={pending} onAnswer={answer} />}
    </WalletCtx.Provider>
  );
}

export function useWallet() {
  const c = useContext(WalletCtx);
  if (!c) throw new Error("useWallet outside WalletProvider");
  return c;
}

/** Sign Bursar's login message with the connected wallet and start a session. */
export async function signIn(client: Client) {
  const nonce = await fetch("/api/auth/nonce").then((r) => r.json());
  if (nonce.error || !nonce.message) throw new Error(nonce.error ?? "Couldn't start sign-in.");
  const { message, token } = nonce;
  const signature = await client.signMessage({ account: client.account, message });
  const res = await fetch("/api/auth/verify", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ address: client.account.address, message, signature, token }),
  });
  if (!res.ok) throw new Error((await res.json()).error ?? "Sign-in failed");
  return res.json() as Promise<{ business: unknown | null }>;
}

const usdc = (v: bigint) => Number(formatEther(v)).toLocaleString(undefined, { maximumFractionDigits: 6 });
const shortAddr = (a: string) => `${a.slice(0, 6)}…${a.slice(-4)}`;

/** The wallet made on this site asks before it signs, the way a wallet app does. Gas on Arc is paid in USDC. */
function ConfirmTx({ p, onAnswer }: { p: Pending; onAnswer: (ok: boolean) => void }) {
  const short = p.balance != null && p.balance < p.fee;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
      <div role="dialog" aria-label="Confirm transaction" className="w-full max-w-sm space-y-4 rounded-xl border border-rule bg-card p-5 text-sm text-ink shadow-lg">
        <h2 className="text-base font-semibold">Confirm transaction</h2>
        <dl className="space-y-2">
          <div className="flex justify-between gap-4">
            <dt>From</dt>
            <dd className="font-mono">{shortAddr(p.from)}</dd>
          </div>
          {p.to && (
            <div className="flex justify-between gap-4">
              <dt>To contract</dt>
              <dd className="font-mono">{shortAddr(p.to)}</dd>
            </div>
          )}
          <div className="flex justify-between gap-4">
            <dt>Network fee (up to)</dt>
            <dd>{usdc(p.fee)} USDC</dd>
          </div>
          {p.balance != null && (
            <div className="flex justify-between gap-4">
              <dt>Your balance</dt>
              <dd>{usdc(p.balance)} USDC</dd>
            </div>
          )}
        </dl>
        {short && <p className="text-bad">Your wallet doesn't have enough USDC on Arc for the fee. Send a little USDC on Arc to {shortAddr(p.from)} first.</p>}
        <div className="flex gap-2">
          <button className="btn" disabled={short} onClick={() => onAnswer(true)}>
            Sign and send
          </button>
          <button className="btn-ghost" onClick={() => onAnswer(false)}>
            Reject
          </button>
        </div>
      </div>
    </div>
  );
}
