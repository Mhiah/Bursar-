import Anthropic from "@anthropic-ai/sdk";
import { x402Client, x402HTTPClient } from "@x402/core/client";
import { registerExactEvmScheme } from "@x402/evm/exact/client";
import { parseUnits, type Hex } from "viem";
import { one, q } from "@/lib/db";
import { agentAddress, circle, circleChain } from "./wallet";

// Where the agent's thinking comes from:
//  - "blockrun": Claude through BlockRun on Circle's Agent Marketplace, paid per call in USDC
//    on Arc from the Circle agent wallet (x402). No Anthropic account needed.
//  - otherwise: Anthropic directly, with ANTHROPIC_API_KEY.
export const useBlockRun = () => (process.env.AI_PROVIDER || "").toLowerCase() === "blockrun";

const BLOCKRUN_URL = () => process.env.BLOCKRUN_URL || "https://arc.blockrun.ai/api";
/** The most one AI call may cost, in USDC. */
const maxPerCall = () => parseUnits(process.env.AI_MAX_USDC_PER_CALL || "0.10", 6);
/** The most the agent wallet may spend on AI in one day, across every business, in USDC. */
const maxPerDay = () => parseUnits(process.env.AI_MAX_USDC_PER_DAY || "2", 6);

const spentToday = async () => BigInt((await one<{ amount: string }>("SELECT amount FROM ai_spend WHERE day = CURRENT_DATE"))?.amount ?? 0);
const addSpend = (amount: bigint) =>
  q("INSERT INTO ai_spend (day, amount) VALUES (CURRENT_DATE, $1) ON CONFLICT (day) DO UPDATE SET amount = ai_spend.amount + $1", [amount.toString()]);

/** Signs x402 payments with the Circle agent wallet. */
const circleSigner = () => ({
  address: agentAddress() as Hex,
  async signTypedData({ domain, types, primaryType, message }: { domain: Record<string, unknown>; types: Record<string, unknown>; primaryType: string; message: Record<string, unknown> }) {
    const data = JSON.stringify({
      types: {
        EIP712Domain: [
          { name: "name", type: "string" },
          { name: "version", type: "string" },
          { name: "chainId", type: "uint256" },
          { name: "verifyingContract", type: "address" },
        ],
        ...types,
      },
      primaryType,
      domain: { ...domain, chainId: Number(domain.chainId) },
      message: Object.fromEntries(Object.entries(message).map(([k, v]) => [k, String(v)])),
    });
    const out = await circle(["wallet", "sign", "typed-data", data, "--address", agentAddress(), "--chain", circleChain()]);
    if (out?.error) throw new Error(out.error.code === "AUTH_REQUIRED" ? "Circle agent wallet is logged out. Run: npx circle wallet login <email> --type agent" : out.error.message);
    const sig = out?.data?.signature as Hex | undefined;
    if (!sig) throw new Error("Circle returned no signature");
    return sig;
  },
});

/** fetch that answers a 402 by paying from the Circle agent wallet, once, within the per-call cap. */
function payingFetch(): typeof fetch {
  let price = 0n;
  const client = new x402Client((_v, reqs) => {
    const arc = reqs.find((r) => r.network === "eip155:5042") ?? reqs[0];
    price = BigInt(arc.amount);
    if (BigInt(arc.amount) > maxPerCall()) {
      throw new Error(`AI call would cost ${Number(arc.amount) / 1e6} USDC, above AI_MAX_USDC_PER_CALL`);
    }
    return arc;
  });
  registerExactEvmScheme(client, { signer: circleSigner(), networks: ["eip155:5042"] });
  const http = new x402HTTPClient(client);

  return async (input, init) => {
    const res = await fetch(input, init);
    if (res.status !== 402) return res;
    let body: unknown;
    try {
      body = await res.clone().json();
    } catch {}
    const headers = new Headers(init?.headers);
    if ((await spentToday()) + maxPerCall() > maxPerDay()) return paymentError("The agent has reached today's AI spending limit (AI_MAX_USDC_PER_DAY).");
    try {
      const required = http.getPaymentRequiredResponse((h) => res.headers.get(h), body);
      const payload = await http.createPaymentPayload(required);
      for (const [k, v] of Object.entries(http.encodePaymentSignatureHeader(payload))) headers.set(k, v);
    } catch (e: any) {
      return paymentError(e?.message || String(e));
    }
    const paid = await fetch(input, { ...init, headers });
    if (paid.status !== 402) await addSpend(price);
    if (paid.status === 402) return paymentError("AI payment was refused. Check the agent wallet has USDC on Arc.");
    return paid;
  };
}

/** An error the Anthropic SDK reports with our message (a thrown fetch error would read "Connection error"). */
const paymentError = (message: string) =>
  new Response(JSON.stringify({ type: "error", error: { type: "payment_error", message } }), { status: 402, headers: { "content-type": "application/json" } });

export function aiClient() {
  if (!useBlockRun()) return new Anthropic();
  // No retries: each retry would be a new payment.
  return new Anthropic({ baseURL: BLOCKRUN_URL(), apiKey: "blockrun", maxRetries: 0, fetch: payingFetch() });
}
