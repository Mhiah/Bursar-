import { NextResponse } from "next/server";
import { chain } from "@/lib/arc";

export const dynamic = "force-dynamic";

// The browser reads the chain through this site instead of calling the Arc RPC directly,
// which browsers can block. Only read methods pass; sending transactions stays in the user's wallet.
const READS = new Set([
  "eth_chainId",
  "eth_blockNumber",
  "eth_call",
  "eth_estimateGas",
  "eth_gasPrice",
  "eth_maxPriorityFeePerGas",
  "eth_feeHistory",
  "eth_getBalance",
  "eth_getCode",
  "eth_getLogs",
  "eth_getBlockByNumber",
  "eth_getTransactionByHash",
  "eth_getTransactionReceipt",
  "eth_getTransactionCount",
]);

const upstream = () => process.env.ARC_RPC_URL || chain.rpcUrls.default.http[0];

export async function POST(req: Request) {
  const payload = await req.json().catch(() => null);
  const calls = Array.isArray(payload) ? payload : [payload];
  if (!payload || calls.some((c) => !c || !READS.has(c.method))) {
    return NextResponse.json({ jsonrpc: "2.0", id: null, error: { code: -32601, message: "Method not allowed" } }, { status: 400 });
  }
  const res = await fetch(upstream(), { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
  return new NextResponse(await res.text(), { status: res.status, headers: { "Content-Type": "application/json" } });
}
