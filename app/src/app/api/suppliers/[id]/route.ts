import { getAddress, isAddress } from "viem";
import { z } from "zod";
import { body, handler, HttpError, requireBusiness } from "@/lib/api";
import { one, q } from "@/lib/db";
import { logDecision } from "@/lib/decisions";

const Input = z.object({ wallet_address: z.string().refine(isAddress, "Not a wallet address") });

/** Change a supplier's wallet. The old one is kept and the change is flagged on their next bills. */
export const PATCH = handler(async (req: Request, { params }: { params: Promise<{ id: string }> }) => {
  const { id } = await params;
  const b = await requireBusiness();
  const { wallet_address } = await body(req, Input);
  const s = await one<{ wallet_address: string; name: string }>("SELECT wallet_address, name FROM suppliers WHERE id = $1 AND business_id = $2", [id, b.id]);
  if (!s) throw new HttpError(404, "Supplier not found.");
  const next = getAddress(wallet_address);
  if (next === s.wallet_address) return { ok: true };
  await q("UPDATE suppliers SET previous_wallet = wallet_address, wallet_address = $1, wallet_changed_at = now() WHERE id = $2", [next, id]);
  await logDecision(b.id, "screen", `${s.name}'s wallet changed`, `From ${s.wallet_address} to ${next}. Bills to this supplier will need your approval for 30 days.`, {
    supplierId: id,
  });
  return { ok: true };
});
