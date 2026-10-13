"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { createWalletClient, custom, http, numberToHex, type Address, type WalletClient, type Account, type Chain, type Transport } from "viem";
import { chain } from "@/lib/arc";
import { unlockLocalWallet } from "@/lib/local-wallet";

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

  const unlockLocal = useCallback(async (password: string) => {
    const account = await unlockLocalWallet(password);
    const c = createWalletClient({ account, chain, transport: http() });
    setClient(c);
    setKind("local");
    return account.address;
  }, []);

  const disconnect = useCallback(() => {
    setClient(null);
    setKind(null);
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
  return <WalletCtx.Provider value={value}>{children}</WalletCtx.Provider>;
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
