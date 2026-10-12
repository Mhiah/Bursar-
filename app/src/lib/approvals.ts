import { getAddress, type Address } from "viem";
import { bursarVaultAbi } from "./abi/BursarVault";
import { publicClient } from "./chain";
import { q } from "./db";
import { logDecision } from "./decisions";
import { fromUnits } from "./money";

/** Bring bills waiting on the owner in line with the vault: approved ones are paid, rejected ones closed. */
export async function syncApprovals(businessId: string, vault: string) {
  const waiting = await q<{ id: string; approval_id: string; ref: string; amount: string; invoice_no: string; supplier: string }>(
    `SELECT bl.id, bl.approval_id, bl.ref, bl.amount, bl.invoice_no, s.name AS supplier FROM bills bl
     JOIN suppliers s ON s.id = bl.supplier_id
     WHERE bl.business_id = $1 AND bl.status = 'awaiting_approval' AND bl.approval_id IS NOT NULL`,
    [businessId],
  );
  const v = getAddress(vault) as Address;
  for (const w of waiting) {
    const p = await publicClient.readContract({ address: v, abi: bursarVaultAbi, functionName: "pending", args: [BigInt(w.approval_id)] });
    if (p.open) continue;
    const paid = await publicClient.readContract({ address: v, abi: bursarVaultAbi, functionName: "refPaid", args: [w.ref as `0x${string}`] });
    await q(`UPDATE bills SET status = $1, paid_at = CASE WHEN $1 = 'paid' THEN now() ELSE paid_at END WHERE id = $2`, [
      paid ? "paid" : "rejected",
      w.id,
    ]);
    await logDecision(
      businessId,
      "note",
      paid ? `You approved ${fromUnits(w.amount)} USDC to ${w.supplier}; it's paid` : `You rejected ${w.supplier}'s invoice ${w.invoice_no}`,
      "Recorded from the owner's signed decision on the vault.",
      { billId: w.id },
    );
  }
}
