import { defineChain, type Address } from "viem";

export const arcTestnet = defineChain({
  id: 5042002,
  name: "Arc Testnet",
  nativeCurrency: { name: "USDC", symbol: "USDC", decimals: 18 },
  rpcUrls: { default: { http: ["https://rpc.testnet.arc.io"] } },
  blockExplorers: { default: { name: "Arcscan", url: "https://explorer.testnet.arc.io" } },
  contracts: { multicall3: { address: "0xcA11bde05977b3631167028862bE2a173976CA11" } },
  testnet: true,
});

export const arcMainnet = defineChain({
  id: 5042,
  name: "Arc",
  nativeCurrency: { name: "USDC", symbol: "USDC", decimals: 18 },
  rpcUrls: { default: { http: ["https://rpc.mainnet.arc.io"] } },
  blockExplorers: { default: { name: "Arcscan", url: "https://explorer.arc.io" } },
  contracts: { multicall3: { address: "0xcA11bde05977b3631167028862bE2a173976CA11" } },
});

/** A local Hardhat node, for development and the end-to-end test. */
export const localChain = defineChain({
  id: 31337,
  name: "Local",
  nativeCurrency: { name: "ETH", symbol: "ETH", decimals: 18 },
  rpcUrls: { default: { http: ["http://127.0.0.1:8545"] } },
  blockExplorers: { default: { name: "None", url: "http://127.0.0.1:8545" } },
});

export type Network = "testnet" | "mainnet" | "local";

const envNetwork = process.env.NEXT_PUBLIC_BURSAR_NETWORK;
export const network: Network = envNetwork === "mainnet" || envNetwork === "local" ? envNetwork : "testnet";

export const chain = network === "mainnet" ? arcMainnet : network === "local" ? localChain : arcTestnet;

/** Chain name App Kit uses for this network. */
export const appKitChain = network === "mainnet" ? "Arc" : "Arc_Testnet";

/** USDC's ERC-20 interface on Arc (6 decimals). Always use this, not the native balance. */
export const USDC: Address =
  network === "local" ? (process.env.NEXT_PUBLIC_LOCAL_USDC as Address) : "0x3600000000000000000000000000000000000000";

export const EURC: Address =
  network === "mainnet" ? "0xbEf5f6d51CB62b58e6A8f77868681825C6fe21c1" : "0x89B50855Aa3bE2F677cD6303Cec089B5F319D72a";

export const FACTORY = (process.env.NEXT_PUBLIC_FACTORY_ADDRESS || "") as Address;
export const AGENT_ADDRESS = (process.env.NEXT_PUBLIC_AGENT_ADDRESS || "") as Address;

export const explorerTx = (hash: string) => `${chain.blockExplorers.default.url}/tx/${hash}`;
export const explorerAddress = (addr: string) => `${chain.blockExplorers.default.url}/address/${addr}`;

/** Chains a customer can bridge USDC from, by App Kit name. */
export const bridgeSources: { id: string; label: string }[] =
  network === "mainnet"
    ? [
        { id: "Ethereum", label: "Ethereum" },
        { id: "Base", label: "Base" },
        { id: "Arbitrum", label: "Arbitrum" },
        { id: "Optimism", label: "OP Mainnet" },
        { id: "Polygon", label: "Polygon" },
        { id: "Avalanche", label: "Avalanche" },
        { id: "Linea", label: "Linea" },
        { id: "Unichain", label: "Unichain" },
        { id: "World_Chain", label: "World Chain" },
        { id: "Sonic", label: "Sonic" },
      ]
    : [
        { id: "Ethereum_Sepolia", label: "Ethereum Sepolia" },
        { id: "Base_Sepolia", label: "Base Sepolia" },
        { id: "Arbitrum_Sepolia", label: "Arbitrum Sepolia" },
        { id: "Optimism_Sepolia", label: "OP Sepolia" },
        { id: "Polygon_Amoy_Testnet", label: "Polygon Amoy" },
        { id: "Avalanche_Fuji", label: "Avalanche Fuji" },
        { id: "Linea_Sepolia", label: "Linea Sepolia" },
        { id: "Unichain_Sepolia", label: "Unichain Sepolia" },
      ];
