import { z } from "zod";
import { body, handler, requireBusiness } from "@/lib/api";
import { q } from "@/lib/db";

const Settings = z.object({
  operatingDays: z.number().int().min(1).max(180),
  maxInstalments: z.number().int().min(0).max(12),
  maxInstalmentDays: z.number().int().min(7).max(365),
  minInstalmentAmount: z.number().min(0),
  chaseChannels: z.array(z.enum(["email", "telegram", "whatsapp"])),
  chaseEveryDays: z.number().int().min(1).max(30),
  earlyPayDays: z.number().int().min(0).max(60),
});

export const POST = handler(async (req: Request) => {
  const b = await requireBusiness();
  const settings = await body(req, Settings.partial());
  await q("UPDATE businesses SET settings = settings || $1::jsonb WHERE id = $2", [JSON.stringify(settings), b.id]);
  return { ok: true };
});
