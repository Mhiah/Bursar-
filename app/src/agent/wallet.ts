import { createWalletClient, http, decodeErrorResult, type Address, type Hex } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { chain } from "@/lib/arc";
import { publicClient } from "@/lib/chain";
import { bursarVaultAbi } from "@/lib/abi/BursarVault";

function account() {
  const key = process.env.AGENT_PRIVATE_KEY as Hex | undefined;
  if (!key) throw new Error("AGENT_PRIVATE_KEY is not set");
  return privateKeyToAccount(key);
}

export const agentAddress = (): Address => account().address;

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

/** Simulate, send and wait. A revert comes back as the vault's error name. */
export async function send(vault: Address, call: Write) {
  const acct = account();
  try {
    const { request, result } = await publicClient.simulateContract({
      address: vault,
      abi: bursarVaultAbi,
      account: acct,
      ...(call as any),
    });
    const hash = await wallet().writeContract(request);
    const receipt = await publicClient.waitForTransactionReceipt({ hash });
    if (receipt.status !== "success") return { ok: false as const, error: "Transaction reverted", hash };
    return { ok: true as const, hash, result };
  } catch (e: any) {
    if (process.env.BURSAR_DEBUG) console.error(e);
    const name = e?.cause?.data?.errorName ?? e?.walk?.((x: any) => x?.data?.errorName)?.data?.errorName;
    return { ok: false as const, error: name ?? (e?.shortMessage || e?.message || String(e)) };
  }
}
