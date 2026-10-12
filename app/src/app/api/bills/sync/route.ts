import { handler, requireBusiness } from "@/lib/api";
import { syncApprovals } from "@/lib/approvals";

/** Called after the owner signs an approve/reject on the vault, so the bill updates right away. */
export const PATCH = handler(async () => {
  const b = await requireBusiness();
  if (b.vault_address) await syncApprovals(b.id, b.vault_address);
  return { ok: true };
});
