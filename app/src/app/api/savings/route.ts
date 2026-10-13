import { handler, requireBusiness } from "@/lib/api";
import { q } from "@/lib/db";

export const dynamic = "force-dynamic";

/** The business's savings account, its plans and the latest moves into it. */
export const GET = handler(async () => {
  const b = await requireBusiness();
  const moves = await q(
    "SELECT id, pot, amount, source, status, tx_hash, error, created_at FROM savings_moves WHERE business_id = $1 ORDER BY created_at DESC LIMIT 20",
    [b.id],
  );
  return { savings: b.savings_address, plans: b.savings_plans ?? {}, moves };
});
