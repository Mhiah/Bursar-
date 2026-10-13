"use client";

import { createPublicClient, encodeFunctionData, http, type Account, type Hex, type Address, type Chain, type Transport, type WalletClient } from "viem";
import { chain } from "./arc";
import { bursarVaultAbi } from "./abi/BursarVault";

// Reads go through this site's /api/rpc, so the browser never has to reach the Arc RPC itself.
export const browserPublicClient = createPublicClient({
  chain,
  transport: http(typeof window === "undefined" ? undefined : `${window.location.origin}/api/rpc`, { timeout: 20_000 }),
});

type Client = WalletClient<Transport, Chain, Account>;

/** The owner signs a call on their vault from their own wallet, then we wait for it. */
export async function ownerCall(client: Client, vault: Address, functionName: string, args: readonly unknown[]) {
  const { request } = await browserPublicClient.simulateContract({
    address: vault,
    abi: bursarVaultAbi,
    functionName: functionName as any,
    args: args as any,
    account: client.account,
  });
  const hash = await client.writeContract(request as any);
  const receipt = await browserPublicClient.waitForTransactionReceipt({ hash });
  if (receipt.status !== "success") throw new Error("The transaction failed.");
  return hash;
}

/** Encodes one vault call, to be sent later with others in a single transaction. */
export const encodeVaultCall = (functionName: string, args: readonly unknown[]): Hex =>
  encodeFunctionData({ abi: bursarVaultAbi, functionName: functionName as any, args: args as any });

/** Vaults made before batching existed can't take several changes at once. */
async function canBatch(vault: Address) {
  const code = await browserPublicClient.getCode({ address: vault });
  return !!code && code.includes("ac9650d8"); // multicall(bytes[])
}

/** Sends the owner's queued vault changes: one transaction (one approval) when the vault allows it. */
export async function ownerBatch(client: Client, vault: Address, calls: readonly Hex[]) {
  if (calls.length > 1 && (await canBatch(vault))) return ownerCall(client, vault, "multicall", [calls]);
  let hash: Hex | undefined;
  for (const data of calls) {
    await browserPublicClient.call({ to: vault, data, account: client.account });
    hash = await client.sendTransaction({ to: vault, data, account: client.account, chain: client.chain } as any);
    const receipt = await browserPublicClient.waitForTransactionReceipt({ hash: hash! });
    if (receipt.status !== "success") throw new Error("The transaction failed.");
  }
  return hash;
}
