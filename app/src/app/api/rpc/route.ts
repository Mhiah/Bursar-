import { NextResponse } from "next/server";
import { chain } from "@/lib/arc";

export const dynamic = "force-dynamic";

// The browser reads the chain through this site instead of calling the Arc RPC directly,
// which browsers can block. Only read methods and already-signed transactions pass.
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
  "eth_getBlockByNumber",
  "eth_getTransactionByHash",
  "eth_getTransactionReceipt",
  "eth_getTransactionCount",
]);

// The wallet made on this site signs in the browser and sends through here. The transaction is
// already signed by the owner, so relaying it gives this server no power over anyone's money.
READS.add("eth_sendRawTransaction");

const upstream = () => process.env.ARC_RPC_URL || chain.rpcUrls.default.http[0];

const MAX_BATCH = 20;
const PER_MINUTE = 300;
const hits = new Map<string, { n: number; reset: number }>();

/** A simple per-visitor limit, so nobody can use this as a free RPC and run down the app's quota. */
function limited(req: Request) {
  const ip = (req.headers.get("x-forwarded-for") || "").split(",")[0].trim() || "local";
  const now = Date.now();
  const h = hits.get(ip);
  if (!h || now > h.reset) {
    if (hits.size > 10_000) hits.clear();
    hits.set(ip, { n: 1, reset: now + 60_000 });
    return false;
  }
  return ++h.n > PER_MINUTE;
}

const refuse = (message: string, status = 400) => NextResponse.json({ jsonrpc: "2.0", id: null, error: { code: -32601, message } }, { status });

export async function POST(req: Request) {
  if (limited(req)) return refuse("Too many requests", 429);
  const payload = await req.json().catch(() => null);
  const calls = Array.isArray(payload) ? payload : [payload];
  if (!payload || calls.length > MAX_BATCH || calls.some((c) => !c || !READS.has(c.method))) return refuse("Method not allowed");
  // No state overrides: a plain read of the chain as it is.
  for (const c of calls) if ((c.method === "eth_call" || c.method === "eth_estimateGas") && Array.isArray(c.params)) c.params = c.params.slice(0, 2);
  const res = await fetch(upstream(), { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
  return new NextResponse(await res.text(), { status: res.status, headers: { "Content-Type": "application/json" } });
}
