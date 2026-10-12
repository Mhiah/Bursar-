import { createPublicClient, http, type Address } from "viem";
import { chain, USDC } from "./arc";
import { bursarVaultAbi } from "./abi/BursarVault";

export const publicClient = createPublicClient({
  chain,
  transport: http(process.env.ARC_RPC_URL || undefined),
});

export const erc20Abi = [
  { type: "function", name: "balanceOf", stateMutability: "view", inputs: [{ name: "a", type: "address" }], outputs: [{ type: "uint256" }] },
  { type: "function", name: "transfer", stateMutability: "nonpayable", inputs: [{ name: "to", type: "address" }, { name: "amount", type: "uint256" }], outputs: [{ type: "bool" }] },
  { type: "event", name: "Transfer", inputs: [{ name: "from", type: "address", indexed: true }, { name: "to", type: "address", indexed: true }, { name: "value", type: "uint256", indexed: false }] },
] as const;

export type VaultState = {
  balance: bigint;
  operating: bigint;
  reserve: bigint;
  cashFloor: bigint;
  maxPerPayment: bigint;
  paused: boolean;
  owner: Address;
  agent: Address;
};

export async function readVault(vault: Address): Promise<VaultState> {
  const read = (functionName: any) => publicClient.readContract({ address: vault, abi: bursarVaultAbi, functionName }) as Promise<any>;
  const [balance, operating, reserve, cashFloor, maxPerPayment, paused, owner, agent] = await Promise.all(
    ["balance", "operating", "reserve", "cashFloor", "maxPerPayment", "paused", "owner", "agent"].map(read),
  );
  return { balance, operating, reserve, cashFloor, maxPerPayment, paused, owner, agent };
}

export async function usdcBalance(addr: Address) {
  return publicClient.readContract({ address: USDC, abi: erc20Abi, functionName: "balanceOf", args: [addr] });
}
