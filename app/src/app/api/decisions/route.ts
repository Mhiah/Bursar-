import { handler, requireBusiness } from "@/lib/api";
import { q } from "@/lib/db";
import { verifyLog } from "@/lib/decisions";

export const dynamic = "force-dynamic";

export const GET = handler(async (req: Request) => {
  const b = await requireBusiness();
  const limit = Math.min(500, Number(new URL(req.url).searchParams.get("limit") || 200));
  const rows = await q(
    "SELECT id, kind, summary, reasoning, data, hash, anchor_tx, created_at FROM decisions WHERE business_id = $1 ORDER BY seq DESC LIMIT $2",
    [b.id, limit],
  );
  return { decisions: rows, integrity: await verifyLog(b.id) };
});
