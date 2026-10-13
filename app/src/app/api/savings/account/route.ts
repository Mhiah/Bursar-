import { getAddress } from "viem";
import { z } from "zod";
import { body, handler, HttpError, requireBusiness } from "@/lib/api";
import { SAVINGS_FACTORY } from "@/lib/arc";
import { bursarSavingsFactoryAbi } from "@/lib/abi/BursarSavingsFactory";
import { publicClient } from "@/lib/chain";
import { q } from "@/lib/db";
import { logDecision } from "@/lib/decisions";

const Input = z.object({ savings: z.string().regex(/^0x[0-9a-fA-F]{40}$/) });

/** Record the savings account the owner created. Checked against the chain, never trusted from the browser. */
export const POST = handler(async (req: Request) => {
  const b = await requireBusiness();
  if (b.savings_address) throw new HttpError(409, "This business already has a savings account.");
  if (!SAVINGS_FACTORY) throw new HttpError(500, "Savings isn't set up on this site yet.");
  const { savings } = await body(req, Input);
  const mine = await publicClient.readContract({
    address: SAVINGS_FACTORY,
    abi: bursarSavingsFactoryAbi,
    functionName: "savingsOf",
    args: [getAddress(b.owner_address)],
  });
  if (!mine.some((s) => getAddress(s) === getAddress(savings))) throw new HttpError(400, "That savings account wasn't created by your wallet.");
  await q("UPDATE businesses SET savings_address = $1 WHERE id = $2", [getAddress(savings), b.id]);
  await logDecision(b.id, "note", "Savings account opened", `Savings ${getAddress(savings)} is owned by your wallet. The agent can put money into its savings pots but can never take it out.`, {
    savings: getAddress(savings),
  });
  return { savings: getAddress(savings) };
});
