import { getAddress } from "viem";
import { one, q } from "@/lib/db";
import { logDecision } from "@/lib/decisions";
import { sanctionsCheck, type Screening } from "@/lib/screening";
import type { Business } from "@/lib/session";

/** Once a day, check again every wallet the business deals with. A wallet that was fine
 * can turn up on a sanctions list later; the owner hears about it the day it changes. */
export async function recheckWallets(b: Business & { wallets_checked_at?: string | null }) {
  if (b.wallets_checked_at && Date.now() - new Date(b.wallets_checked_at).getTime() < 864e5) return 0;
  const wallets = await q<{ who: string; name: string; wallet: string }>(
    `SELECT 'supplier' AS who, name, wallet_address AS wallet FROM suppliers WHERE business_id = $1
     UNION ALL
     SELECT 'customer' AS who, name, wallet_address AS wallet FROM customers WHERE business_id = $1 AND wallet_address IS NOT NULL`,
    [b.id],
  );
  let flagged = 0;
  for (const w of wallets) {
    const before = await one<{ result: Screening }>("SELECT result FROM screenings WHERE address = $1", [getAddress(w.wallet)]);
    const now = await sanctionsCheck(w.wallet, { fresh: true });
    if (now.status === "blocked" && before?.result?.status !== "blocked") {
      flagged++;
      await logDecision(
        b.id,
        "attention",
        `${w.name}'s wallet is now on a sanctions list`,
        `On today's check, the wallet of your ${w.who} ${w.name} (${w.wallet}) came back flagged: ${now.reasons.map((r) => r.detail).join(" ")} The agent won't pay it. Check before you deal with them again.`,
        { wallet: w.wallet, screening: now },
      );
    }
  }
  await q("UPDATE businesses SET wallets_checked_at = now() WHERE id = $1", [b.id]);
  return flagged;
}
