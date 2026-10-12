import { z } from "zod";
import { body, handler, HttpError } from "@/lib/api";
import { readVault } from "@/lib/chain";
import { newId, one } from "@/lib/db";
import { currentBusiness, defaultSettings, sessionAddress } from "@/lib/session";
import { fromUnits } from "@/lib/money";

export const dynamic = "force-dynamic";

export const GET = handler(async () => {
  const b = await currentBusiness();
  if (!b) return { business: null, address: sessionAddress() };
  let vault = null;
  if (b.vault_address) {
    const s = await readVault(b.vault_address as `0x${string}`);
    vault = {
      address: b.vault_address,
      balance: fromUnits(s.balance),
      operating: fromUnits(s.operating),
      reserve: fromUnits(s.reserve),
      cashFloor: fromUnits(s.cashFloor),
      maxPerPayment: fromUnits(s.maxPerPayment),
      paused: s.paused,
      agent: s.agent,
      owner: s.owner,
    };
  }
  return { business: { ...b, settings: { ...defaultSettings, ...b.settings } }, vault };
});

const Create = z.object({ name: z.string().trim().min(1).max(120), email: z.string().email().optional().or(z.literal("")) });

export const POST = handler(async (req: Request) => {
  const owner = sessionAddress();
  if (!owner) throw new HttpError(401, "Sign in first.");
  const { name, email } = await body(req, Create);
  const existing = await one("SELECT id FROM businesses WHERE owner_address = $1", [owner]);
  if (existing) throw new HttpError(409, "This wallet already has a business.");
  const id = newId();
  await one("INSERT INTO businesses (id, owner_address, name, email) VALUES ($1,$2,$3,$4) RETURNING id", [id, owner, name, email || null]);
  return { id };
});
