"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { parseEventLogs, parseUnits, type Address } from "viem";
import { signIn, useWallet } from "@/components/wallet";
import { api, Field, Notice, short, useAction } from "@/components/ui";
import { createLocalWallet, importLocalWallet, storedLocalAddress } from "@/lib/local-wallet";
import { AGENT_ADDRESS, FACTORY, network } from "@/lib/arc";
import { bursarFactoryAbi } from "@/lib/abi/BursarFactory";
import { browserPublicClient } from "@/lib/owner-tx";

type Step = "wallet" | "signin" | "details" | "vault";

export default function Start() {
  const router = useRouter();
  const w = useWallet();
  const [step, setStep] = useState<Step>("wallet");
  const [session, setSession] = useState<{ address: string | null; business: any } | null>(null);
  // Every visit signs in again with the connected wallet, even if an old login is still saved.
  const [signed, setSigned] = useState(false);

  useEffect(() => {
    api("/api/business").then((d) => {
      setSession({ address: d.address ?? d.business?.owner_address ?? null, business: d.business });
      if (d.business?.vault_address) router.replace("/dashboard");
    });
  }, [router]);

  // Move forward as each piece falls into place.
  useEffect(() => {
    if (!w.address) return setStep("wallet");
    if (!signed || !session?.address || session.address.toLowerCase() !== w.address.toLowerCase()) return setStep("signin");
    if (!session.business) return setStep("details");
    setStep("vault");
  }, [w.address, session, signed]);

  return (
    <div className="mx-auto max-w-xl px-6 py-10">
      <Link href="/" className="font-serif text-2xl text-ink no-underline">
        Bursar
      </Link>
      <ol className="mb-10 mt-6 flex flex-wrap gap-x-5 gap-y-2 border-b border-rule pb-4 font-mono text-xs uppercase tracking-widest">
        {(["wallet", "signin", "details", "vault"] as Step[]).map((s, i) => (
          <li key={s} className={s === step ? "text-ink" : "text-muted"}>
            <span className={s === step ? "text-clay" : ""}>{String(i + 1).padStart(2, "0")}</span> {{ wallet: "Wallet", signin: "Sign in", details: "Business", vault: "Vault" }[s]}
          </li>
        ))}
      </ol>
      {step === "wallet" && <WalletStep />}
      {step === "signin" && <SignInStep
          onDone={(b) => {
            setSigned(true);
            setSession({ address: w.address, business: b });
            if ((b as any)?.vault_address) router.replace("/dashboard");
          }}
        />}
      {step === "details" && <DetailsStep onDone={async () => setSession({ address: w.address, business: (await api("/api/business")).business })} />}
      {step === "vault" && <VaultStep onDone={() => router.replace("/settings?new=1")} />}
    </div>
  );
}

function WalletStep() {
  const w = useWallet();
  const { busy, error, run } = useAction();
  const [mode, setMode] = useState<"choose" | "create" | "import" | "unlock">(() => (typeof window !== "undefined" && storedLocalAddress() ? "unlock" : "choose"));
  const [password, setPassword] = useState("");
  const [secret, setSecret] = useState("");
  const [phrase, setPhrase] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  if (phrase)
    return (
      <div className="space-y-4">
        <h1 className="h-page">Write down your recovery phrase</h1>
        <Notice kind="warn">
          This is the only way back into your wallet. Bursar doesn't keep a copy and can't recover it. Anyone who has it can take your money.
        </Notice>
        <div className="grid grid-cols-3 gap-2 rounded-lg border border-rule bg-card p-4 font-mono text-sm">
          {phrase.split(" ").map((word, i) => (
            <span key={i}>
              <span className="text-muted">{i + 1}.</span> {word}
            </span>
          ))}
        </div>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={saved} onChange={(e) => setSaved(e.target.checked)} /> I've written it down somewhere safe
        </label>
        <button className="btn" disabled={!saved || busy} onClick={() => run(() => w.unlockLocal(password))}>
          Continue
        </button>
      </div>
    );

  return (
    <div className="space-y-5">
      <h1 className="h-page">Your business wallet</h1>
      <p className="text-sm text-body">
        This wallet will own your business vault. Any EVM wallet works. You keep the keys; if they're lost, nobody can recover them.
      </p>
      {mode === "choose" && (
        <div className="grid gap-3">
          <button className="btn justify-start py-3" disabled={busy} onClick={() => run(w.connectInjected)}>
            Connect a browser wallet (MetaMask, Rabby, Coinbase…)
          </button>
          <button className="btn-ghost justify-start py-3" onClick={() => setMode("create")}>
            Create a new wallet here
          </button>
          <button className="btn-ghost justify-start py-3" onClick={() => setMode("import")}>
            Import a wallet with its recovery phrase or private key
          </button>
        </div>
      )}
      {mode === "unlock" && (
        <div className="space-y-3">
          <p className="text-sm">
            This browser has a saved wallet <span className="font-mono">{short(storedLocalAddress())}</span>.
          </p>
          <Field label="Password">
            <input className="input" type="password" value={password} onChange={(e) => setPassword(e.target.value)} />
          </Field>
          <div className="flex gap-2">
            <button className="btn" disabled={busy} onClick={() => run(() => w.unlockLocal(password))}>
              Unlock
            </button>
            <button className="btn-ghost" onClick={() => setMode("choose")}>
              Use a different wallet
            </button>
          </div>
        </div>
      )}
      {(mode === "create" || mode === "import") && (
        <div className="space-y-3">
          {mode === "import" && (
            <Field label="Recovery phrase or private key" hint="Stays in this browser, encrypted with your password. It's never sent to Bursar.">
              <textarea className="input h-24 font-mono" value={secret} onChange={(e) => setSecret(e.target.value)} />
            </Field>
          )}
          <Field label="Password for this browser" hint="Unlocks the wallet on this device. At least 8 characters.">
            <input className="input" type="password" value={password} onChange={(e) => setPassword(e.target.value)} />
          </Field>
          <div className="flex gap-2">
            <button
              className="btn"
              disabled={busy}
              onClick={() =>
                run(async () => {
                  if (mode === "create") {
                    const r = await createLocalWallet(password);
                    setPhrase(r.phrase);
                  } else {
                    await importLocalWallet(secret, password);
                    setSecret("");
                    await w.unlockLocal(password);
                  }
                })
              }
            >
              {mode === "create" ? "Create wallet" : "Import wallet"}
            </button>
            <button className="btn-ghost" onClick={() => setMode("choose")}>
              Back
            </button>
          </div>
        </div>
      )}
      {error && <Notice kind="bad">{error}</Notice>}
    </div>
  );
}

function SignInStep({ onDone }: { onDone: (business: any) => void }) {
  const w = useWallet();
  const { busy, error, run } = useAction();
  return (
    <div className="space-y-4">
      <h1 className="h-page">Sign in</h1>
      <p className="text-sm text-body">
        Sign a message with <span className="font-mono">{short(w.address)}</span> to prove it's yours. This doesn't move any money or cost anything.
      </p>
      <button className="btn" disabled={busy} onClick={() => run(async () => onDone((await signIn(w.client!)).business))}>
        Sign in
      </button>
      {error && <Notice kind="bad">{error}</Notice>}
    </div>
  );
}

function DetailsStep({ onDone }: { onDone: () => void }) {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const { busy, error, run } = useAction();
  return (
    <div className="space-y-4">
      <h1 className="h-page">About your business</h1>
      <Field label="Business name" hint="Customers see this on invoices and reminders.">
        <input className="input" value={name} onChange={(e) => setName(e.target.value)} />
      </Field>
      <Field label="Your email" hint="For approval requests and alerts. Optional.">
        <input className="input" type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
      </Field>
      <button className="btn" disabled={busy || !name.trim()} onClick={() => run(async () => { await api("/api/business", { method: "POST", json: { name, email } }); onDone(); })}>
        Continue
      </button>
      {error && <Notice kind="bad">{error}</Notice>}
    </div>
  );
}

function VaultStep({ onDone }: { onDone: () => void }) {
  const w = useWallet();
  const [maxPer, setMaxPer] = useState("0");
  const [floor, setFloor] = useState("0");
  const [status, setStatus] = useState<string | null>(null);
  const [existing, setExisting] = useState<Address[]>([]);
  const { busy, error, run } = useAction();
  const missing = !FACTORY || !AGENT_ADDRESS;

  // A vault this wallet already made (say the page closed before it was saved) is reused, not made twice.
  useEffect(() => {
    if (!w.address || missing) return;
    browserPublicClient
      .readContract({ address: FACTORY, abi: bursarFactoryAbi, functionName: "vaultsOf", args: [w.address] })
      .then((v) => setExisting([...v]))
      .catch(() => {});
  }, [w.address, missing]);

  const useExisting = (vault: Address) =>
    run(async () => {
      setStatus("Saving your vault…");
      await api("/api/business/vault", { method: "POST", json: { vault } });
      onDone();
    }).finally(() => setStatus(null));

  if (existing.length)
    return (
      <div className="space-y-4">
        <h1 className="h-page">Your business vault</h1>
        <p className="text-sm text-body">
          Your wallet already created a vault on Arc: <span className="font-mono">{existing[existing.length - 1]}</span>. Use it instead of making a new one.
        </p>
        <button className="btn" disabled={busy} onClick={() => useExisting(existing[existing.length - 1])}>
          Use this vault
        </button>
        {status && <Notice>{status}</Notice>}
        {error && <Notice kind="bad">{error}</Notice>}
      </div>
    );

  return (
    <div className="space-y-4">
      <h1 className="h-page">Create your business vault</h1>
      <p className="text-sm text-body">
        Your vault is a contract on Arc that your wallet owns. Payments land here. Bursar's agent gets a limited key that can only act inside these
        rules; you can change them, pause the agent, or remove it at any time.
      </p>
      <Field label="Most the agent may pay at once (USDC)" hint="Bigger payments come to you for approval.">
        <input className="input" inputMode="decimal" value={maxPer} onChange={(e) => setMaxPer(e.target.value)} />
      </Field>
      <Field label="Cash to always keep (USDC)" hint="The agent won't let operating cash fall below this.">
        <input className="input" inputMode="decimal" value={floor} onChange={(e) => setFloor(e.target.value)} />
      </Field>
      <Notice>
        Creating the vault is one transaction from your wallet. On Arc the fee is paid in USDC, so your wallet needs a little USDC
        {network === "testnet" && (
          <>
            {" "}
            (get testnet USDC at{" "}
            <a className="underline" href="https://faucet.circle.com" target="_blank" rel="noreferrer">
              faucet.circle.com
            </a>
            )
          </>
        )}
        .
      </Notice>
      {missing && <Notice kind="bad">This site isn't configured with a factory and agent address yet.</Notice>}
      <button
        className="btn"
        disabled={busy || missing}
        onClick={() =>
          run(async () => {
            // After a page reload the wallet connection is gone; this reconnects it.
            setStatus("Confirm the transaction in your wallet…");
            const client = await w.ensureClient();
            const hash = await client.writeContract({
              address: FACTORY,
              abi: bursarFactoryAbi,
              functionName: "createVault",
              args: [AGENT_ADDRESS, parseUnits(maxPer || "0", 6), parseUnits(floor || "0", 6)],
            });
            setStatus(`Sent. Waiting for Arc to confirm it (${short(hash)})…`);
            const receipt = await browserPublicClient.waitForTransactionReceipt({ hash });
            if (!parseEventLogs({ abi: bursarFactoryAbi, logs: receipt.logs, eventName: "VaultCreated" }).length) throw new Error("Vault wasn't created.");
            setStatus("Vault created. Saving it…");
            await api("/api/business/vault", { method: "POST", json: { txHash: hash } });
            onDone();
          }).finally(() => setStatus(null))
        }
      >
        {busy ? "Working…" : "Create vault"}
      </button>
      {status && <Notice>{status}</Notice>}
      {error && <Notice kind="bad">{error}</Notice>}
    </div>
  );
}
