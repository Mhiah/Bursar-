import { z } from "zod";
import { body, handler, requireBusiness } from "@/lib/api";
import { one, q } from "@/lib/db";
import { fromUnits } from "@/lib/money";
import { recordWithdrawal } from "@/lib/withdrawals";

export const dynamic = "force-dynamic";

/** Every withdrawal from the business's vault, newest first: how much, to which wallet, when. */
export const GET = handler(async () => {
  const b = await requireBusiness();
  const rows = await q<{ tx_hash: string; to_address: string; amount: string; at: string }>(
    "SELECT tx_hash, to_address, amount::text, at FROM withdrawals WHERE business_id = $1 ORDER BY block_number DESC, log_index DESC LIMIT 200",
    [b.id],
  );
  const scan = await one<{ wd_back_done: boolean }>("SELECT wd_back_done FROM businesses WHERE id = $1", [b.id]);
  return { withdrawals: rows.map((r) => ({ ...r, amount: fromUnits(r.amount) })), loadingOlder: !scan?.wd_back_done };
});

/** The Withdraw page reports the withdrawal it just sent, so it is listed straight away. */
export const POST = handler(async (req: Request) => {
  const b = await requireBusiness();
  const { txHash } = await body(req, z.object({ txHash: z.string().regex(/^0x[0-9a-fA-F]{64}$/) }));
  return { ok: await recordWithdrawal(b, txHash as `0x${string}`) };
});
