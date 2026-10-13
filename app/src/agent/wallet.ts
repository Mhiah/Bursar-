import { execFile } from "node:child_process";
import { join } from "node:path";
import { createWalletClient, http, decodeErrorResult, getAbiItem, type Address, type Hex } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { chain, network } from "@/lib/arc";
import { publicClient } from "@/lib/chain";
import { bursarVaultAbi } from "@/lib/abi/BursarVault";
import { bursarSavingsAbi } from "@/lib/abi/BursarSavings";

// Two ways to sign for the agent:
//  - "circle": a Circle Agent Wallet, driven through the Circle CLI. No private key on this machine.
//  - "local": a raw private key in AGENT_PRIVATE_KEY (used by the local tests).
const useCircle = () => (process.env.AGENT_SIGNER || "").toLowerCase() === "circle";

function account() {
  const key = process.env.AGENT_PRIVATE_KEY as Hex | undefined;
  if (!key) throw new Error("AGENT_PRIVATE_KEY is not set");
  return privateKeyToAccount(key);
}

export const agentAddress = (): Address => {
  if (!useCircle()) return account().address;
  const a = process.env.NEXT_PUBLIC_AGENT_ADDRESS as Address | undefined;
  if (!a) throw new Error("NEXT_PUBLIC_AGENT_ADDRESS is not set");
  return a;
};

function wallet() {
  return createWalletClient({ account: account(), chain, transport: http(process.env.ARC_RPC_URL || undefined) });
}

/** The vault rule a payment would break, or null if it would go through. */
export async function dryRun(vault: Address, to: Address, amount: bigint, category: Hex, ref: Hex): Promise<string | null> {
  const sel = await publicClient.readContract({ address: vault, abi: bursarVaultAbi, functionName: "check", args: [to, amount, category, ref] });
  if (sel === "0x00000000") return null;
  try {
    return decodeErrorResult({ abi: bursarVaultAbi, data: sel }).errorName;
  } catch {
    return sel;
  }
}

type Write =
  | { functionName: "agentPay"; args: readonly [Address, bigint, Hex, Hex] }
  | { functionName: "requestApproval"; args: readonly [Address, bigint, Hex, Hex, Hex] }
  | { functionName: "moveToReserve"; args: readonly [bigint] }
  | { functionName: "releaseReserve"; args: readonly [bigint] }
  | { functionName: "recordDecision"; args: readonly [Hex] };

export const circleChain = () => process.env.CIRCLE_CHAIN || (network === "mainnet" ? "ARC" : "ARC-TESTNET");

/** Run the Circle CLI that ships with the app and return its JSON. */
export function circle(args: string[]): Promise<any> {
  const cli = process.env.CIRCLE_CLI_PATH || join(process.cwd(), "node_modules", "@circle-fin", "cli", "dist", "index.js");
  return new Promise((resolve) => {
    execFile(
      process.execPath,
      [cli, ...args, "--output", "json"],
      { env: { ...process.env, CIRCLE_ACCEPT_TERMS: "1" }, timeout: 180_000, maxBuffer: 4 * 1024 * 1024 },
      (err, stdout, stderr) => {
        try {
          resolve(JSON.parse(stdout));
        } catch {
          resolve({ error: { code: "INTERNAL", message: (stderr || err?.message || "Circle CLI failed").trim() } });
        }
      },
    );
  });
}

/** Send a contract call from the Circle agent wallet; resolves to the transaction hash. */
async function sendViaCircle(vault: Address, call: { functionName: string; args: readonly unknown[] }, abi: readonly unknown[] = bursarVaultAbi): Promise<{ hash: Hex } | { error: string }> {
  const item = getAbiItem({ abi: abi as any, name: call.functionName }) as { inputs: readonly { type: string }[] };
  const signature = `${call.functionName}(${item.inputs.map((i) => i.type).join(",")})`;
  const params = call.args.map((a) => String(a));
  const out = await circle([
    "wallet", "execute", signature, ...params,
    "--contract", vault,
    "--address", agentAddress(),
    "--chain", circleChain(),
    ...(process.env.ARC_RPC_URL ? ["--rpc-url", process.env.ARC_RPC_URL] : []),
  ]);
  if (out?.error) {
    const msg = out.error.code === "AUTH_REQUIRED" ? "Circle agent wallet is logged out. Run: npx circle wallet login <email> --type agent" : out.error.message;
    return { error: msg };
  }
  const hash = out?.data?.txHash as Hex | undefined;
  if (!hash) return { error: `Circle transaction ${out?.data?.id ?? ""} ended ${out?.data?.state ?? "without a hash"}`.trim() };
  return { hash };
}

/** Simulate, send and wait. A revert comes back as the vault's error name. */
export const send = (vault: Address, call: Write) => sendTo(vault, bursarVaultAbi, call);

/** Put money that has arrived in the savings account into a pot. The agent can't take savings out. */
export const sendAllocate = (savings: Address, pot: bigint, amount: bigint) =>
  sendTo(savings, bursarSavingsAbi, { functionName: "allocate", args: [pot, amount] });

async function sendTo(address: Address, abi: readonly unknown[], call: { functionName: string; args: readonly unknown[] }) {
  try {
    const { request, result } = await publicClient.simulateContract({
      address,
      abi: abi as any,
      account: useCircle() ? agentAddress() : account(),
      ...(call as any),
    });
    let hash: Hex;
    if (useCircle()) {
      const sent = await sendViaCircle(address, call, abi);
      if ("error" in sent) return { ok: false as const, error: sent.error };
      hash = sent.hash;
    } else {
      hash = await wallet().writeContract(request);
    }
    const receipt = await publicClient.waitForTransactionReceipt({ hash });
    if (receipt.status !== "success") return { ok: false as const, error: "Transaction reverted", hash };
    return { ok: true as const, hash, result };
  } catch (e: any) {
    if (process.env.BURSAR_DEBUG) console.error(e);
    const name = e?.cause?.data?.errorName ?? e?.walk?.((x: any) => x?.data?.errorName)?.data?.errorName;
    return { ok: false as const, error: name ?? (e?.shortMessage || e?.message || String(e)) };
  }
}
