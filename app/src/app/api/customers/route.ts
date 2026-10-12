import { getAddress, isAddress } from "viem";
import { z } from "zod";
import { body, handler, requireBusiness } from "@/lib/api";
import { newId, q } from "@/lib/db";
import { customerReliability } from "@/lib/reliability";
import { fromUnits } from "@/lib/money";

export const dynamic = "force-dynamic";

export const GET = handler(async () => {
  const b = await requireBusiness();
  const rows = await q("SELECT * FROM customers WHERE business_id = $1 ORDER BY name", [b.id]);
  const out = [];
  for (const c of rows) {
    const r = await customerReliability(b.id, c.id);
    out.push({ ...c, reliability: { ...r, outstanding: fromUnits(r.outstanding) } });
  }
  return { customers: out };
});

const Customer = z.object({
  name: z.string().trim().min(1).max(120),
  email: z.string().email().nullable().optional().or(z.literal("")),
  telegram_chat_id: z.string().trim().max(64).nullable().optional(),
  whatsapp: z.string().trim().max(32).nullable().optional(),
  wallet_address: z.string().refine(isAddress, "Not a wallet address").nullable().optional().or(z.literal("")),
});

export const POST = handler(async (req: Request) => {
  const b = await requireBusiness();
  const c = await body(req, Customer);
  const id = newId();
  await q(
    "INSERT INTO customers (id, business_id, name, email, telegram_chat_id, whatsapp, wallet_address) VALUES ($1,$2,$3,$4,$5,$6,$7)",
    [id, b.id, c.name, c.email || null, c.telegram_chat_id || null, c.whatsapp || null, c.wallet_address ? getAddress(c.wallet_address) : null],
  );
  return { id };
});
