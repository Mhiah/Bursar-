"use client";

import { createPublicClient, http, type Account, type Address, type Chain, type Transport, type WalletClient } from "viem";
import { chain } from "./arc";
import { bursarVaultAbi } from "./abi/BursarVault";

export const browserPublicClient = createPublicClient({ chain, transport: http() });

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
