// Test mode: a local Hardhat chain on this computer with fake USDC (`npm run mock`).
// These are Hardhat's well-known public test keys. They only ever work on the local
// test chain, never on Arc, and the app only uses them when NEXT_PUBLIC_BURSAR_NETWORK=local.
import type { Hex } from "viem";
import { network } from "./arc";

export const MOCK = network === "local";

/** The test business owner (Hardhat account #1). */
export const MOCK_OWNER_KEY: Hex = "0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d";
/** Mints the fake USDC (Hardhat account #0). Server only. */
export const MOCK_MINTER_KEY: Hex = "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80";
/** The test customer who pays invoices (Hardhat account #3). Server only. */
export const MOCK_CUSTOMER_KEY: Hex = "0x7c852118294e51e653712a81e05800f419141751be58f605c371e15141b007a6";
