import { getAddress, isAddress } from "viem";
import { z } from "zod";
import { body, handler, requireBusiness } from "@/lib/api";
import { newId, q } from "@/lib/db";
import { looksAlike, sanctionsCheck } from "@/lib/screening";

export const dynamic = "force-dynamic";

export const GET = handler(async () => {
  const b = await requireBusiness();
  return { suppliers: await q("SELECT * FROM suppliers WHERE business_id = $1 ORDER BY name", [b.id]) };
});

const Input = z.object({
  name: z.string().trim().min(1).max(120),
  email: z.string().email().optional().or(z.literal("")),
  wallet_address: z.string().refine(isAddress, "Not a wallet address"),
  category: z.string().trim().min(1).max(31),
});

export const POST = handler(async (req: Request) => {
  const b = await requireBusiness();
  const s = await body(req, Input);
  const wallet = getAddress(s.wallet_address);
  const id = newId();
  await q("INSERT INTO suppliers (id, business_id, name, email, wallet_address, category) VALUES ($1,$2,$3,$4,$5,$6)", [
    id, b.id, s.name, s.email || null, wallet, s.category.toLowerCase(),
  ]);
  // First look at the wallet so the owner sees problems before approving it on the vault.
  const others = await q<{ wallet_address: string; name: string }>("SELECT wallet_address, name FROM suppliers WHERE business_id = $1 AND id <> $2", [b.id, id]);
  const twin = others.find((o) => looksAlike(o.wallet_address, wallet));
  return { id, screening: await sanctionsCheck(wallet), lookalikeOf: twin?.name ?? null };
});
