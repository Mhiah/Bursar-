"use client";

import { createPublicClient, http, type Account, type Address, type Chain, type Transport, type WalletClient } from "viem";
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
