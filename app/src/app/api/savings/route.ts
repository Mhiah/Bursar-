import { getAddress, type Address } from "viem";
import { bursarSavingsAbi } from "@/lib/abi/BursarSavings";
import { handler, requireBusiness } from "@/lib/api";
import { publicClient } from "@/lib/chain";
import { q } from "@/lib/db";
import { fromUnits } from "@/lib/money";

export const dynamic = "force-dynamic";

/** The business's savings account, how much is saved, its plans and the latest moves into it. */
export const GET = handler(async () => {
  const b = await requireBusiness();
  const moves = await q(
    "SELECT id, pot, amount, source, status, tx_hash, error, created_at FROM savings_moves WHERE business_id = $1 ORDER BY created_at DESC LIMIT 20",
    [b.id],
  );
  let total: string | null = null;
  if (b.savings_address) {
    // Everything in savings pots. Money still arriving isn't counted until it's in a pot.
    const allocated = await publicClient
      .readContract({ address: getAddress(b.savings_address) as Address, abi: bursarSavingsAbi, functionName: "allocated" })
      .catch(() => null);
    if (allocated !== null) total = fromUnits(allocated);
  }
  return { savings: b.savings_address, total, plans: b.savings_plans ?? {}, moves };
});
